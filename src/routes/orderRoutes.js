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

async function enviarNotificacion(order, mensaje, intentos = 3, delayMs = 2000) {
  const { getSock } = require('../whatsapp/baileys');
  // Usar jid guardado en Firestore (puede ser @lid o @s.whatsapp.net), sino reconstruir
  const jid = order.jid || `${order.telefono}@s.whatsapp.net`;
  for (let i = 1; i <= intentos; i++) {
    const sock = getSock();
    if (sock && sock.user) {
      await sock.sendMessage(jid, { text: mensaje });
      return;
    }
    if (i < intentos) {
      console.log(`[orderRoutes] WhatsApp no listo, reintentando (${i}/${intentos})...`);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw new Error('WhatsApp no conectado después de varios intentos');
}

router.post('/:id/notificar', async (req, res) => {
  try {
    const { tipo } = req.body;
    const mensaje = MENSAJES_NOTIFICACION[tipo];
    if (!mensaje) return res.status(400).json({ error: 'tipo inválido. Usa: en_camino | entregado' });

    const order = await getOrder(req.params.id);
    if (!order) return res.status(404).json({ error: 'Pedido no encontrado' });

    await enviarNotificacion(order, mensaje);

    console.log(`[orderRoutes] Notificación "${tipo}" enviada a ${order.jid || order.telefono}`);
    return res.json({ ok: true });
  } catch (err) {
    console.error('[orderRoutes] Error notificando:', err.message);
    return res.status(503).json({ error: err.message });
  }
});

module.exports = router;
