const { storage } = require('./firebaseService');
const { ref, uploadBytes, getDownloadURL } = require('firebase/storage');

/**
 * Sube un buffer de imagen a Firebase Storage bajo comprobantes/{pedidoId}/.
 * Devuelve la URL pública de descarga.
 */
async function uploadComprobante(pedidoId, buffer, mimeType = 'image/jpeg') {
  const ext = mimeType.includes('png') ? 'png' : 'jpg';
  const path = `comprobantes/${pedidoId}/${Date.now()}.${ext}`;
  const storageRef = ref(storage, path);
  const snapshot = await uploadBytes(storageRef, buffer, { contentType: mimeType });
  return getDownloadURL(snapshot.ref);
}

module.exports = { uploadComprobante };
