const { db, trackWrite, trackRead } = require('./firebaseService');
const {
  doc, getDoc, collection, getDocs, updateDoc, query, where, orderBy, limit, startAfter,
  serverTimestamp,
} = require('firebase/firestore');
const { serializeDoc } = require('../utils/firestoreUtils');

const RESTAURANTE_ID = process.env.RESTAURANTE_ID ?? 'urbano';
const PAGE_SIZE = 20;

// ─── Helpers de fecha ────────────────────────────────────────────────────────

function getDateRange(filtro) {
  const now = new Date();
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

  switch (filtro) {
    case 'hoy':
      return { desde: startOfDay(now) };
    case 'ayer': {
      const ayer = new Date(now);
      ayer.setDate(ayer.getDate() - 1);
      return { desde: startOfDay(ayer), hasta: startOfDay(now) };
    }
    case '7dias': {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      return { desde: startOfDay(d) };
    }
    case '30dias': {
      const d = new Date(now);
      d.setDate(d.getDate() - 30);
      return { desde: startOfDay(d) };
    }
    default:
      return {};
  }
}

// ─── Writes ───────────────────────────────────────────────────────────────────

async function actualizarEstado(id, data) {
  trackWrite('pedidosAdmin:actualizarEstado', `pedido=${id}`);
  await updateDoc(doc(db, 'pedidos', id), data);
}

async function confirmarPedidoConETA(id, tiempoEstimadoMin) {
  const update = { estado: 'confirmado' };
  if (tiempoEstimadoMin) update.tiempo_estimado_min = tiempoEstimadoMin;
  await actualizarEstado(id, update);
}

async function marcarEnCamino(id) {
  await actualizarEstado(id, { estado: 'en_camino' });
}

async function marcarEntregado(id) {
  await actualizarEstado(id, { estado: 'entregado', entregadoAt: serverTimestamp() });
}

async function rechazarPedido(id) {
  await actualizarEstado(id, { estado: 'cancelado', canceladoAt: serverTimestamp() });
}

async function aprobarCambio(id) {
  trackRead('pedidosAdmin:aprobarCambio', `pedido=${id}`);
  const snap = await getDoc(doc(db, 'pedidos', id));
  if (!snap.exists()) throw new Error(`Pedido no encontrado: ${id}`);

  const pedido = snap.data();
  const cambio = pedido.cambio_solicitado;
  if (!cambio) throw new Error(`Pedido ${id} no tiene cambio_solicitado`);

  const updateData = {
    'cambio_solicitado.estado': 'aprobado',
    'cambio_solicitado.respondidoAt': serverTimestamp(),
  };

  if (
    cambio.tipo === 'agregar_productos' &&
    cambio.productos_nuevos?.length &&
    cambio.total_nuevo != null
  ) {
    updateData.productos = [...pedido.productos, ...cambio.productos_nuevos];
    updateData.total = cambio.total_nuevo;
  }

  if (cambio.tipo === 'cambiar_entrega' && cambio.datos_entrega) {
    const { tipo_entrega, direccion, costo_envio, total_nuevo } = cambio.datos_entrega;
    updateData.tipo_entrega = tipo_entrega;
    updateData.direccion = direccion ?? null;
    updateData.costo_envio = costo_envio;
    updateData.total = total_nuevo;
  }

  trackWrite('pedidosAdmin:aprobarCambio', `pedido=${id} tipo=${cambio.tipo}`);
  await updateDoc(doc(db, 'pedidos', id), updateData);
}

async function rechazarCambio(id) {
  await actualizarEstado(id, {
    'cambio_solicitado.estado': 'rechazado',
    'cambio_solicitado.respondidoAt': serverTimestamp(),
  });
}

// ─── Historial paginado ───────────────────────────────────────────────────────

/**
 * @param {object} options
 * @param {string} options.filtro - 'todos' | 'hoy' | 'ayer' | '7dias' | '30dias'
 * @param {string|null} [options.afterTs] - ISO string del createdAt del último doc de la página anterior
 * @returns {{ pedidos: object[], afterTs: string|null, hasMore: boolean }}
 */
async function fetchHistorial({ filtro = 'todos', afterTs = null }) {
  const t0 = Date.now();
  const { desde, hasta } = getDateRange(filtro);

  const constraints = [
    where('restauranteId', '==', RESTAURANTE_ID),
    where('estado', 'in', ['entregado', 'cancelado']),
  ];

  if (desde) constraints.push(where('createdAt', '>=', desde));
  if (hasta) constraints.push(where('createdAt', '<', hasta));

  constraints.push(orderBy('createdAt', 'desc'));
  constraints.push(limit(PAGE_SIZE + 1));

  if (afterTs) constraints.push(startAfter(new Date(afterTs)));

  let snapshot;
  try {
    snapshot = await getDocs(query(collection(db, 'pedidos'), ...constraints));
    trackRead('pedidosAdmin:fetchHistorial', `filtro=${filtro}`, snapshot.docs.length);
  } catch (indexErr) {
    console.warn(`[fetchHistorial] Index missing, using fallback: ${indexErr?.message}`);
    const fallback = [
      where('restauranteId', '==', RESTAURANTE_ID),
      where('estado', 'in', ['entregado', 'cancelado']),
    ];
    snapshot = await getDocs(query(collection(db, 'pedidos'), ...fallback));
    trackRead('pedidosAdmin:fetchHistorial:fallback', `filtro=${filtro}`, snapshot.docs.length);

    let pedidos = snapshot.docs.map((d) => serializeDoc({ id: d.id, ...d.data() }));
    if (desde) {
      const desdeMs = desde.getTime();
      pedidos = pedidos.filter((p) => (p.createdAt ? new Date(p.createdAt).getTime() : 0) >= desdeMs);
    }
    if (hasta) {
      const hastaMs = hasta.getTime();
      pedidos = pedidos.filter((p) => (p.createdAt ? new Date(p.createdAt).getTime() : 0) < hastaMs);
    }
    pedidos.sort((a, b) => new Date(b.createdAt ?? 0) - new Date(a.createdAt ?? 0));
    console.log(`[fetchHistorial] fallback done in ${Date.now() - t0}ms`);
    return { pedidos: pedidos.slice(0, PAGE_SIZE), afterTs: null, hasMore: false };
  }

  const hasMore = snapshot.docs.length > PAGE_SIZE;
  const docs = hasMore ? snapshot.docs.slice(0, PAGE_SIZE) : snapshot.docs;
  const pedidos = docs.map((d) => serializeDoc({ id: d.id, ...d.data() }));
  const lastDoc = docs.length > 0 ? docs[docs.length - 1] : null;
  const nextAfterTs = lastDoc?.data().createdAt?.toDate().toISOString() ?? null;

  console.log(`[fetchHistorial] done in ${Date.now() - t0}ms — ${docs.length} docs, hasMore=${hasMore}`);
  return { pedidos, afterTs: nextAfterTs, hasMore };
}

module.exports = {
  confirmarPedidoConETA,
  marcarEnCamino,
  marcarEntregado,
  rechazarPedido,
  aprobarCambio,
  rechazarCambio,
  fetchHistorial,
};
