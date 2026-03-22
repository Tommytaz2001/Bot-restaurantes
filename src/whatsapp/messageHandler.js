const { processMessage } = require('../agent/agentService');
const { verificarSpam } = require('./spamGuard');

const DEBOUNCE_MS = 4_000; // 4 segundos — suficiente para acumular mensajes enviados en ráfaga

// Horario de atención: 3:00pm – 9:30pm hora Nicaragua (UTC-6)
const HORA_APERTURA_MIN = 15 * 60;        // 900 min = 3:00pm
const HORA_CIERRE_MIN  = 21 * 60 + 30;   // 1290 min = 9:30pm

function estaEnHorario() {
  const ahora = new Date();
  const minutosNica = ((ahora.getUTCHours() - 6 + 24) % 24) * 60 + ahora.getUTCMinutes();
  return minutosNica >= HORA_APERTURA_MIN && minutosNica <= HORA_CIERRE_MIN;
}

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
  // 1. Verificar horario de atención (deshabilitado temporalmente para pruebas)
  // if (!estaEnHorario()) {
  //   await sendReply(
  //     '⏰ Estamos fuera de horario. Nuestro horario de atención es de *3:00 pm a 9:30 pm*.\n\n¡Te esperamos pronto! 🍔',
  //   );
  //   return;
  // }

  // 2. Control de spam
  const spam = verificarSpam(telefono);
  if (spam.bloqueado) {
    await sendReply(spam.mensaje);
    return;
  }

  // 3. Filtrar mensajes vacíos o muy cortos
  if (debeIgnorar(texto)) return;

  // 4. Acumular en buffer por teléfono
  if (!_buffers.has(telefono)) _buffers.set(telefono, []);
  _buffers.get(telefono).push(texto.trim());

  // 5. Reiniciar debounce con cada mensaje nuevo
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
