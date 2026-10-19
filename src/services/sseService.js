const { getPedidosActivos, fetchHistorial } = require('./pedidosAdminService');
const { getOrder } = require('../orders/orderService');
const { orderEvents } = require('./orderEvents');

const RESTAURANTE_ID = process.env.RESTAURANTE_ID ?? 'urbano';
const KEEPALIVE_MS = 25_000;

function initSseHeaders(res) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Para proxy inverso / Nginx
  res.flushHeaders();
}

/**
 * Stream SSE de pedidos activos en tiempo real.
 * Empuja la lista completa cada vez que se crea, actualiza o cancela un pedido.
 */
function createPedidosActivosStream(res, restauranteId = RESTAURANTE_ID) {
  initSseHeaders(res);

  // 1. Envío inicial inmediato
  const sendSnapshot = async () => {
    try {
      const pedidos = await getPedidosActivos(restauranteId);
      res.write(`data: ${JSON.stringify(pedidos)}\n\n`);
    } catch (err) {
      console.error('[SSE activos] Error obteniendo snapshot:', err.message);
      res.write(`event: error\ndata: ${JSON.stringify({ message: err.message })}\n\n`);
    }
  };

  sendSnapshot();

  // 2. Suscribirse a eventos locales de pedidos
  const handleUpdate = (data) => {
    if (!data.restauranteId || data.restauranteId === restauranteId) {
      sendSnapshot();
    }
  };

  orderEvents.on('order:created', handleUpdate);
  orderEvents.on('order:updated', handleUpdate);
  orderEvents.on('order:cancelled', handleUpdate);

  // 3. Heartbeat keepalive
  const keepalive = setInterval(() => {
    res.write(': keepalive\n\n');
  }, KEEPALIVE_MS);

  // 4. Limpieza al desconectar
  res.on('close', () => {
    clearInterval(keepalive);
    orderEvents.off('order:created', handleUpdate);
    orderEvents.off('order:updated', handleUpdate);
    orderEvents.off('order:cancelled', handleUpdate);
  });
}

/**
 * Stream SSE de historial de pedidos.
 */
function createHistorialStream(res, restauranteId = RESTAURANTE_ID) {
  initSseHeaders(res);

  const sendSnapshot = async () => {
    try {
      const { pedidos } = await fetchHistorial({ filtro: 'todos' });
      res.write(`data: ${JSON.stringify(pedidos)}\n\n`);
    } catch (err) {
      console.error('[SSE historial] Error obteniendo snapshot:', err.message);
    }
  };

  sendSnapshot();

  const handleUpdate = (data) => {
    if (['entregado', 'cancelado'].includes(data.pedido?.estado)) {
      sendSnapshot();
    }
  };

  orderEvents.on('order:updated', handleUpdate);
  orderEvents.on('order:cancelled', handleUpdate);

  const keepalive = setInterval(() => res.write(': keepalive\n\n'), KEEPALIVE_MS);

  res.on('close', () => {
    clearInterval(keepalive);
    orderEvents.off('order:updated', handleUpdate);
    orderEvents.off('order:cancelled', handleUpdate);
  });
}

/**
 * Stream SSE de un pedido individual.
 */
function createPedidoDetalleStream(res, pedidoId) {
  initSseHeaders(res);

  const sendSingle = async () => {
    try {
      const pedido = await getOrder(pedidoId);
      if (pedido) {
        res.write(`data: ${JSON.stringify(pedido)}\n\n`);
      }
    } catch (err) {
      console.error(`[SSE pedido ${pedidoId}] Error:`, err.message);
    }
  };

  sendSingle();

  const handleUpdate = (data) => {
    if (data.pedido?.id === pedidoId) {
      sendSingle();
    }
  };

  orderEvents.on('order:updated', handleUpdate);

  const keepalive = setInterval(() => res.write(': keepalive\n\n'), KEEPALIVE_MS);

  res.on('close', () => {
    clearInterval(keepalive);
    orderEvents.off('order:updated', handleUpdate);
  });
}

module.exports = {
  createPedidosActivosStream,
  createHistorialStream,
  createPedidoDetalleStream,
};
