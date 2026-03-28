const { processMessage } = require('../agent/agentService');
const { verificarSpam } = require('./spamGuard');
const { log } = require('../utils/logger');
const { estaActivo } = require('../services/botStateService');

const DEBOUNCE_MS = 4_000; // 4 segundos — suficiente para acumular mensajes enviados en ráfaga

// Palabras clave para detectar repartidores por nombre de contacto guardado
const REPARTIDOR_KEYWORDS = ['delivery', 'moto mandado', 'mandado'];

// Historial de reenvíos por teléfono (ventana deslizante de 5 mensajes)
const _forwardedHistory = new Map(); // telefono -> boolean[]
// Nombre de contacto más reciente por teléfono
const _contactNames = new Map(); // telefono -> string

function registrarMetadataMensaje(telefono, contactName, esMensajeReenviado) {
  if (contactName) _contactNames.set(telefono, contactName);

  if (!_forwardedHistory.has(telefono)) _forwardedHistory.set(telefono, []);
  const hist = _forwardedHistory.get(telefono);
  hist.push(!!esMensajeReenviado);
  if (hist.length > 5) hist.shift();
}

function detectarRepartidor(telefono) {
  const contactName = _contactNames.get(telefono) ?? null;

  // Caso 1: nombre de contacto guardado contiene keyword de repartidor
  if (contactName) {
    const lower = contactName.toLowerCase();
    if (REPARTIDOR_KEYWORDS.some((kw) => lower.includes(kw))) return true;
  }

  // Casos 2 y 3: alguno de los últimos 5 mensajes fue reenviado
  // (detecta tanto "no guardado + reenvío actual" como "bot perdió primer mensaje")
  const hist = _forwardedHistory.get(telefono) ?? [];
  if (hist.some((f) => f)) return true;

  return false;
}

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
 * @param {string} params.telefono          - Número del remitente (sin @s.whatsapp.net)
 * @param {string} params.texto             - Texto del mensaje
 * @param {string} params.restauranteId
 * @param {string|null} params.contactName  - Nombre guardado en contactos de WA (puede ser null)
 * @param {boolean} params.esMensajeReenviado - Si el mensaje fue reenviado
 * @param {Function} params.sendReply       - Función async para enviar respuesta
 */
async function recibirMensaje({ telefono, remoteJid, texto, restauranteId, contactName = null, esMensajeReenviado = false, sendReply }) {
  // 0. Kill switch — bot pausado desde la app
  if (!estaActivo()) {
    console.log(`[messageHandler] Bot pausado — ignorando mensaje de ${telefono}`);
    return;
  }

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

  // 4. Registrar metadatos para detección de repartidor
  registrarMetadataMensaje(telefono, contactName, esMensajeReenviado);

  // 5. Acumular en buffer por teléfono
  if (!_buffers.has(telefono)) _buffers.set(telefono, []);
  _buffers.get(telefono).push(texto.trim());

  // 6. Reiniciar debounce con cada mensaje nuevo
  if (_timers.has(telefono)) clearTimeout(_timers.get(telefono));

  _timers.set(telefono, setTimeout(async () => {
    const mensajesAcumulados = _buffers.get(telefono).join(' ');
    _buffers.delete(telefono);
    _timers.delete(telefono);

    const esRepartidor = detectarRepartidor(telefono);
    console.log(`[messageHandler] Procesando de ${telefono}${esRepartidor ? ' [REPARTIDOR]' : ''}: "${mensajesAcumulados.substring(0, 60)}"`);
    log(`[WA_IN] telefono=${telefono} chars=${mensajesAcumulados.length}${esRepartidor ? ' repartidor=true' : ''}`);

    try {
      const result = await processMessage({
        message: mensajesAcumulados,
        sessionId: telefono,
        restauranteId,
        telefono,
        remoteJid,
        esRepartidor,
      });
      await sendReply(result.reply);
      log(`[WA_OUT] telefono=${telefono} chars=${result.reply.length}`);
    } catch (err) {
      console.error(`[messageHandler] Error procesando mensaje de ${telefono}:`, err.message);
      await sendReply('Lo siento, tuve un problema. Por favor intenta de nuevo en un momento. 🙏');
    }
  }, DEBOUNCE_MS));
}

module.exports = { recibirMensaje };
