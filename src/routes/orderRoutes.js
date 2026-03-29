const express = require('express');
const { getOrder } = require('../orders/orderService');
const { db } = require('../services/firebaseService');
const { doc, updateDoc } = require('firebase/firestore');

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
  const { encolarNotificacion } = require('../services/notificacionQueue');
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
  // Todos los reintentos fallaron — persistir en Firestore para envío automático al reconectar
  await encolarNotificacion({ jid, mensaje, pedidoId: order.id });
  throw new Error('WhatsApp no conectado — notificación encolada para reintento automático');
}

router.post('/:id/notificar', async (req, res) => {
  try {
    const { tipo, tiempoEstimadoMin } = req.body;
    if (!MENSAJES_NOTIFICACION[tipo]) return res.status(400).json({ error: 'tipo inválido.' });

    const order = await getOrder(req.params.id);
    if (!order) return res.status(404).json({ error: 'Pedido no encontrado' });

    // Personalizar mensaje de confirmado con ETA si se proporcionó
    let mensaje = MENSAJES_NOTIFICACION[tipo];
    if (tipo === 'confirmado' && tiempoEstimadoMin) {
      const mins = Number(tiempoEstimadoMin);
      mensaje = `✅ ¡Tu pedido fue confirmado! Ya estamos preparando tu pedido. 🍔\n\n🕐 Tiempo estimado: *${mins} minutos*.`;
      // Guardar tiempo estimado en el pedido
      await updateDoc(doc(db, 'pedidos', order.id), { tiempo_estimado_min: mins });
    }

    await enviarNotificacion(order, mensaje);

    console.log(`[orderRoutes] Notificación "${tipo}" enviada a ${order.jid || order.telefono}`);
    return res.json({ ok: true });
  } catch (err) {
    console.error('[orderRoutes] Error notificando:', err.message);
    return res.status(503).json({ error: err.message });
  }
});

module.exports = router;
