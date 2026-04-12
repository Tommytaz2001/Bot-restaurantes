const { db } = require('../services/firebaseService');
const { uploadComprobante } = require('../services/storageService');
const { enviarPushAlChef } = require('../services/pushService');
const { validateOrder } = require('./orderValidator');
const {
  collection, doc, setDoc, getDoc, updateDoc, query, where, getDocs, serverTimestamp,
} = require('firebase/firestore');
const { randomUUID } = require('crypto');

const COSTO_ENVIO = 40;

// transferencia → pendiente_pago (espera comprobante)
// efectivo     → pendiente     (paga al recibir, no necesita comprobante)
function buildEstado(metodoPago) {
  return metodoPago === 'transferencia' ? 'pendiente_pago' : 'pendiente';
}

async function findExistingOrder(sessionId) {
  const q = query(
    collection(db, 'pedidos'),
    where('sessionId', '==', sessionId),
    where('estado', 'in', ['pendiente', 'pendiente_pago']),
  );
  const snapshot = await getDocs(q);
  if (snapshot.empty) return null;
  const d = snapshot.docs[0];
  return { id: d.id, ...d.data() };
}

/**
 * Busca cualquier pedido activo (pendiente → en_camino) asociado a un teléfono.
 * Sirve para rehidratar el contexto del agente cuando la sesión en memoria expiró.
 */
async function findActiveOrderByPhone(telefono) {
  if (!telefono) return null;
  const q = query(
    collection(db, 'pedidos'),
    where('sessionId', '==', telefono),
    where('estado', 'in', ['pendiente', 'pendiente_pago', 'confirmado', 'en_camino']),
  );
  const snapshot = await getDocs(q);
  if (snapshot.empty) return null;
  const d = snapshot.docs[0];
  return { id: d.id, ...d.data() };
}

/**
 * Busca la dirección de la última entrega completada para un teléfono.
 * Permite ofrecer la dirección anterior a clientes frecuentes.
 */
async function findLastDeliveryAddress(telefono) {
  if (!telefono) return null;
  const q = query(
    collection(db, 'pedidos'),
    where('sessionId', '==', telefono),
    where('estado', '==', 'entregado'),
    where('tipo_entrega', '==', 'delivery'),
  );
  const snapshot = await getDocs(q);
  if (snapshot.empty) return null;
  let latest = null;
  for (const d of snapshot.docs) {
    const data = d.data();
    if (!latest || (data.createdAt?.toMillis?.() > latest.createdAt?.toMillis?.())) {
      latest = data;
    }
  }
  return latest?.direccion || null;
}

async function saveOrder(orderData) {
  // Check for duplicate active order in same session
  const existing = await findExistingOrder(orderData.sessionId);
  if (existing) return existing;

  // Validate schema
  validateOrder(orderData);

  const costoEnvio = orderData.tipo_entrega === 'delivery' ? COSTO_ENVIO : 0;
  const subtotal = orderData.productos.reduce(
    (sum, p) => sum + p.precio_unitario * p.cantidad,
    0,
  );

  const id = randomUUID();
  const pedido = {
    ...orderData,
    estado: buildEstado(orderData.metodo_pago),
    comprobante_url: null,
    createdAt: serverTimestamp(),
    costo_envio: costoEnvio,         // overwrite — never trust LLM value
    total: subtotal + costoEnvio,    // overwrite — backend is source of truth
    productos: orderData.productos.map((p) => ({
      ...p,
      opcion: p.opcion ?? null,
    })),
  };

  await setDoc(doc(db, 'pedidos', id), pedido);

  // Push notification al chef (no-blocking)
  const tipoEntrega = orderData.tipo_entrega === 'delivery' ? 'Delivery' : 'Retiro';
  enviarPushAlChef(
    orderData.restauranteId,
    '🍔 Nuevo pedido',
    `${orderData.cliente ?? 'Cliente'} — ${subtotal + costoEnvio} · ${tipoEntrega}`,
  ).catch(() => {});

  return { id, ...pedido };
}

async function getOrder(id) {
  const snapshot = await getDoc(doc(db, 'pedidos', id));
  if (!snapshot.exists()) return null;
  return { id: snapshot.id, ...snapshot.data() };
}

/**
 * Busca el pedido activo en estado pendiente_pago para un sessionId dado.
 * Retorna el pedido o null si no existe.
 */
async function findPedidoPendientePago(sessionId) {
  const q = query(
    collection(db, 'pedidos'),
    where('sessionId', '==', sessionId),
    where('estado', '==', 'pendiente_pago'),
  );
  const snapshot = await getDocs(q);
  if (snapshot.empty) return null;
  const d = snapshot.docs[0];
  return { id: d.id, ...d.data() };
}

/**
 * Sube el comprobante de pago a Firebase Storage y actualiza el pedido:
 * - Guarda comprobante_url
 * - Cambia estado de pendiente_pago → pendiente (listo para que el chef confirme)
 */
async function attachComprobante(pedidoId, imageBuffer, mimeType) {
  const url = await uploadComprobante(pedidoId, imageBuffer, mimeType);
  await updateDoc(doc(db, 'pedidos', pedidoId), {
    comprobante_url: url,
    estado: 'pendiente',
    comprobanteAt: serverTimestamp(),
  });
  return url;
}

/**
 * Registra una solicitud de cambio sobre un pedido activo.
 * El chef la ve en la app y aprueba o rechaza.
 */
async function solicitarCambioPedido({ pedidoId, descripcionCambio, tipo = 'modificacion', productosNuevos = null }) {
  const ref = doc(db, 'pedidos', pedidoId);
  const snapshot = await getDoc(ref);
  if (!snapshot.exists()) throw new Error('Pedido no encontrado');

  let totalNuevo = null;
  let productosNormalizados = null;

  if (tipo === 'agregar_productos' && productosNuevos?.length > 0) {
    const pedidoActual = snapshot.data();
    const subtotalNuevos = productosNuevos.reduce(
      (sum, p) => sum + p.precio_unitario * p.cantidad,
      0,
    );
    totalNuevo = pedidoActual.total + subtotalNuevos;
    productosNormalizados = productosNuevos.map((p) => ({ ...p, opcion: p.opcion ?? null }));
  }

  await updateDoc(ref, {
    cambio_solicitado: {
      tipo,
      descripcion: descripcionCambio,
      productos_nuevos: productosNormalizados,
      total_nuevo: totalNuevo,
      estado: 'pendiente_chef',
      solicitadoAt: serverTimestamp(),
    },
  });

  return { pedidoId, descripcionCambio };
}

/**
 * Cancela un pedido si aún está en estado pendiente.
 * Solo se puede cancelar antes de que el chef lo confirme.
 */
async function cancelarPedido({ pedidoId }) {
  const ref = doc(db, 'pedidos', pedidoId);
  const snapshot = await getDoc(ref);
  if (!snapshot.exists()) throw new Error('Pedido no encontrado');

  const { estado } = snapshot.data();
  const cancelable = ['pendiente', 'pendiente_pago'];
  if (!cancelable.includes(estado)) {
    throw new Error(`El pedido ya no puede cancelarse (estado: ${estado})`);
  }

  await updateDoc(ref, { estado: 'cancelado', canceladoAt: serverTimestamp() });
  return { pedidoId, cancelado: true };
}

/**
 * Consulta el estado actual de un pedido.
 */
async function consultarEstadoPedido({ pedidoId }) {
  const snapshot = await getDoc(doc(db, 'pedidos', pedidoId));
  if (!snapshot.exists()) throw new Error('Pedido no encontrado');
  const { estado, cliente, productos } = snapshot.data();
  return { pedidoId, estado, cliente, productos };
}

const ESTADOS_LEGIBLES = {
  pendiente: 'pendiente de confirmación por el chef',
  pendiente_pago: 'pendiente — esperando confirmación de pago',
  confirmado: 'confirmado por el chef, en preparación',
  en_camino: 'en camino a tu dirección',
  entregado: 'entregado',
  cancelado: 'cancelado',
};

function estadoLegible(estado) {
  return ESTADOS_LEGIBLES[estado] ?? estado;
}

module.exports = { saveOrder, getOrder, findPedidoPendientePago, attachComprobante, solicitarCambioPedido, cancelarPedido, consultarEstadoPedido, estadoLegible, findActiveOrderByPhone, findLastDeliveryAddress };
