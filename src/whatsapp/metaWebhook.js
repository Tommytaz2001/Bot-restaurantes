/**
 * Manejador del webhook de Evolution API.
 * Evolution API envuelve Baileys y lo expone como REST con webhooks HTTP.
 *
 * POST /whatsapp/webhook — eventos de Evolution API (mensajes entrantes, cambios de estado, etc.)
 */

const { recibirMensaje, verificarHorario, enviarMensajeFueraDeHorario } = require('./messageHandler');
const { sendWhatsAppMessage } = require('./metaSender');
const { findPedidoPendientePago, attachComprobante } = require('../orders/orderService');
const { log } = require('../utils/logger');

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
async function downloadMediaEvolution(key) {
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
    body: JSON.stringify({ key }),
  });

  if (!res.ok) throw new Error(`Media download failed: ${res.status}`);

  const { base64, mimetype } = await res.json();
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
  if (key.fromMe || key.remoteJid?.endsWith('@g.us')) return;

  // Extraer número de teléfono y remoteJid completo
  const remoteJid = key.remoteJid || '';
  const telefono = remoteJid.split('@')[0];

  if (!telefono) return;

  // Para enviar respuestas usamos el remoteJid completo (@lid o @s.whatsapp.net)
  // Evolution API necesita el JID completo para LIDs
  const replyTo = remoteJid;

  const messageId = key.id;
  const contactName = data?.pushName || null;

  // Deduplicar
  if (_processedIds.has(messageId)) return;
  _markProcessed(messageId);

  // ── Imagen: posible comprobante de pago ──────────────────────────────────────
  if (messageType === 'imageMessage') {
    try {
      const pedidoPendiente = await findPedidoPendientePago(telefono);
      if (pedidoPendiente) {
        log(`[Webhook] Imagen de ${telefono} → comprobante para pedido ${pedidoPendiente.id}`);
        const { buffer, mimeType } = await downloadMediaEvolution(key);
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
    // Sin pedido pendiente → verificar horario antes de responder
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
