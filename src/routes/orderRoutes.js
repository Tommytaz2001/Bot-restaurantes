const express = require('express');
const { getOrder } = require('../orders/orderService');
const { db } = require('../services/firebaseService');
const { doc, updateDoc } = require('firebase/firestore');
const { sendWhatsAppMessage } = require('../whatsapp/metaSender');
const { encolarNotificacion } = require('../services/notificacionQueue');

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
  try {
    await sendWhatsAppMessage(order.telefono, mensaje);
  } catch (err) {
    await encolarNotificacion({ telefono: order.telefono, mensaje, pedidoId: order.id });
    throw new Error(`WhatsApp no disponible — notificación encolada: ${err.message}`);
  }
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
      await updateDoc(doc(db, 'pedidos', order.id), { tiempo_estimado_min: mins });
    }

    // Marcar como enviada ANTES de enviar para que el listener de Firestore no duplique
    await updateDoc(doc(db, 'pedidos', order.id), {
      [`notificaciones_enviadas.${tipo}`]: true,
    });

    await enviarNotificacion(order, mensaje);

    console.log(`[orderRoutes] Notificación "${tipo}" enviada a ${order.telefono}`);
    return res.json({ ok: true });
  } catch (err) {
    console.error('[orderRoutes] Error notificando:', err.message);
    return res.status(503).json({ error: err.message });
  }
});

module.exports = router;
