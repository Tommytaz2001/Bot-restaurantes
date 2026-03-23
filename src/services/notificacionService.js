/**
 * Listener de Firestore que detecta cambios de estado en pedidos
 * y envía notificaciones WhatsApp automáticamente.
 * No depende de que la app del chef llame al endpoint /notificar.
 */
const { collection, onSnapshot, updateDoc, doc } = require('firebase/firestore');
const { db } = require('./firebaseService');

const MENSAJES = {
  confirmado:       '✅ ¡Tu pedido fue confirmado! Ya estamos preparando tu pedido. 🍔',
  rechazado:        '❌ Lo sentimos, tu pedido no pudo ser procesado en este momento. Por favor contáctanos si necesitas ayuda.',
  en_camino:        '🛵 ¡Tu pedido está en camino! Pronto llegará a tu dirección. 😊',
  entregado:        '✅ ¡Tu pedido fue entregado! Gracias por tu preferencia. ¡Hasta pronto! 🍔',
  cambio_aprobado:  '✅ Tu solicitud de cambio fue aprobada. Seguimos preparando tu pedido. 🍔',
  cambio_rechazado: '❌ Tu solicitud de cambio no pudo ser aplicada. Tu pedido original sigue en proceso.',
};

function iniciarListenerNotificaciones() {
  const { getSock } = require('../whatsapp/baileys');

  onSnapshot(
    collection(db, 'pedidos'),
    async (snapshot) => {
      for (const change of snapshot.docChanges()) {
        if (change.type !== 'modified') continue;

        const order = { id: change.doc.id, ...change.doc.data() };
        const { estado, jid, telefono, cambio_solicitado, notificaciones_enviadas = {} } = order;

        const pendientes = [];

        // Notificaciones por cambio de estado principal
        if (MENSAJES[estado] && !notificaciones_enviadas[estado]) {
          pendientes.push({ clave: estado, mensaje: MENSAJES[estado] });
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

        const sock = getSock();
        if (!sock?.user) {
          console.warn(`[notificaciones] WhatsApp no conectado, se omite notif para pedido ${order.id}`);
          continue;
        }

        const destino = jid || `${telefono}@s.whatsapp.net`;

        for (const { clave, mensaje } of pendientes) {
          try {
            await sock.sendMessage(destino, { text: mensaje });
            await updateDoc(doc(db, 'pedidos', order.id), {
              [`notificaciones_enviadas.${clave}`]: true,
            });
            console.log(`[notificaciones] "${clave}" enviada a ${telefono} (pedido ${order.id})`);
          } catch (err) {
            console.error(`[notificaciones] Error enviando "${clave}" a ${telefono}:`, err.message);
          }
        }
      }
    },
    (err) => console.error('[notificaciones] Error en listener Firestore:', err.message),
  );

  console.log('[notificaciones] Listener de Firestore activo');
}

module.exports = { iniciarListenerNotificaciones };
