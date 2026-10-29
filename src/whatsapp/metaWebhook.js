/**
 * Manejador del webhook de Evolution API.
 * Evolution API envuelve Baileys y lo expone como REST con webhooks HTTP.
 *
 * POST /whatsapp/webhook — eventos de Evolution API (mensajes entrantes, cambios de estado, etc.)
 */

const { recibirMensaje, verificarHorario, enviarMensajeFueraDeHorario } = require('./messageHandler');
const { sendWhatsAppMessage } = require('./metaSender');
const { cacheLidMapping, resolveLid } = require('./lidResolver');
const { findPedidoPendientePago, attachComprobante } = require('../orders/orderService');
const { log } = require('../utils/logger');
const { estaActivo } = require('../services/botStateService');
const { getSession } = require('../agent/sessionStore');

const RESTAURANTE_ID = process.env.RESTAURANTE_ID || 'urbano';

const MSG_MEDIA = 'Hola 👋 Solo puedo atender pedidos por escrito. Por favor escríbeme qué deseas y con gusto te ayudo. 🍔';

// ── Deduplicación ─────────────────────────────────────────────────────────────
// Ignora mensajes cuyo ID ya se procesó (ventana deslizante de 500 IDs)
const _processedIds = new Set();
function _markProcessed(id) {
  _processedIds.add(id);
  if (_processedIds.size > 500) {
    _processedIds.delete(_processedIds.values().next().value);
  }
}

// ── Descargar imagen via Evolution API ────────────────────────────────────────
async function downloadMediaEvolution(messagePayload) {
  const apiUrl = process.env.EVOLUTION_API_URL;
  const apiKey = process.env.EVOLUTION_API_KEY;
  const instance = process.env.EVOLUTION_INSTANCE;

  if (!apiUrl || !apiKey || !instance) {
    throw new Error('Variables de Evolution API no configuradas');
  }

  const url = `${apiUrl}/chat/getBase64FromMediaMessage/${instance}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: apiKey,
    },
    body: JSON.stringify({
      message: messagePayload,
      convertToMp4: false,
    }),
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => '');
    throw new Error(`Media download failed: ${res.status} ${errorText}`);
  }

  const result = await res.json();
  const base64 = result.base64 || result.data?.base64;
  const mimetype = result.mimetype || result.data?.mimetype || 'image/jpeg';
  return { buffer: Buffer.from(base64, 'base64'), mimeType: mimetype };
}

// ── POST /whatsapp/webhook ────────────────────────────────────────────────────
// Recibe eventos de Evolution API (messages.upsert, etc.)
// Evolution responde inmediatamente, no hay verificación GET.
async function handleWebhook(req, res) {
  res.sendStatus(200); // Responder inmediatamente

  const body = req.body || {};
  const event = (body.event || '').toLowerCase();

  log(`[Webhook] Evento recibido: "${body.event}"`);

  // Si llega evento de conexión abierta, disparar notificación de despliegue si estaba pendiente
  if (event === 'connection.update') {
    const state = body.data?.state || body.data?.connection || '';
    if (state === 'open') {
      log('[Webhook] Conexión WhatsApp abierta ("open"). Verificando aviso de despliegue...');
      const { notificarDespliegue } = require('../services/deployNotificationService');
      notificarDespliegue().catch(() => {});
    }
    return;
  }

  // Solo procesar eventos de mensajes (v1: messages.upsert, posible variante en mayúsculas)
  if (event !== 'messages.upsert') return;

  // v1 puede enviar data como array o como objeto
  const messages = Array.isArray(body.data) ? body.data : [body.data];

  for (const data of messages) {
    await _processMessage(data);
  }
}

async function _processMessage(data) {
  if (!data) return;

  const key = data.key || {};
  const message = data.message || {};
  const messageType = data.messageType;

  // Ignorar mensajes propios y grupos
  if (key.fromMe) {
    log(`[Webhook] Mensaje ignorado porque proviene del propio bot (fromMe=true). Para interactuar con el bot, envía un mensaje desde otra cuenta de WhatsApp.`);
    return;
  }
  if (key.remoteJid?.endsWith('@g.us')) {
    return;
  }

  // Kill switch — bot pausado desde la app (cubre texto, imágenes y cualquier media)
  if (!estaActivo()) {
    log(`[Webhook] Bot pausado — ignorando mensaje entrante`);
    return;
  }

  // Extraer JID de transporte original y número inicial
  const incomingJid = key.remoteJid || '';
  let telefono = incomingJid.split('@')[0];

  if (!telefono) return;

  // REGLA CRÍTICA DE CIFRADO E2EE: replyTo y remoteJid para el transporte de WhatsApp
  // DEBEN ser SIEMPRE el incomingJid exacto (sea @lid o @s.whatsapp.net).
  // Si respondemos a @s.whatsapp.net cuando el cliente chatea por @lid, su teléfono
  // no puede descifrar el mensaje y muestra "Esperando el mensaje. Esto puede tomar tiempo".
  const replyTo = incomingJid;
  const remoteJid = incomingJid;

  // Si incomingJid viene con @lid, resolver su número telefónico real EXCLUSIVAMENTE
  // para base de datos (pedidos.telefono), cocina (KDS) y Lista Negra.
  const altCandidate = key.senderPn 
    || (data.key && data.key.senderPn)
    || key.remoteJidAlt 
    || key.participantAlt 
    || key.participantPn 
    || data.senderPn 
    || data.cleanedSenderPn 
    || data.participantPn;

  if (incomingJid.endsWith('@lid') && altCandidate) {
    const rawAlt = typeof altCandidate === 'string' ? altCandidate.split('@')[0].replace(/\D/g, '') : '';
    if (rawAlt && rawAlt.length >= 8 && rawAlt.length <= 15 && !rawAlt.endsWith('@lid')) {
      cacheLidMapping(incomingJid, rawAlt);
      telefono = rawAlt;
      log(`[Webhook] @lid resuelto desde senderPn / payload alternativo (${altCandidate}) → ${rawAlt}`);
    }
  }

  // Si sigue siendo @lid o un identificador numérico de 15 dígitos sin resolver, intentar resolver vía API o BD
  if (incomingJid.endsWith('@lid') || /^\d{14,16}$/.test(telefono)) {
    const resolved = await resolveLid(incomingJid);
    if (resolved) {
      log(`[Webhook] @lid ${incomingJid} resuelto vía API/BD → ${resolved}`);
      telefono = resolved;
    }
  }

  const messageId = key.id;
  const contactName = data?.pushName || null;

  // Deduplicar
  if (_processedIds.has(messageId)) return;
  _markProcessed(messageId);

  // ── Comprobar Lista Negra (repartidores / números bloqueados) ───────────────
  // Si está en lista negra, el bot NO responde absolutamente nada (evita confusiones con repartidores)
  const { isBlacklisted } = require('../services/blacklistService');
  if (await isBlacklisted(telefono, RESTAURANTE_ID, key.remoteJid)) {
    log(`[Webhook] Mensaje de ${telefono} (${key.remoteJid}) ignorado por estar en Lista Negra (Repartidor / Bloqueado)`);
    return;
  }

  // ── Imagen: posible comprobante de pago ──────────────────────────────────────

  if (messageType === 'imageMessage') {
    try {
      const pedidoPendiente = await findPedidoPendientePago(telefono);
      if (pedidoPendiente) {
        log(`[Webhook] Imagen de ${telefono} → comprobante para pedido ${pedidoPendiente.id}`);
        const { buffer, mimeType } = await downloadMediaEvolution(data);
        await attachComprobante(pedidoPendiente.id, buffer, mimeType);
        await sendWhatsAppMessage(replyTo,
          '✅ *Comprobante recibido.* El chef verificará tu pago y confirmará el pedido en breve. 🙏',
        );
        log(`[Webhook] Comprobante guardado para pedido ${pedidoPendiente.id}`);
        return;
      }
    } catch (err) {
      log(`[Webhook] Error procesando comprobante de ${telefono}: ${err.message}`);
    }
    // Sin pedido pendiente_pago → verificar si hay sesión activa (por teléfono o por JID)
    const sessionMsgs = getSession(telefono).length > 0 ? getSession(telefono) : getSession(replyTo);
    if (sessionMsgs.length > 0) {
      const lastMsg = [...sessionMsgs].reverse().find(m => m.role === 'assistant');
      const waitingConfirmation = lastMsg && (
        lastMsg.content?.includes('Resumen de tu pedido') ||
        lastMsg.content?.includes('¿Está todo correcto?') ||
        lastMsg.content?.includes('Envía un "ok"') ||
        lastMsg.content?.includes('Envía un ok')
      );

      if (waitingConfirmation) {
        log(`[Webhook] Imagen de ${telefono} recibida con resumen pendiente de confirmación → procesando como confirmación de pedido con comprobante`);
        const caption = message.imageMessage?.caption ? ` ${message.imageMessage.caption}` : '';
        await recibirMensaje({
          telefono,
          remoteJid: replyTo,
          texto: `Ok, confirmo mi pedido y adjunto mi comprobante de transferencia.${caption}`,
          restauranteId: RESTAURANTE_ID,
          contactName,
          esMensajeReenviado: !!(message.contextInfo?.isForwarded),
          sendTyping: () => Promise.resolve(),
          sendReply: async (reply) => {
            try {
              // Descargar y adjuntar comprobante si el pedido acaba de crearse en pendiente_pago
              const nuevoPendiente = await findPedidoPendientePago(telefono);
              if (nuevoPendiente) {
                try {
                  const { buffer, mimeType } = await downloadMediaEvolution(data);
                  await attachComprobante(nuevoPendiente.id, buffer, mimeType);
                  log(`[Webhook] Comprobante adjuntado inmediatamente tras confirmación por imagen para pedido ${nuevoPendiente.id}`);
                } catch (attachErr) {
                  log(`[Webhook] Error adjuntando comprobante tras confirmación: ${attachErr.message}`);
                }
              }
              await sendWhatsAppMessage(replyTo, reply);
              log(`[Webhook] → ${telefono}: ${reply.substring(0, 80)}`);
            } catch (err) {
              log(`[Webhook] Error enviando respuesta a ${telefono}: ${err.message}`);
            }
          },
        });
        return;
      }

      log(`[Webhook] Imagen de ${telefono} recibida durante sesión activa sin resumen pendiente → avisando al cliente`);
      await sendWhatsAppMessage(replyTo, '📸 Recibimos tu imagen. Si deseas ordenar, por favor escríbenos qué platillos te gustaría pedir para armar tu orden. 🍔');
      return;
    }
    // Sin sesión ni pedido pendiente → verificar horario antes de responder
    const horarioImg = await verificarHorario(RESTAURANTE_ID);
    if (!horarioImg.abierto) {
      const sendReplyImg = (msg) => sendWhatsAppMessage(replyTo, msg);
      await enviarMensajeFueraDeHorario(telefono, horarioImg, sendReplyImg);
    } else {
      await sendWhatsAppMessage(replyTo, MSG_MEDIA).catch(() => {});
    }
    return;
  }

  // ── Extraer texto ────────────────────────────────────────────────────────────
  let texto = message.conversation
    || message.extendedTextMessage?.text
    || message.imageMessage?.caption
    || null;

  if (!texto) {
    const MEDIA_TYPES = ['audioMessage', 'videoMessage', 'documentMessage', 'stickerMessage'];
    if (MEDIA_TYPES.includes(messageType)) {
      // Verificar horario antes de responder media
      const horarioMedia = await verificarHorario(RESTAURANTE_ID);
      if (!horarioMedia.abierto) {
        log(`[Webhook] Media (${messageType}) de ${telefono} fuera de horario`);
        const sendReplyMedia = (msg) => sendWhatsAppMessage(replyTo, msg);
        await enviarMensajeFueraDeHorario(telefono, horarioMedia, sendReplyMedia);
      } else {
        log(`[Webhook] Media (${messageType}) de ${telefono} → respondiendo`);
        await sendWhatsAppMessage(replyTo, MSG_MEDIA).catch(() => {});
      }
    } else {
      log(`[Webhook] Mensaje ignorado de ${telefono} (tipo: ${messageType})`);
    }
    return;
  }

  texto = texto.trim();

  log(`[Webhook] ← ${telefono}: ${texto.substring(0, 80)}`);

  // Procesar mensaje (telefono para Firestore, replyTo para respuestas WhatsApp)
  await recibirMensaje({
    telefono,
    remoteJid: replyTo,
    texto,
    restauranteId: RESTAURANTE_ID,
    contactName,
    esMensajeReenviado: !!(message.contextInfo?.isForwarded),
    sendTyping: () => Promise.resolve(),
    sendReply: async (reply) => {
      try {
        await sendWhatsAppMessage(replyTo, reply);
        log(`[Webhook] → ${telefono}: ${reply.substring(0, 80)}`);
      } catch (err) {
        log(`[Webhook] Error enviando respuesta a ${telefono}: ${err.message}`);
      }
    },
  });
}

module.exports = { handleWebhook };
