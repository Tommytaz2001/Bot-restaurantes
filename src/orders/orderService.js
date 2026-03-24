const { db } = require('../services/firebaseService');
const { validateOrder } = require('./orderValidator');
const {
  collection, doc, setDoc, getDoc, updateDoc, query, where, getDocs, serverTimestamp,
} = require('firebase/firestore');
const { randomUUID } = require('crypto');

const COSTO_ENVIO = 40;

function buildEstado(metodoPago) {
  return metodoPago === 'efectivo' ? 'pendiente_pago' : 'pendiente';
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
  return { id, ...pedido };
}

async function getOrder(id) {
  const snapshot = await getDoc(doc(db, 'pedidos', id));
  if (!snapshot.exists()) return null;
  return { id: snapshot.id, ...snapshot.data() };
}

/**
 * Registra una solicitud de cambio sobre un pedido activo.
 * El chef la ve en la app y aprueba o rechaza.
 */
async function solicitarCambioPedido({ pedidoId, descripcionCambio }) {
  const ref = doc(db, 'pedidos', pedidoId);
  const snapshot = await getDoc(ref);
  if (!snapshot.exists()) throw new Error('Pedido no encontrado');

  await updateDoc(ref, {
    cambio_solicitado: {
      descripcion: descripcionCambio,
      estado: 'pendiente_chef',   // el chef lo actualizará a 'aprobado' o 'rechazado'
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

module.exports = { saveOrder, getOrder, solicitarCambioPedido, cancelarPedido, consultarEstadoPedido, estadoLegible };
