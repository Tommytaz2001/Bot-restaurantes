/**
 * Listener de Firestore que detecta cambios de estado en pedidos
 * y envía notificaciones WhatsApp automáticamente via Evolution API.
 */
const { collection, onSnapshot, updateDoc, doc, query, where } = require('firebase/firestore');
const { db, trackWrite, trackRead } = require('./firebaseService');
const { sendWhatsAppMessage } = require('../whatsapp/metaSender');
const { encolarNotificacion } = require('./notificacionQueue');

const RESTAURANTE_ID = process.env.RESTAURANTE_ID || 'urbano';

const MENSAJES = {
  confirmado:       '✅ ¡Tu pedido fue confirmado! Ya estamos preparando tu pedido. 🍔',
  cancelado:        '❌ Lo sentimos, tu pedido no pudo ser procesado en este momento. Por favor contáctanos si necesitas ayuda.',
  en_camino:        '🛵 ¡Tu pedido está en camino! Pronto llegará a tu dirección. 😊',
  entregado:        '✅ ¡Tu pedido fue entregado! Gracias por tu preferencia. ¡Hasta pronto! 🍔',
  cambio_aprobado:  '✅ Tu solicitud de cambio fue aprobada. Seguimos preparando tu pedido. 🍔',
  cambio_rechazado: '❌ Tu solicitud de cambio no pudo ser aplicada. Tu pedido original sigue en proceso.',
};

function iniciarListenerNotificaciones() {
  // Filtrar solo pedidos de este restaurante para minimizar lecturas de Firestore
  const q = query(
    collection(db, 'pedidos'),
    where('restauranteId', '==', RESTAURANTE_ID),
  );
  onSnapshot(
    q,
    async (snapshot) => {
      trackRead('notificacionService:listener', `restaurante=${RESTAURANTE_ID}`, snapshot.docs.length);
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
          let mensajeCambio = MENSAJES.cambio_aprobado;

          // Incluir resumen actualizado del pedido con nuevo total
          const productos = order.productos ?? [];
          const moneda = order.moneda ?? 'C$';
          if (productos.length > 0) {
            const lineasProductos = productos
              .map((p) => `• ${p.cantidad}× ${p.nombre}${p.opcion ? ` (${p.opcion})` : ''}`)
              .join('\n');
            const costoEnvio = order.costo_envio ?? 0;
            const totalActual = order.total ?? 0;

            mensajeCambio += '\n\n📋 *Resumen actualizado:*\n' + lineasProductos;
            if (costoEnvio > 0) {
              mensajeCambio += `\n\n💰 Subtotal: ${moneda}${totalActual - costoEnvio}`;
              mensajeCambio += `\n🛵 Envío: ${moneda}${costoEnvio}`;
            }
            mensajeCambio += `\n💰 *Total: ${moneda}${totalActual}*`;
          }

          pendientes.push({ clave: 'cambio_aprobado', mensaje: mensajeCambio });
        }
        if (estadoCambio === 'rechazado' && !notificaciones_enviadas.cambio_rechazado) {
          pendientes.push({ clave: 'cambio_rechazado', mensaje: MENSAJES.cambio_rechazado });
        }

        if (pendientes.length === 0) continue;

        for (const { clave, mensaje } of pendientes) {
          // Marcar como enviada ANTES de enviar: evita duplicados si el listener dispara dos veces.
          // Si el envío falla, la notificación queda encolada para reintento al reiniciar.
          try {
            await updateDoc(doc(db, 'pedidos', order.id), {
              [`notificaciones_enviadas.${clave}`]: true,
            });
            trackWrite(`notificacion:${clave}`, `pedidoId=${order.id} | destino=${destino}`);
          } catch (markErr) {
            console.error(`[notificaciones] Error marcando "${clave}" para pedido ${order.id}:`, markErr.message);
            continue;
          }

          try {
            await sendWhatsAppMessage(destino, mensaje);
            console.log(`[notificaciones] "${clave}" enviada a ${destino} (pedido ${order.id})`);
          } catch (sendErr) {
            console.error(`[notificaciones] Error enviando "${clave}" a ${destino} (pedido ${order.id}):`, sendErr.message);
            // Marcada como enviada pero no enviada — encolar para reintento al reiniciar
            encolarNotificacion({ telefono: destino, mensaje, pedidoId: order.id }).catch(() => {});
          }
        }
      }
    },
    (err) => console.error('[notificaciones] Error en listener Firestore:', err.message),
  );

  console.log('[notificaciones] Listener de Firestore activo');
}

module.exports = { iniciarListenerNotificaciones };
