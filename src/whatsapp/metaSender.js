/**
 * Wrapper para enviar mensajes via Evolution API.
 * Evolution API envuelve Baileys y lo expone como REST API.
 */
const { getPhoneForLid, resolveLid } = require('./lidResolver');
const { isAdminOrOwnerPhone } = require('../utils/phoneUtils');

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function isTransientError(status, errorMsg) {
  if (status === 500 || status === 502 || status === 503 || status === 504 || status === 429) {
    return true;
  }
  const msg = String(errorMsg || '').toLowerCase();
  return (
    msg.includes('connection closed') ||
    msg.includes('econnreset') ||
    msg.includes('etimedout') ||
    msg.includes('fetch failed') ||
    msg.includes('socket hang up') ||
    msg.includes('network')
  );
}

function isLidRejection(status, errorMsg) {
  const msg = String(errorMsg || '').toLowerCase();
  return (
    msg.includes('not-acceptable') ||
    msg.includes('no session') ||
    msg.includes('session error') ||
    msg.includes('bad-request') ||
    status === 406
  );
}

/**
 * Normaliza el destino conservando JIDs (@lid o @s.whatsapp.net).
 * Si es un número sin JID de 8 dígitos (Nicaragua), asegura prefijo internacional 505.
 */
function normalizeDestination(to) {
  let destination = to;
  if (typeof destination === 'string') {
    const trimmed = destination.trim();
    if (!trimmed.includes('@')) {
      const digits = trimmed.replace(/\D/g, '');
      if (digits.length === 8) {
        destination = `505${digits}`;
      } else if (digits.length > 8) {
        destination = digits;
      }
    }
  }
  return destination;
}

/**
 * Realiza una llamada HTTP única para enviar el mensaje.
 */
async function _dispatchSingle(apiUrl, apiKey, instance, destination, text) {
  const url = `${apiUrl}/message/sendText/${instance}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: apiKey,
    },
    body: JSON.stringify({
      number: destination,
      textMessage: { text },
    }),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    const errText = JSON.stringify(errorBody);
    const err = new Error(`Evolution API error ${response.status}: ${errText}`);
    err.status = response.status;
    err.errorBody = errorBody;
    throw err;
  }

  return response.json();
}

/**
 * Envía un mensaje de texto a un número de WhatsApp con reintentos para errores transitorios
 * y fallback automático de @lid a teléfono si WhatsApp rechaza la sesión del LID.
 *
 * @param {string} to   - Número de teléfono limpio o JID completo, ej: "50512345678" o "229712...@lid"
 * @param {string} text - Texto del mensaje
 * @param {object} [options] - Opciones de configuración (reintentos, demoras)
 * @returns {Promise<object>} Respuesta de la API de Evolution
 */
async function sendWhatsAppMessage(to, text, options = {}) {
  const apiUrl = process.env.EVOLUTION_API_URL;
  const apiKey = process.env.EVOLUTION_API_KEY;
  const instance = process.env.EVOLUTION_INSTANCE;

  if (!apiUrl || !apiKey || !instance) {
    throw new Error('EVOLUTION_API_URL, EVOLUTION_API_KEY y EVOLUTION_INSTANCE son requeridos');
  }

  let destination = normalizeDestination(to);

  // En Evolution API (con WPP_LID_MODE=false), enviar mensajes directamente a @lid
  // provoca 'Connection Closed' y reinicios en cascada del socket Baileys.
  // Si destination es @lid o un identificador de 14-16 dígitos, mapeamos proactivamente
  // al número de teléfono real (@s.whatsapp.net) si está en caché o se resuelve vía API.
  const isLidTarget = typeof destination === 'string' && (destination.includes('@lid') || /^\d{14,16}$/.test(destination));
  if (isLidTarget) {
    let phone = getPhoneForLid(destination);
    if (!phone) {
      phone = await resolveLid(destination).catch(() => null);
    }
    if (phone) {
      const clean = String(phone).replace(/\D/g, '');
      destination = clean.length === 8 ? `505${clean}@s.whatsapp.net` : `${clean}@s.whatsapp.net`;
      console.log(`[metaSender] Destino LID ${to} mapeado a teléfono de transporte: ${destination}`);
    }
  }

  const maxAttempts = options.maxAttempts ?? 3;
  const retryDelays = options.retryDelays ?? [1500, 2500];

  let lastError = null;

  // Intento de envío al destino normalizado
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await _dispatchSingle(apiUrl, apiKey, instance, destination, text);
    } catch (err) {
      lastError = err;
      const isTransient = isTransientError(err.status, err.message);

      // Si aún estamos intentando enviar a un @lid no resuelto y falla,
      // intentar resolución de emergencia por si se resolvió concurrentemente
      if (typeof destination === 'string' && destination.includes('@lid')) {
        const emergencyPhone = await resolveLid(destination).catch(() => null);
        if (emergencyPhone) {
          const clean = String(emergencyPhone).replace(/\D/g, '');
          destination = clean.length === 8 ? `505${clean}@s.whatsapp.net` : `${clean}@s.whatsapp.net`;
          console.warn(`[metaSender] Reorientando envío fallido de @lid a teléfono: ${destination}`);
          try {
            return await _dispatchSingle(apiUrl, apiKey, instance, destination, text);
          } catch (fallbackErr) {
            lastError = fallbackErr;
          }
        }
      }

      if (isTransient && attempt < maxAttempts) {
        const delay = retryDelays[attempt - 1] || 2000;
        console.warn(`[metaSender] Error transitorio al enviar a ${destination} (${err.message}). Reintentando en ${delay}ms (intento ${attempt + 1}/${maxAttempts})...`);
        await sleep(delay);
        continue;
      }

      // Si no es transitorio o se agotaron los reintentos, romper el bucle
      break;
    }
  }

  console.error(`[metaSender] Error definitivo enviando mensaje a ${destination}: ${lastError.message}`, lastError);
  throw lastError;
}

module.exports = {
  sendWhatsAppMessage,
  isTransientError,
  isLidRejection,
};
