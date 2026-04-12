const { db, trackWrite } = require('./firebaseService');
const { doc, getDoc, updateDoc, deleteField } = require('firebase/firestore');

/**
 * Envía una push notification al chef via Expo Push API.
 * El token se guarda en Firestore bajo restaurantes/{restauranteId}.push_token
 * cuando la app-chef arranca (pushNotificationService.ts).
 *
 * No lanza error — falla silenciosamente para no bloquear el flujo del pedido.
 */
async function enviarPushAlChef(restauranteId, titulo, cuerpo) {
  try {
    const snap = await getDoc(doc(db, 'restaurantes', restauranteId));
    if (!snap.exists()) return;
    const token = snap.data()?.push_token;
    if (!token) return;

    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip, deflate',
      },
      body: JSON.stringify({
        to: token,
        title: titulo,
        body: cuerpo,
        sound: 'default',
        priority: 'high',
        channelId: 'pedidos',
      }),
    });

    const json = await res.json();
    if (json.data?.status === 'error') {
      const errorType = json.data?.details?.error;
      console.warn('[pushService] Error FCM:', json.data.message, errorType);
      if (errorType === 'DeviceNotRegistered') {
        await updateDoc(doc(db, 'restaurantes', restauranteId), {
          push_token: deleteField(),
        });
        trackWrite('pushService:deleteToken');
        console.log('[pushService] Token stale eliminado para', restauranteId);
      }
    } else {
      console.log(`[pushService] Push enviado al chef (${restauranteId})`);
    }
  } catch (err) {
    console.warn('[pushService] Error enviando push:', err.message);
  }
}

module.exports = { enviarPushAlChef };
