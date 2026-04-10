require('dotenv').config();
const express = require('express');
const cors = require('cors');
const chatRoutes = require('./src/routes/chatRoutes');
const orderRoutes = require('./src/routes/orderRoutes');
const whatsappRoutes = require('./src/routes/whatsappRoutes');
const { requireAuth } = require('./src/middleware/authMiddleware');
const { requestLogger } = require('./src/middleware/requestLogger');

const app = express();
app.use(cors());

app.use(express.json());

app.use(requestLogger);

app.use('/chat', chatRoutes);
app.use('/orders', requireAuth, orderRoutes);
app.use('/whatsapp', whatsappRoutes);

app.get('/health', (req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 3001;
if (require.main === module) {
  app.listen(PORT, () => {
    const url = process.env.BACKEND_URL || `http://localhost:${PORT}`;
    console.log(`Servidor en puerto ${PORT}`);
    console.log(`[Config] URL del backend: ${url}`);
    console.log(`[Config] ↳ Copia esta URL en app-chef/.env → EXPO_PUBLIC_BACKEND_URL=${url}`);
    console.log(`[Config] Webhook de WhatsApp: ${url}/whatsapp/webhook`);
  });

  if (process.env.WHATSAPP_ENABLED === 'true') {
    const { iniciarListenerNotificaciones } = require('./src/services/notificacionService');
    iniciarListenerNotificaciones();

    // Procesar notificaciones que quedaron pendientes de sesiones anteriores
    const { procesarCola } = require('./src/services/notificacionQueue');
    procesarCola().catch((err) => console.error('[Init] Error procesando cola:', err.message));
  } else {
    console.log('[WhatsApp] Listener de notificaciones desactivado (WHATSAPP_ENABLED != true)');
  }
}

module.exports = app;
