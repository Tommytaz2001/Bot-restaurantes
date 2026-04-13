const { db } = require('./firebaseService');
const {
  collection, doc, query, where, onSnapshot,
} = require('firebase/firestore');
const { serializeDoc } = require('../utils/firestoreUtils');

const RESTAURANTE_ID = process.env.RESTAURANTE_ID ?? 'urbano';
const ESTADOS_ACTIVOS = ['pendiente', 'pendiente_pago', 'confirmado', 'en_camino'];
const KEEPALIVE_MS = 25_000;

/**
 * Envía los headers necesarios para una conexión SSE y deshabilita el timeout.
 */
function initSseHeaders(res) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // para nginx
  res.flushHeaders();
}

/**
 * Convierte un array de QueryDocumentSnapshot a objetos serializados.
 */
function docsToJson(docs) {
  return docs.map((d) => serializeDoc({ id: d.id, ...d.data() }));
}

/**
 * Stream SSE de pedidos activos (pendiente, pendiente_pago, confirmado, en_camino).
 */
function createPedidosActivosStream(res) {
  initSseHeaders(res);

  const q = query(
    collection(db, 'pedidos'),
    where('restauranteId', '==', RESTAURANTE_ID),
    where('estado', 'in', ESTADOS_ACTIVOS),
  );

  const unsub = onSnapshot(
    q,
    (snapshot) => {
      const pedidos = docsToJson(snapshot.docs);
      res.write(`data: ${JSON.stringify(pedidos)}\n\n`);
    },
    (err) => {
      console.error('[SSE activos] Firestore error:', err.message);
      res.write(`event: error\ndata: ${JSON.stringify({ message: err.message })}\n\n`);
    },
  );

  const keepalive = setInterval(() => res.write(': keepalive\n\n'), KEEPALIVE_MS);

  res.on('close', () => {
    clearInterval(keepalive);
    unsub();
  });
}

/**
 * Stream SSE de historial de pedidos (entregado, cancelado).
 */
function createHistorialStream(res) {
  initSseHeaders(res);

  const q = query(
    collection(db, 'pedidos'),
    where('restauranteId', '==', RESTAURANTE_ID),
    where('estado', 'in', ['entregado', 'cancelado']),
  );

  const unsub = onSnapshot(
    q,
    (snapshot) => {
      const pedidos = docsToJson(snapshot.docs);
      res.write(`data: ${JSON.stringify(pedidos)}\n\n`);
    },
    (err) => {
      console.error('[SSE historial] Firestore error:', err.message);
      res.write(`event: error\ndata: ${JSON.stringify({ message: err.message })}\n\n`);
    },
  );

  const keepalive = setInterval(() => res.write(': keepalive\n\n'), KEEPALIVE_MS);

  res.on('close', () => {
    clearInterval(keepalive);
    unsub();
  });
}

/**
 * Stream SSE de un pedido individual por ID.
 */
function createPedidoDetalleStream(res, pedidoId) {
  initSseHeaders(res);

  const unsub = onSnapshot(
    doc(db, 'pedidos', pedidoId),
    (snap) => {
      if (!snap.exists()) {
        res.write(`event: not_found\ndata: ${JSON.stringify({ id: pedidoId })}\n\n`);
        return;
      }
      const pedido = serializeDoc({ id: snap.id, ...snap.data() });
      res.write(`data: ${JSON.stringify(pedido)}\n\n`);
    },
    (err) => {
      console.error(`[SSE detalle:${pedidoId}] Firestore error:`, err.message);
      res.write(`event: error\ndata: ${JSON.stringify({ message: err.message })}\n\n`);
    },
  );

  const keepalive = setInterval(() => res.write(': keepalive\n\n'), KEEPALIVE_MS);

  res.on('close', () => {
    clearInterval(keepalive);
    unsub();
  });
}

module.exports = {
  createPedidosActivosStream,
  createHistorialStream,
  createPedidoDetalleStream,
};
