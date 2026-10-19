const express = require('express');
const { getOrder } = require('../orders/orderService');
const { query } = require('../db/connection');
const { sendWhatsAppMessage } = require('../whatsapp/metaSender');

const router = express.Router();

router.get('/:id', async (req, res) => {
  try {
    const order = await getOrder(req.params.id);
    if (!order) {
      return res.status(404).json({ error: 'Pedido no encontrado' });
    }
    return res.json(order);
  } catch (err) {
    console.error('[orderRoutes] Error:', err.message);
    return res.status(503).json({ error: 'Servicio temporalmente no disponible' });
  }
});

const MENSAJES_NOTIFICACION = {
  confirmado:  '✅ ¡Tu pedido fue confirmado! Ya estamos preparando tu pedido. 🍔',
  rechazado:   '❌ Lo sentimos, tu pedido no pudo ser procesado en este momento. Por favor contáctanos si necesitas ayuda.',
  en_camino:   '🛵 ¡Tu pedido está en camino! Pronto llegará a tu dirección. 😊',
  entregado:   '✅ ¡Tu pedido fue entregado! Gracias por tu preferencia. ¡Hasta pronto! 🍔',
  cambio_aprobado:  '✅ Tu solicitud de cambio fue aprobada. Seguimos preparando tu pedido. 🍔',
  cambio_rechazado: '❌ Tu solicitud de cambio no pudo ser aplicada. Tu pedido original sigue en proceso.',
};

async function enviarNotificacion(order, mensaje) {
  const destino = order.jid || order.telefono;
  await sendWhatsAppMessage(destino, mensaje);
}

router.post('/:id/notificar', async (req, res) => {
  try {
    const { tipo, tiempoEstimadoMin } = req.body;
    if (!MENSAJES_NOTIFICACION[tipo]) return res.status(400).json({ error: 'tipo inválido.' });

    const order = await getOrder(req.params.id);
    if (!order) return res.status(404).json({ error: 'Pedido no encontrado' });

    let mensaje = MENSAJES_NOTIFICACION[tipo];
    if (tipo === 'confirmado' && tiempoEstimadoMin) {
      const mins = Number(tiempoEstimadoMin);
      mensaje = `✅ ¡Tu pedido fue confirmado! Ya estamos preparando tu pedido. 🍔\n\n🕐 Tiempo estimado: *${mins} minutos*.`;
      await query('UPDATE pedidos SET tiempo_estimado_min = $1 WHERE id = $2', [mins, order.id]);
    }

    const notifObj = { ...order.notificaciones_enviadas, [tipo]: true };
    await query('UPDATE pedidos SET notificaciones_enviadas = $1 WHERE id = $2', [
      JSON.stringify(notifObj),
      order.id,
    ]);

    await enviarNotificacion(order, mensaje);
    console.log(`[orderRoutes] Notificación "${tipo}" enviada a ${order.telefono}`);
    return res.json({ ok: true });
  } catch (err) {
    console.error('[orderRoutes] Error notificando:', err.message);
    return res.status(503).json({ error: err.message });
  }
});

module.exports = router;
