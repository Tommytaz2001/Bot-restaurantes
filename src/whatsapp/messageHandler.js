const { processMessage } = require('../agent/agentService');
const { verificarSpam } = require('./spamGuard');

const DEBOUNCE_MS = 12_000; // 12 segundos — acumular mensajes antes de responder

const _timers = new Map();  // telefono -> timeoutId
const _buffers = new Map(); // telefono -> string[]

function debeIgnorar(texto) {
  if (!texto || texto.trim().length === 0) return true;
  if (texto.trim().length < 2) return true; // stickers, emojis solos
  return false;
}

/**
 * Recibe un mensaje de WhatsApp, aplica spam guard, debounce y filtros,
 * luego llama al agente y responde.
 *
 * @param {Object} params
 * @param {string} params.telefono    - Número del remitente (sin @s.whatsapp.net)
 * @param {string} params.texto       - Texto del mensaje
 * @param {string} params.restauranteId
 * @param {Function} params.sendReply - Función async para enviar respuesta
 */
async function recibirMensaje({ telefono, texto, restauranteId, sendReply }) {
  // 1. Control de spam
  const spam = verificarSpam(telefono);
  if (spam.bloqueado) {
    await sendReply(spam.mensaje);
    return;
  }

  // 2. Filtrar mensajes vacíos o muy cortos
  if (debeIgnorar(texto)) return;

  // 3. Acumular en buffer por teléfono
  if (!_buffers.has(telefono)) _buffers.set(telefono, []);
  _buffers.get(telefono).push(texto.trim());

  // 4. Reiniciar debounce con cada mensaje nuevo
  if (_timers.has(telefono)) clearTimeout(_timers.get(telefono));

  _timers.set(telefono, setTimeout(async () => {
    const mensajesAcumulados = _buffers.get(telefono).join(' ');
    _buffers.delete(telefono);
    _timers.delete(telefono);

    console.log(`[messageHandler] Procesando de ${telefono}: "${mensajesAcumulados.substring(0, 60)}"`);

    try {
      const result = await processMessage({
        message: mensajesAcumulados,
        sessionId: telefono,
        restauranteId,
        telefono,
      });
      await sendReply(result.reply);
    } catch (err) {
      console.error(`[messageHandler] Error procesando mensaje de ${telefono}:`, err.message);
      await sendReply('Lo siento, tuve un problema. Por favor intenta de nuevo en un momento. 🙏');
    }
  }, DEBOUNCE_MS));
}

module.exports = { recibirMensaje };
