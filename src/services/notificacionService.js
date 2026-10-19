const { query } = require('../db/connection');
const { sendWhatsAppMessage } = require('../whatsapp/metaSender');
const { orderEvents } = require('./orderEvents');

const MENSAJES = {
  confirmado:       '✅ ¡Tu pedido fue confirmado! Ya estamos preparando tu pedido. 🍔',
  cancelado:        '❌ Lo sentimos, tu pedido no pudo ser procesado en este momento. Por favor contáctanos si necesitas ayuda.',
  en_camino:        '🛵 ¡Tu pedido está en camino! Pronto llegará a tu dirección. 😊',
  entregado:        '✅ ¡Tu pedido fue entregado! Gracias por tu preferencia. ¡Hasta pronto! 🍔',
  cambio_aprobado:  '✅ Tu solicitud de cambio fue aprobada. Seguimos preparando tu pedido. 🍔',
  cambio_rechazado: '❌ Tu solicitud de cambio no pudo ser aplicada. Tu pedido original sigue en proceso.',
};

function iniciarListenerNotificaciones() {
  console.log('[Notificaciones] Listener de eventos de pedido iniciado.');

  orderEvents.on('order:updated', async ({ pedido }) => {
    if (!pedido) return;
    try {
      const { id, estado, telefono, jid, tipo_entrega, cambio_solicitado, notificaciones_enviadas = {} } = pedido;
      const destino = jid || telefono;
      if (!destino) return;

      const pendientes = [];

      // Notificaciones por estado principal
      if (MENSAJES[estado] && !notificaciones_enviadas[estado]) {
        let mensaje;
        if (estado === 'en_camino' && tipo_entrega === 'retiro') {
          mensaje = '🏪 ¡Tu pedido está listo! Puedes pasar a retirarlo cuando quieras. 😊';
        } else if (estado === 'confirmado' && pedido.tiempo_estimado_min) {
          mensaje = `✅ ¡Tu pedido fue confirmado! Ya estamos preparando tu pedido. 🍔\n\n🕐 Tiempo estimado: *${pedido.tiempo_estimado_min} minutos*.`;
        } else {
          mensaje = MENSAJES[estado];
        }
        pendientes.push({ clave: estado, mensaje });
      }

      // Notificaciones por cambio solicitado
      const estadoCambio = cambio_solicitado?.estado;
      if (estadoCambio === 'aprobado' && !notificaciones_enviadas.cambio_aprobado) {
        let mensajeCambio = MENSAJES.cambio_aprobado;
        const productos = pedido.productos ?? [];
        if (productos.length > 0) {
          const lineas = productos
            .map((p) => `• ${p.cantidad}× ${p.nombre}${p.opcion ? ` (${p.opcion})` : ''}`)
            .join('\n');
          mensajeCambio += `\n\n📋 *Resumen actualizado:*\n${lineas}\n\n💰 *Total: C$${pedido.total}*`;
        }
        pendientes.push({ clave: 'cambio_aprobado', mensaje: mensajeCambio });
      }

      if (estadoCambio === 'rechazado' && !notificaciones_enviadas.cambio_rechazado) {
        pendientes.push({ clave: 'cambio_rechazado', mensaje: MENSAJES.cambio_rechazado });
      }

      for (const { clave, mensaje } of pendientes) {
        const notifObj = { ...notificaciones_enviadas, [clave]: true };
        await query(
          'UPDATE pedidos SET notificaciones_enviadas = $1 WHERE id = $2',
          [JSON.stringify(notifObj), id]
        );

        await sendWhatsAppMessage(destino, mensaje);
        console.log(`[Notificaciones] Mensaje "${clave}" enviado a WhatsApp (${destino})`);
      }
    } catch (err) {
      console.error('[Notificaciones] Error procesando notificación:', err.message);
    }
  });
}

module.exports = { iniciarListenerNotificaciones };
