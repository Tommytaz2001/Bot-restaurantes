const express = require('express');
const { getOrder } = require('../orders/orderService');

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

router.post('/:id/notificar', async (req, res) => {
  try {
    const { tipo } = req.body;
    const mensaje = MENSAJES_NOTIFICACION[tipo];
    if (!mensaje) return res.status(400).json({ error: 'tipo inválido. Usa: en_camino | entregado' });

    const order = await getOrder(req.params.id);
    if (!order) return res.status(404).json({ error: 'Pedido no encontrado' });

    const { getSock } = require('../whatsapp/baileys');
    const sock = getSock();
    if (!sock) return res.status(503).json({ error: 'WhatsApp no conectado' });

    const jid = `${order.telefono}@s.whatsapp.net`;
    await sock.sendMessage(jid, { text: mensaje });

    console.log(`[orderRoutes] Notificación "${tipo}" enviada a ${order.telefono}`);
    return res.json({ ok: true });
  } catch (err) {
    console.error('[orderRoutes] Error notificando:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
