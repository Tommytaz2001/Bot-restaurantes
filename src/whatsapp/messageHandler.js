const { processMessage } = require('../agent/agentService');
const { verificarSpam } = require('./spamGuard');
const { log } = require('../utils/logger');
const { estaActivo } = require('../services/botStateService');
const { getRestauranteConfig } = require('../services/menuService');

const DEBOUNCE_MS = 2_000; // 2 segundos — suficiente para acumular mensajes enviados en ráfaga

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

// Horario de atención leído desde Firestore (restaurantes/{id}.horario)
// Soporta formato por día: { lunes: { abre, apertura, cierre }, ... }
// y formato antiguo flat: { apertura, cierre }
// Zona horaria: Nicaragua (UTC-6)

const DIAS_SEMANA = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];

function parsearMinutos(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + (m || 0);
}

function formatHora12(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const period = h >= 12 ? 'pm' : 'am';
  const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${h12}:${String(m || 0).padStart(2, '0')} ${period}`;
}

/**
 * Verifica si el bot debe atender ahora.
 * @returns {{ abierto: true } | { abierto: false, razon: 'dia_cerrado'|'fuera_horario', apertura?: string, cierre?: string }}
 */
async function verificarHorario(restauranteId) {
  try {
    const config = await getRestauranteConfig(restauranteId);
    const horario = config.horario;
    if (!horario) return { abierto: true };

    const ahora = new Date();
    const offsetHoras = parseInt(process.env.TZ_OFFSET ?? '-6', 10);
    // Minutos transcurridos en el día (hora local según TZ_OFFSET)
    const minutosLocal = ((ahora.getUTCHours() + offsetHoras + 24) % 24) * 60 + ahora.getUTCMinutes();
    // Día de la semana local
    const nowLocal = new Date(ahora.getTime() + offsetHoras * 60 * 60 * 1000);
    const diaLocal = DIAS_SEMANA[nowLocal.getUTCDay()];

    const horaLocalStr = `${String(Math.floor(minutosLocal / 60)).padStart(2, '0')}:${String(minutosLocal % 60).padStart(2, '0')}`;
    const horaUTCStr   = `${String(ahora.getUTCHours()).padStart(2, '0')}:${String(ahora.getUTCMinutes()).padStart(2, '0')}`;
    log(`[Horario] UTC=${horaUTCStr} local(${offsetHoras >= 0 ? '+' : ''}${offsetHoras}h)=${horaLocalStr} dia=${diaLocal}`);
    log(`[Horario] config.horario[${diaLocal}]=${JSON.stringify(horario[diaLocal] ?? null)}`);

    // Formato nuevo: por día de semana
    if (horario[diaLocal] !== undefined) {
      const diaConfig = horario[diaLocal];
      if (!diaConfig.abre) return { abierto: false, razon: 'dia_cerrado' };
      if (!diaConfig.apertura || !diaConfig.cierre) return { abierto: true };
      const aperturaMin = parsearMinutos(diaConfig.apertura);
      const cierreMin   = parsearMinutos(diaConfig.cierre);
      // Horario nocturno (cruza medianoche): ej 23:00-08:00 → aperturaMin > cierreMin
      const dentro = cierreMin < aperturaMin
        ? (minutosLocal >= aperturaMin || minutosLocal <= cierreMin)
        : (minutosLocal >= aperturaMin && minutosLocal <= cierreMin);
      log(`[Horario] check: ${minutosLocal}min apertura=${aperturaMin} cierre=${cierreMin} nocturno=${cierreMin < aperturaMin} → ${dentro ? 'ABIERTO' : 'CERRADO'}`);
      if (!dentro) return { abierto: false, razon: 'fuera_horario', apertura: diaConfig.apertura, cierre: diaConfig.cierre };
      return { abierto: true };
    }

    // Formato antiguo: flat apertura/cierre
    if (!horario.apertura || !horario.cierre) return { abierto: true };
    const aperturaFlat = parsearMinutos(horario.apertura);
    const cierreFlat   = parsearMinutos(horario.cierre);
    const dentro = cierreFlat < aperturaFlat
      ? (minutosLocal >= aperturaFlat || minutosLocal <= cierreFlat)
      : (minutosLocal >= aperturaFlat && minutosLocal <= cierreFlat);
    if (!dentro) return { abierto: false, razon: 'fuera_horario', apertura: horario.apertura, cierre: horario.cierre };
    return { abierto: true };
  } catch {
    return { abierto: true }; // si falla la lectura, no bloquear al cliente
  }
}

// Cooldown para mensajes fuera de horario — evita spamear al mismo número
const _fueraHorarioCooldown = new Map(); // telefono -> timestamp
const FUERA_HORARIO_COOLDOWN_MS = 30 * 60 * 1000; // 30 minutos

async function enviarMensajeFueraDeHorario(telefono, estadoHorario, sendReply) {
  const ahora = Date.now();
  const ultimo = _fueraHorarioCooldown.get(telefono) ?? 0;
  if (ahora - ultimo < FUERA_HORARIO_COOLDOWN_MS) {
    log(`[messageHandler] Fuera de horario — cooldown activo para ${telefono}, no reenviar`);
    return;
  }
  _fueraHorarioCooldown.set(telefono, ahora);

  let mensaje;
  if (estadoHorario.razon === 'dia_cerrado') {
    mensaje = '🔒 Hoy no estamos atendiendo. ¡Te esperamos pronto! 🍔';
  } else {
    const apertura = formatHora12(estadoHorario.apertura);
    const cierre = formatHora12(estadoHorario.cierre);
    mensaje = `🔒 Estamos fuera de horario. Nuestro horario de hoy es de *${apertura}* a *${cierre}*. ¡Te esperamos! 🍔`;
  }

  await sendReply(mensaje);
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
async function recibirMensaje({ telefono, remoteJid, texto, restauranteId, contactName = null, esMensajeReenviado = false, resolverFn = null, sendReply, sendTyping = null }) {
  // 0. Kill switch — bot pausado desde la app
  if (!estaActivo()) {
    log(`[messageHandler] Bot pausado — ignorando mensaje de ${telefono}`);
    return;
  }

  // 1. Verificar horario de atención (configurable desde Firestore: restaurantes/{id}.horario)
  const estadoHorario = await verificarHorario(restauranteId);
  if (!estadoHorario.abierto) {
    log(`[messageHandler] Fuera de horario (${estadoHorario.razon}) — respondiendo a ${telefono}`);
    await enviarMensajeFueraDeHorario(telefono, estadoHorario, sendReply);
    return;
  }

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

    // Re-intentar resolución del teléfono: tras el debounce los contactos suelen estar en caché
    const telefonoFinal = resolverFn ? resolverFn() : telefono;
    if (telefonoFinal !== telefono) {
      log(`[messageHandler] @lid resuelto: ${telefono} → ${telefonoFinal}`);
    }

    // Si el @lid no pudo resolverse al número real, pasamos null para que el agente
    // le pida al cliente su número durante el pedido (así queda guardado correctamente)
    const esLidNoResuelto = remoteJid?.endsWith('@lid') && telefonoFinal === telefono;
    const telefonoParaPedido = esLidNoResuelto ? null : telefonoFinal;
    if (esLidNoResuelto) {
      log(`[messageHandler] @lid sin resolver — el agente pedirá el número al cliente`);
    }

    const esRepartidor = detectarRepartidor(telefono);
    log(`[messageHandler] Procesando de ${telefonoFinal}${esRepartidor ? ' [REPARTIDOR]' : ''}: "${mensajesAcumulados.substring(0, 60)}"`);
    log(`[WA_IN] telefono=${telefonoFinal} chars=${mensajesAcumulados.length}${esRepartidor ? ' repartidor=true' : ''}`);

    // Indicador de "escribiendo..." mientras OpenAI procesa
    if (sendTyping) sendTyping().catch(() => {});

    try {
      const result = await processMessage({
        message: mensajesAcumulados,
        sessionId: telefono,           // clave de sesión: siempre el original (LID o real)
        restauranteId,
        telefono: telefonoParaPedido,  // null si @lid no resuelto → agente pide al cliente
        remoteJid,
        esRepartidor,
      });
      if (result.reply) {
        await sendReply(result.reply);
        log(`[WA_OUT] telefono=${telefono} chars=${result.reply.length}`);
      }
    } catch (err) {
      log(`[messageHandler] Error procesando mensaje de ${telefono}: ${err.message}`);
      await sendReply('Lo siento, tuve un problema. Por favor intenta de nuevo en un momento. 🙏');
    }
  }, DEBOUNCE_MS));
}

module.exports = { recibirMensaje, verificarHorario, enviarMensajeFueraDeHorario };
