const { db } = require('./firebaseService');
const {
  collection, addDoc, getDocs, deleteDoc, doc, serverTimestamp,
} = require('firebase/firestore');
const { sendWhatsAppMessage } = require('../whatsapp/metaSender');

const QUEUE_COL = 'cola_notificaciones';

/**
 * Persiste una notificación fallida en Firestore para reintento automático al reiniciar.
 */
async function encolarNotificacion({ telefono, mensaje, pedidoId }) {
  try {
    await addDoc(collection(db, QUEUE_COL), {
      telefono,
      mensaje,
      pedidoId: pedidoId ?? null,
      creadoAt: serverTimestamp(),
    });
    console.log(`[notificacionQueue] Notificación encolada para ${telefono}`);
  } catch (err) {
    console.error('[notificacionQueue] Error encolando:', err.message);
  }
}

/**
 * Procesa todas las notificaciones pendientes en la cola.
 * Se llama al iniciar el servidor.
 */
async function procesarCola() {
  let snap;
  try {
    snap = await getDocs(collection(db, QUEUE_COL));
  } catch (err) {
    console.error('[notificacionQueue] Error leyendo cola:', err.message);
    return;
  }

  if (snap.empty) return;
  console.log(`[notificacionQueue] Procesando ${snap.size} notificaciones pendientes`);

  for (const d of snap.docs) {
    const { telefono, jid, mensaje } = d.data();
    // Soporte para items viejos (guardados con 'jid') y nuevos (con 'telefono')
    const destino = telefono || (jid ? jid.split('@')[0] : null);
    if (!destino) continue;
    try {
      await sendWhatsAppMessage(destino, mensaje);
      await deleteDoc(doc(db, QUEUE_COL, d.id));
      console.log(`[notificacionQueue] ✓ Enviada a ${destino} desde cola`);
    } catch (err) {
      console.warn(`[notificacionQueue] Fallo enviando a ${destino}:`, err.message);
    }
  }
}

module.exports = { encolarNotificacion, procesarCola };
