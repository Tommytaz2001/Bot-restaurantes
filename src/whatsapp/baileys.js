const {
  makeWASocket,
  DisconnectReason,
  fetchLatestBaileysVersion,
} = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const pino = require('pino');
const qrcode = require('qrcode-terminal');
const { useFirestoreAuthState, clearFirestoreSession } = require('./firestoreAuthState');
const { recibirMensaje } = require('./messageHandler');

const RESTAURANTE_ID = process.env.RESTAURANTE_ID || 'urbano';

let sock = null;
const _contacts = {}; // mapa JID/@lid -> contacto para resolver números reales

// Deduplicación: ignorar mensajes cuyo ID ya procesamos (ventana de 500 IDs)
const _processedIds = new Set();
function _markProcessed(id) {
  _processedIds.add(id);
  if (_processedIds.size > 500) {
    const first = _processedIds.values().next().value;
    _processedIds.delete(first);
  }
}

// Estado de la sesión WhatsApp (expuesto para el endpoint /whatsapp/qr)
let _waState = {
  status: 'disconnected', // 'disconnected' | 'waiting_qr' | 'connected'
  qr: null,              // string QR actual (se limpia al conectar)
  connectedAt: null,
};

function getWAState() {
  return _waState;
}

/**
 * Extrae el número de teléfono limpio de un JID.
 * Si es @lid intenta resolverlo vía contacts, si no puede devuelve el número del LID como fallback.
 */
function resolverTelefono(remoteJid) {
  if (remoteJid.endsWith('@s.whatsapp.net')) {
    return remoteJid.split('@')[0];
  }
  if (remoteJid.endsWith('@lid')) {
    const contact = _contacts[remoteJid];
    if (contact?.id && contact.id.endsWith('@s.whatsapp.net')) {
      return contact.id.split('@')[0];
    }
    // Sin @lid tampoco
    const lidBase = remoteJid.split('@')[0];
    const contact2 = _contacts[lidBase];
    if (contact2?.id && contact2.id.endsWith('@s.whatsapp.net')) {
      return contact2.id.split('@')[0];
    }
    console.warn(`[WhatsApp] ⚠ No se pudo resolver @lid ${remoteJid} — contacto no en caché`);
    return lidBase; // fallback: LID sin sufijo
  }
  return remoteJid.split('@')[0];
}

async function iniciarBaileys() {
  const { state, saveCreds } = await useFirestoreAuthState(RESTAURANTE_ID);
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false, // Lo manejamos manualmente con qrcode-terminal
    logger: pino({ level: 'silent' }),
    browser: ['Urbano Bot', 'Chrome', '1.0.0'],
  });

  // Guardar credenciales cuando se actualicen
  sock.ev.on('creds.update', saveCreds);

  // Normaliza un LID a la forma canónica con sufijo @lid
  function normalizeLid(lid) {
    if (!lid) return null;
    return lid.includes('@') ? lid : `${lid}@lid`;
  }

  // Indexa un contacto en _contacts bajo todos sus JIDs posibles
  function indexContact(c) {
    if (c.id) _contacts[c.id] = c;
    if (c.lid) {
      const fullLid = normalizeLid(c.lid);
      _contacts[fullLid] = c;
      // También sin sufijo por si Baileys lo busca así
      _contacts[c.lid] = c;
    }
  }

  // Mantener mapa de contactos para resolver @lid → número real
  sock.ev.on('contacts.upsert', (contacts) => {
    for (const c of contacts) indexContact(c);
  });

  sock.ev.on('contacts.update', (updates) => {
    for (const u of updates) {
      // Mezclar con el contacto existente para no perder datos
      const existing = (u.id && _contacts[u.id]) || (u.lid && _contacts[normalizeLid(u.lid)]) || {};
      indexContact({ ...existing, ...u });
    }
  });

  // Manejar cambios de conexión
  sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
    // Guardar QR en estado y mostrarlo en terminal
    if (qr) {
      _waState = { status: 'waiting_qr', qr, connectedAt: null };
      console.log('\n[WhatsApp] Escanea este QR con tu teléfono:');
      console.log('[WhatsApp] También disponible en: GET /whatsapp/qr\n');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'close') {
      const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
      const loggedOut = statusCode === DisconnectReason.loggedOut;

      _waState = { status: 'disconnected', qr: null, connectedAt: null };
      console.log(`[WhatsApp] Conexión cerrada. Código: ${statusCode}.`);

      if (loggedOut) {
        console.log('[WhatsApp] Sesión inválida. Limpiando credenciales y generando nuevo QR...');
        clearFirestoreSession(RESTAURANTE_ID).catch(() => {});
      } else {
        console.log('[WhatsApp] Reconectando en 5 segundos...');
      }

      setTimeout(iniciarBaileys, 5000);
    }

    if (connection === 'open') {
      _waState = { status: 'connected', qr: null, connectedAt: new Date().toISOString() };
      console.log(`[WhatsApp] Bot conectado — restaurante: ${RESTAURANTE_ID}`);

      // Cargar contactos que Baileys ya tiene en caché interna
      const cached = sock.contacts ?? {};
      let loaded = 0;
      for (const c of Object.values(cached)) {
        if (c && (c.id || c.lid)) { indexContact(c); loaded++; }
      }
      if (loaded > 0) console.log(`[WhatsApp] ${loaded} contactos cargados desde caché`);
    }
  });

  // Tipos de media que reciben respuesta "escríbeme por texto"
  const MEDIA_TYPES = new Set([
    'imageMessage',
    'videoMessage',
    'audioMessage',
    'documentMessage',
    'documentWithCaptionMessage',
    'stickerMessage',
  ]);

  const MSG_MEDIA = 'Hola 👋 Solo puedo atender pedidos por escrito. Por favor escríbeme qué deseas y con gusto te ayudo. 🍔';
  const MSG_LLAMADA = 'Hola 👋 No podemos atender llamadas, pero puedo tomar tu pedido aquí mismo. ¿Qué te gustaría ordenar? 🍔';

  // Manejar mensajes entrantes
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      if (msg.key.fromMe) continue;
      if (!msg.message) continue;
      if (msg.key.remoteJid.endsWith('@g.us')) continue; // Ignorar grupos
      if (_processedIds.has(msg.key.id)) continue; // Deduplicar
      _markProcessed(msg.key.id);

      const remoteJid = msg.key.remoteJid;
      const telefono = resolverTelefono(remoteJid);
      const messageType = Object.keys(msg.message)[0];

      const texto =
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        msg.message?.imageMessage?.caption ||
        null;

      const contactName = _contacts[remoteJid]?.name ?? null;
      const esMensajeReenviado = !!(
        msg.message?.extendedTextMessage?.contextInfo?.isForwarded ||
        (msg.message?.extendedTextMessage?.contextInfo?.forwardingScore ?? 0) > 0
      );

      if (!texto) {
        if (MEDIA_TYPES.has(messageType)) {
          console.log(`[WhatsApp] Media (${messageType}) de ${telefono} → respondiendo`);
          try {
            await sock.sendMessage(remoteJid, { text: MSG_MEDIA });
          } catch (err) {
            console.error(`[WhatsApp] Error respondiendo media a ${telefono}:`, err.message);
          }
        } else {
          console.log(`[WhatsApp] Mensaje ignorado de ${telefono} (tipo: ${messageType})`);
        }
        continue;
      }

      console.log(`[WhatsApp] ← ${telefono}: ${texto.substring(0, 80)}`);

      await recibirMensaje({
        telefono,
        remoteJid,
        texto,
        restauranteId: RESTAURANTE_ID,
        contactName,
        esMensajeReenviado,
        sendReply: async (reply) => {
          try {
            await sock.sendMessage(remoteJid, { text: reply });
            console.log(`[WhatsApp] → ${telefono}: ${reply.substring(0, 80)}`);
          } catch (err) {
            console.error(`[WhatsApp] Error enviando mensaje a ${telefono}:`, err.message);
          }
        },
      });
    }
  });

  // Manejar llamadas entrantes — rechazar y notificar al que llamó
  sock.ev.on('call', async (calls) => {
    for (const call of calls) {
      if (call.status !== 'offer') continue;
      if (call.from?.endsWith('@g.us')) continue;

      const telefono = resolverTelefono(call.from);
      console.log(`[WhatsApp] Llamada entrante de ${telefono} — rechazando`);

      try {
        await sock.rejectCall(call.id, call.from);
      } catch (err) {
        // Si la llamada ya cortó sola, no es error crítico
        console.warn(`[WhatsApp] rejectCall falló para ${telefono}:`, err.message);
      }

      try {
        await sock.sendMessage(call.from, { text: MSG_LLAMADA });
        console.log(`[WhatsApp] Mensaje post-llamada enviado a ${telefono}`);
      } catch (err) {
        console.error(`[WhatsApp] Error enviando mensaje post-llamada a ${telefono}:`, err.message);
      }
    }
  });

  return sock;
}

function getSock() {
  return sock;
}

module.exports = { iniciarBaileys, getSock, getWAState };
