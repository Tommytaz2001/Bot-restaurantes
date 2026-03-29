const { db } = require('./firebaseService');
const {
  collection, addDoc, getDocs, deleteDoc, doc, serverTimestamp,
} = require('firebase/firestore');

const QUEUE_COL = 'cola_notificaciones';

/**
 * Persiste una notificación fallida en Firestore para reintento automático
 * cuando WhatsApp vuelva a conectarse.
 */
async function encolarNotificacion({ jid, mensaje, pedidoId }) {
  try {
    await addDoc(collection(db, QUEUE_COL), {
      jid,
      mensaje,
      pedidoId: pedidoId ?? null,
      creadoAt: serverTimestamp(),
    });
    console.log(`[notificacionQueue] Notificación encolada para ${jid}`);
  } catch (err) {
    console.error('[notificacionQueue] Error encolando:', err.message);
  }
}

/**
 * Procesa todas las notificaciones pendientes en la cola.
 * Se llama cuando WhatsApp se reconecta.
 */
async function procesarCola() {
  const { getSock } = require('../whatsapp/baileys');
  const sock = getSock();
  if (!sock?.user) return;

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
    const { jid, mensaje } = d.data();
    try {
      await sock.sendMessage(jid, { text: mensaje });
      await deleteDoc(doc(db, QUEUE_COL, d.id));
      console.log(`[notificacionQueue] ✓ Enviada a ${jid} desde cola`);
    } catch (err) {
      console.warn(`[notificacionQueue] Fallo enviando a ${jid}:`, err.message);
    }
  }
}

module.exports = { encolarNotificacion, procesarCola };
