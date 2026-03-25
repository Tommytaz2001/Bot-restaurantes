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
    // Fallback: usar el número del LID (puede no ser el teléfono real)
    return remoteJid.split('@')[0];
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

  // Mantener mapa de contactos para resolver @lid → número real
  sock.ev.on('contacts.upsert', (contacts) => {
    for (const c of contacts) {
      if (c.id) _contacts[c.id] = c;
      if (c.lid) _contacts[c.lid] = c;
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
