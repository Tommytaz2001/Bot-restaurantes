const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const pino = require('pino');
const path = require('path');
const { recibirMensaje } = require('./messageHandler');

const RESTAURANTE_ID = process.env.RESTAURANTE_ID || 'urbano';
const AUTH_DIR = path.join(__dirname, '../../.baileys-auth');

let sock = null;

async function iniciarBaileys() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: true,
    logger: pino({ level: 'silent' }), // Silenciar logs internos de Baileys
    browser: ['Urbano Bot', 'Chrome', '1.0.0'],
  });

  // Guardar credenciales cuando se actualicen
  sock.ev.on('creds.update', saveCreds);

  // Manejar cambios de conexión
  sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      console.log('\n[WhatsApp] 📱 Escanea el QR con tu teléfono para conectar el bot\n');
    }

    if (connection === 'close') {
      const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      console.log(`[WhatsApp] Conexión cerrada. Código: ${statusCode}. Reconectar: ${shouldReconnect}`);

      if (shouldReconnect) {
        console.log('[WhatsApp] Reconectando en 5 segundos...');
        setTimeout(iniciarBaileys, 5000);
      } else {
        console.log('[WhatsApp] ⚠️  Sesión cerrada (logout). Elimina la carpeta .baileys-auth y reinicia para conectar de nuevo.');
      }
    }

    if (connection === 'open') {
      console.log(`[WhatsApp] ✅ Bot conectado — restaurante: ${RESTAURANTE_ID}`);
    }
  });

  // Manejar mensajes entrantes
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      // Ignorar mensajes propios
      if (msg.key.fromMe) continue;
      // Ignorar mensajes sin contenido
      if (!msg.message) continue;
      // Ignorar mensajes de grupos (solo 1 a 1 en MVP)
      if (msg.key.remoteJid.endsWith('@g.us')) continue;

      const telefono = msg.key.remoteJid.replace('@s.whatsapp.net', '');

      // Extraer texto de distintos tipos de mensaje
      const texto =
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        msg.message?.imageMessage?.caption ||
        null;

      if (!texto) {
        console.log(`[WhatsApp] Mensaje no-texto ignorado de ${telefono} (tipo: ${Object.keys(msg.message)[0]})`);
        continue;
      }

      console.log(`[WhatsApp] ← ${telefono}: ${texto.substring(0, 80)}`);

      await recibirMensaje({
        telefono,
        texto,
        restauranteId: RESTAURANTE_ID,
        sendReply: async (reply) => {
          try {
            await sock.sendMessage(msg.key.remoteJid, { text: reply });
            console.log(`[WhatsApp] → ${telefono}: ${reply.substring(0, 80)}`);
          } catch (err) {
            console.error(`[WhatsApp] Error enviando mensaje a ${telefono}:`, err.message);
          }
        },
      });
    }
  });

  return sock;
}

function getSock() {
  return sock;
}

module.exports = { iniciarBaileys, getSock };
