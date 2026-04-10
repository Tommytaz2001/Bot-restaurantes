/**
 * Manejador del webhook de Evolution API.
 * Evolution API envuelve Baileys y lo expone como REST con webhooks HTTP.
 *
 * POST /whatsapp/webhook — eventos de Evolution API (mensajes entrantes, cambios de estado, etc.)
 */

const { recibirMensaje } = require('./messageHandler');
const { sendWhatsAppMessage } = require('./metaSender');
const { findPedidoPendientePago, attachComprobante } = require('../orders/orderService');

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

  const { event, instance, data } = req.body || {};

  // Solo procesar eventos de mensajes
  if (event !== 'messages.upsert') return;

  const key = data?.key || {};
  const message = data?.message || {};
  const messageType = data?.messageType;

  // Ignorar mensajes propios y grupos
  if (key.fromMe || key.remoteJid?.endsWith('@g.us')) return;

  // Extraer número de teléfono limpio desde remoteJid
  const remoteJid = key.remoteJid || '';
  const telefono = remoteJid.split('@')[0]; // "50512345678@s.whatsapp.net" → "50512345678"

  if (!telefono) return;

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
        console.log(`[Webhook] Imagen de ${telefono} → comprobante para pedido ${pedidoPendiente.id}`);
        const { buffer, mimeType } = await downloadMediaEvolution(key);
        await attachComprobante(pedidoPendiente.id, buffer, mimeType);
        await sendWhatsAppMessage(
          telefono,
          '✅ *Comprobante recibido.* El chef verificará tu pago y confirmará el pedido en breve. 🙏',
        );
        console.log(`[Webhook] Comprobante guardado para pedido ${pedidoPendiente.id}`);
        return;
      }
    } catch (err) {
      console.error(`[Webhook] Error procesando comprobante de ${telefono}:`, err.message);
    }
    // Sin pedido pendiente → responder que solo se atiende por texto
    await sendWhatsAppMessage(telefono, MSG_MEDIA).catch(() => {});
    return;
  }

  // ── Extraer texto ────────────────────────────────────────────────────────────
  let texto = message.conversation || message.imageMessage?.caption || null;

  if (!texto) {
    const MEDIA_TYPES = ['audioMessage', 'videoMessage', 'documentMessage', 'stickerMessage'];
    if (MEDIA_TYPES.includes(messageType)) {
      console.log(`[Webhook] Media (${messageType}) de ${telefono} → respondiendo`);
      await sendWhatsAppMessage(telefono, MSG_MEDIA).catch(() => {});
    } else {
      console.log(`[Webhook] Mensaje ignorado de ${telefono} (tipo: ${messageType})`);
    }
    return;
  }

  texto = texto.trim();

  console.log(`[Webhook] ← ${telefono}: ${texto.substring(0, 80)}`);

  // Procesar mensaje
  await recibirMensaje({
    telefono,
    remoteJid: telefono, // Evolution entrega remoteJid con @s.whatsapp.net, extraemos número limpio
    texto,
    restauranteId: RESTAURANTE_ID,
    contactName,
    esMensajeReenviado: !!(message.contextInfo?.isForwarded),
    sendTyping: () => Promise.resolve(), // Evolution API no soporta typing indicator (usar markAsRead como alternativa)
    sendReply: async (reply) => {
      try {
        await sendWhatsAppMessage(telefono, reply);
        console.log(`[Webhook] → ${telefono}: ${reply.substring(0, 80)}`);
      } catch (err) {
        console.error(`[Webhook] Error enviando respuesta a ${telefono}:`, err.message);
      }
    },
  });
}

module.exports = { handleWebhook };
