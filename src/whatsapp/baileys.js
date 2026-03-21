const {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const pino = require('pino');
const qrcode = require('qrcode-terminal');
const path = require('path');
const fs = require('fs');
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
    printQRInTerminal: false, // Lo manejamos manualmente con qrcode-terminal
    logger: pino({ level: 'silent' }),
    browser: ['Urbano Bot', 'Chrome', '1.0.0'],
  });

  // Guardar credenciales cuando se actualicen
  sock.ev.on('creds.update', saveCreds);

  // Manejar cambios de conexión
  sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
    // Mostrar QR en terminal cuando esté disponible
    if (qr) {
      console.log('\n[WhatsApp] 📱 Escanea este QR con tu teléfono:\n');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'close') {
      const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
      const loggedOut = statusCode === DisconnectReason.loggedOut;

      console.log(`[WhatsApp] Conexión cerrada. Código: ${statusCode}.`);

      if (loggedOut) {
        // Sesión expirada o cerrada manualmente — borrar credenciales y generar nuevo QR
        console.log('[WhatsApp] 🔄 Sesión cerrada. Borrando credenciales y generando nuevo QR...');
        try {
          fs.rmSync(AUTH_DIR, { recursive: true, force: true });
        } catch (e) {
          console.warn('[WhatsApp] No se pudo limpiar AUTH_DIR:', e.message);
        }
      } else {
        console.log('[WhatsApp] Reconectando en 5 segundos...');
      }

      setTimeout(iniciarBaileys, 5000);
    }

    if (connection === 'open') {
      console.log(`[WhatsApp] ✅ Bot conectado — restaurante: ${RESTAURANTE_ID}`);
    }
  });

  // Manejar mensajes entrantes
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      if (msg.key.fromMe) continue;
      if (!msg.message) continue;
      if (msg.key.remoteJid.endsWith('@g.us')) continue; // Ignorar grupos

      const telefono = msg.key.remoteJid.replace('@s.whatsapp.net', '');

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
