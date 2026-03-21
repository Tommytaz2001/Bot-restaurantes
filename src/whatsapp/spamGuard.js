const VENTANA_MS = 10_000;  // 10 segundos
const LIMITE = 5;           // mensajes máximos en la ventana
const BLOQUEO_MS = 15_000;  // 15 segundos de bloqueo

const _timestamps = new Map(); // telefono -> number[]
const _bloqueados = new Map(); // telefono -> unblockTimestamp

function verificarSpam(telefono) {
  const ahora = Date.now();

  // Verificar si está bloqueado actualmente
  if (_bloqueados.has(telefono)) {
    if (ahora < _bloqueados.get(telefono)) {
      return {
        bloqueado: true,
        mensaje: '⚠️ Estás enviando muchos mensajes. Intenta nuevamente en unos segundos.',
      };
    }
    _bloqueados.delete(telefono);
  }

  // Registrar timestamp actual
  if (!_timestamps.has(telefono)) _timestamps.set(telefono, []);
  const ts = _timestamps.get(telefono);
  ts.push(ahora);

  // Filtrar solo los mensajes dentro de la ventana de tiempo
  const recientes = ts.filter(t => ahora - t < VENTANA_MS);
  _timestamps.set(telefono, recientes);

  if (recientes.length >= LIMITE) {
    _bloqueados.set(telefono, ahora + BLOQUEO_MS);
    console.warn(`[spamGuard] Spam detectado de ${telefono} — bloqueado por ${BLOQUEO_MS / 1000}s`);
    return {
      bloqueado: true,
      mensaje: '⚠️ Estás enviando muchos mensajes. Intenta nuevamente en unos segundos.',
    };
  }

  return { bloqueado: false };
}

module.exports = { verificarSpam };
