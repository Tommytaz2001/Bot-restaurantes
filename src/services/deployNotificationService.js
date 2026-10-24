const { sendWhatsAppMessage } = require('../whatsapp/metaSender');
const { log } = require('../utils/logger');

let _notificado = false;
let _pollingActive = false;

/**
 * Parsea una lista de teléfonos separados por coma o espacio,
 * removiendo caracteres no numéricos (+, -, espacios).
 * @param {string|null|undefined} raw
 * @returns {string[]}
 */
function parsePhoneList(raw) {
  if (!raw || typeof raw !== 'string') return [];
  return raw
    .split(',')
    .map((num) => num.replace(/[^0-9]/g, '').trim())
    .filter((num) => num.length >= 8);
}

/**
 * Verifica si la instancia de WhatsApp en Evolution API está en estado 'open'.
 * @param {Function} [overrideFetch]
 * @returns {Promise<boolean>}
 */
async function isWhatsAppOpen(overrideFetch) {
  const apiUrl = process.env.EVOLUTION_API_URL;
  const apiKey = process.env.EVOLUTION_API_KEY;
  const instance = process.env.EVOLUTION_INSTANCE || 'bot-restaurantes';

  if (!apiUrl || !apiKey) return false;

  const fetchFn = overrideFetch || globalThis.fetch;
  try {
    const res = await fetchFn(`${apiUrl}/instance/connectionState/${instance}`, {
      headers: { apikey: apiKey },
    });
    if (res && res.ok) {
      const data = await res.json().catch(() => ({}));
      const state = data?.instance?.state || data?.state;
      return state === 'open';
    }
  } catch (_) {
    // Si no responde aún, retorna false
  }
  return false;
}

/**
 * Envía el mensaje de redespliegue a los teléfonos configurados.
 */
async function enviarAvisosDespliegue(options = {}) {
  const rawPhones = options.overridePhones ?? process.env.NOTIFICAR_DESPLIEGUE_TELEFONO;
  const phones = parsePhoneList(rawPhones);

  if (phones.length === 0) {
    return { ok: false, reason: 'no_phones_configured' };
  }

  const offset = parseInt(process.env.TZ_OFFSET || '-6', 10);
  const now = new Date(Date.now() + offset * 3600 * 1000);
  const fechaStr = now.toISOString().replace('T', ' ').substring(0, 19);

  const mensaje = `🚀 *Bot Restaurantes Urbano — Servidor en Línea*\n\n` +
    `✅ El servidor backend se ha redesplegado e iniciado con éxito.\n` +
    `🕒 *Fecha/Hora:* ${fechaStr} (UTC${offset >= 0 ? '+' : ''}${offset})\n` +
    `🌐 *Instancia WhatsApp:* Conectada y operativa\n` +
    `🍔 *Estado:* Listo para recibir pedidos y atender clientes.`;

  const sendFn = options.overrideSend || sendWhatsAppMessage;
  const results = [];

  for (const phone of phones) {
    try {
      const dest = `${phone}@s.whatsapp.net`;
      await sendFn(dest, mensaje);
      log(`[Deploy] ✓ Notificación de despliegue enviada a ${phone}`);
      results.push({ phone, ok: true });
    } catch (err) {
      log(`[Deploy] ❌ Error enviando notificación de despliegue a ${phone}: ${err.message}`);
      results.push({ phone, ok: false, error: err.message });
    }
  }

  _notificado = true;
  return { ok: true, results };
}

/**
 * Orquesta la notificación de despliegue.
 * Si WhatsApp no está conectado todavía, activa un observador en segundo plano
 * para disparar el mensaje de inmediato en cuanto se conecte o escanee el QR.
 */
async function notificarDespliegue(options = {}) {
  if (_notificado && !options.force) {
    return { ok: true, reason: 'already_notified' };
  }

  const rawPhones = options.overridePhones ?? process.env.NOTIFICAR_DESPLIEGUE_TELEFONO;
  const phones = parsePhoneList(rawPhones);
  if (phones.length === 0) {
    return { ok: false, reason: 'no_phones_configured' };
  }

  // 1. Si ya está conectado, enviar inmediatamente
  const isOpen = options.overrideWait ? await options.overrideWait() : await isWhatsAppOpen();
  if (isOpen) {
    return await enviarAvisosDespliegue(options);
  }

  // Si se pidió forzar envío pero no está listo
  if (options.force) {
    return {
      ok: false,
      reason: 'whatsapp_not_ready',
      message: 'WhatsApp no está en estado "open". Escanea el código QR en /whatsapp/qr primero.',
    };
  }

  // 2. Si está en 'connecting' o iniciando, dejar polling activo en segundo plano (cada 3s hasta 10 min)
  if (!_pollingActive) {
    _pollingActive = true;
    log(`[Deploy] WhatsApp en espera de conexión/QR. Observador iniciado para enviar aviso al conectar...`);

    const maxAttempts = 200; // 200 * 3s = 10 minutos
    let attempts = 0;

    const interval = setInterval(async () => {
      attempts++;
      if (_notificado || attempts > maxAttempts) {
        clearInterval(interval);
        _pollingActive = false;
        if (attempts > maxAttempts) {
          log('[Deploy] Tiempo de espera para aviso de despliegue agotado (10 min).');
        }
        return;
      }

      const ready = await isWhatsAppOpen();
      if (ready) {
        clearInterval(interval);
        _pollingActive = false;
        log('[Deploy] WhatsApp conectado exitosamente. Enviando aviso de despliegue...');
        await enviarAvisosDespliegue(options);
      }
    }, 3000);
  }

  return { ok: true, status: 'waiting_for_connection' };
}

module.exports = {
  notificarDespliegue,
  enviarAvisosDespliegue,
  parsePhoneList,
  isWhatsAppOpen,
  _setNotificado: (val) => { _notificado = val; },
};
