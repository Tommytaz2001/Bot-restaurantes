/**
 * Listener de Firestore que detecta cambios de estado en pedidos
 * y envía notificaciones WhatsApp automáticamente via Evolution API.
 */
const { collection, onSnapshot, updateDoc, doc } = require('firebase/firestore');
const { db } = require('./firebaseService');
const { sendWhatsAppMessage } = require('../whatsapp/metaSender');

const MENSAJES = {
  confirmado:       '✅ ¡Tu pedido fue confirmado! Ya estamos preparando tu pedido. 🍔',
  cancelado:        '❌ Lo sentimos, tu pedido no pudo ser procesado en este momento. Por favor contáctanos si necesitas ayuda.',
  en_camino:        '🛵 ¡Tu pedido está en camino! Pronto llegará a tu dirección. 😊',
  entregado:        '✅ ¡Tu pedido fue entregado! Gracias por tu preferencia. ¡Hasta pronto! 🍔',
  cambio_aprobado:  '✅ Tu solicitud de cambio fue aprobada. Seguimos preparando tu pedido. 🍔',
  cambio_rechazado: '❌ Tu solicitud de cambio no pudo ser aplicada. Tu pedido original sigue en proceso.',
};

function iniciarListenerNotificaciones() {
  onSnapshot(
    collection(db, 'pedidos'),
    async (snapshot) => {
      for (const change of snapshot.docChanges()) {
        if (change.type !== 'modified') continue;

        const order = { id: change.doc.id, ...change.doc.data() };
        const { estado, telefono, jid, tipo_entrega, cambio_solicitado, notificaciones_enviadas = {} } = order;

        // Preferir el JID completo (siempre correcto, incluye @s.whatsapp.net o @lid).
        // Fallback a telefono para pedidos guardados antes de que se agregara el campo jid.
        const destino = jid || telefono;

        if (!destino) {
          console.warn(`[notificaciones] Pedido ${order.id} sin jid ni telefono — omitiendo notificación`);
          continue;
        }

        const pendientes = [];

        // Notificaciones por cambio de estado principal
        if (MENSAJES[estado] && !notificaciones_enviadas[estado]) {
          let mensaje;
          if (estado === 'en_camino' && tipo_entrega === 'retiro') {
            mensaje = '🏪 ¡Tu pedido está listo! Puedes pasar a retirarlo cuando quieras. 😊';
          } else if (estado === 'confirmado' && order.tiempo_estimado_min) {
            mensaje = `✅ ¡Tu pedido fue confirmado! Ya estamos preparando tu pedido. 🍔\n\n🕐 Tiempo estimado: *${order.tiempo_estimado_min} minutos*.`;
          } else {
            mensaje = MENSAJES[estado];
          }
          pendientes.push({ clave: estado, mensaje });
        }

        // Notificaciones por cambio de solicitud de modificación
        const estadoCambio = cambio_solicitado?.estado;
        if (estadoCambio === 'aprobado' && !notificaciones_enviadas.cambio_aprobado) {
          pendientes.push({ clave: 'cambio_aprobado', mensaje: MENSAJES.cambio_aprobado });
        }
        if (estadoCambio === 'rechazado' && !notificaciones_enviadas.cambio_rechazado) {
          pendientes.push({ clave: 'cambio_rechazado', mensaje: MENSAJES.cambio_rechazado });
        }

        if (pendientes.length === 0) continue;

        for (const { clave, mensaje } of pendientes) {
          try {
            await sendWhatsAppMessage(destino, mensaje);
            await updateDoc(doc(db, 'pedidos', order.id), {
              [`notificaciones_enviadas.${clave}`]: true,
            });
            console.log(`[notificaciones] "${clave}" enviada a ${destino} (pedido ${order.id})`);
          } catch (err) {
            console.error(`[notificaciones] Error enviando "${clave}" a ${destino} (pedido ${order.id}):`, err.message);
          }
        }
      }
    },
    (err) => console.error('[notificaciones] Error en listener Firestore:', err.message),
  );

  console.log('[notificaciones] Listener de Firestore activo');
}

module.exports = { iniciarListenerNotificaciones };
