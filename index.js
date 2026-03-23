require('dotenv').config();
const express = require('express');
const cors = require('cors');
const chatRoutes = require('./src/routes/chatRoutes');
const orderRoutes = require('./src/routes/orderRoutes');
const whatsappRoutes = require('./src/routes/whatsappRoutes');

const app = express();
app.use(cors());
app.use(express.json());

app.use('/chat', chatRoutes);
app.use('/orders', orderRoutes);
app.use('/whatsapp', whatsappRoutes);

app.get('/health', (req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 3001;
if (require.main === module) {
  app.listen(PORT, () => {
    const url = process.env.BACKEND_URL || `http://localhost:${PORT}`;
    console.log(`Servidor en puerto ${PORT}`);
    console.log(`[Config] URL del backend: ${url}`);
    console.log(`[Config] ↳ Copia esta URL en app-chef/.env → EXPO_PUBLIC_BACKEND_URL=${url}`);
    console.log(`[Config] QR de WhatsApp disponible en: ${url}/whatsapp/qr`);
  });

  // Iniciar Baileys solo si WHATSAPP_ENABLED=true
  if (process.env.WHATSAPP_ENABLED === 'true') {
    const { iniciarBaileys } = require('./src/whatsapp/baileys');
    iniciarBaileys().catch(err => {
      console.error('[WhatsApp] Error al iniciar Baileys:', err.message);
    });

    const { iniciarListenerNotificaciones } = require('./src/services/notificacionService');
    iniciarListenerNotificaciones();
  } else {
    console.log('[WhatsApp] Modo REST únicamente (WHATSAPP_ENABLED no está activado)');
  }
}

module.exports = app;
