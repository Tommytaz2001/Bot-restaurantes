require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');

const authRoutes = require('./src/routes/authRoutes');
const chatRoutes = require('./src/routes/chatRoutes');
const orderRoutes = require('./src/routes/orderRoutes');
const whatsappRoutes = require('./src/routes/whatsappRoutes');
const logRoutes = require('./src/routes/logRoutes');
const pedidosAdminRoutes = require('./src/routes/pedidosAdminRoutes');
const restauranteRoutes = require('./src/routes/restauranteRoutes');
const menuAdminRoutes = require('./src/routes/menuAdminRoutes');
const { requireAuth } = require('./src/middleware/authMiddleware');
const { requestLogger } = require('./src/middleware/requestLogger');
const { initDb } = require('./src/db/initDb');

const app = express();
app.use(cors());

app.use(express.json());
app.use(cookieParser(process.env.LOGS_SESSION_SECRET || 'cambiar_este_secreto'));
app.use(requestLogger);

// Servir archivos estáticos (comprobantes de pago)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Rutas públicas y de autenticación
app.use('/auth', authRoutes);
app.use('/chat', chatRoutes);
app.use('/whatsapp', whatsappRoutes);
app.use('/logs', logRoutes);

// Rutas protegidas para administración de pedidos y restaurante
app.use('/orders', requireAuth, orderRoutes);
app.use('/pedidos-admin', pedidosAdminRoutes); // Contiene middleware requireAuth / requireAuthQuery internamente
app.use('/restaurante', requireAuth, restauranteRoutes);
app.use('/menu-admin', requireAuth, menuAdminRoutes);

app.get('/health', (req, res) => res.json({ status: 'ok', database: 'postgresql', time: new Date() }));

const PORT = process.env.PORT || 3001;
if (require.main === module) {
  // Inicializar base de datos PostgreSQL
  initDb().catch((err) => {
    console.error('[Init] Error inicializando base de datos:', err.message);
  });

  app.listen(PORT, () => {
    const url = process.env.BACKEND_URL || `http://localhost:${PORT}`;
    console.log(`[Servidor] Listo en puerto ${PORT}`);
    console.log(`[Config] URL del backend: ${url}`);
    console.log(`[Config] Webhook de WhatsApp: ${url}/whatsapp/webhook`);
  });

  if (process.env.WHATSAPP_ENABLED === 'true') {
    const { setupEvolution } = require('./src/services/evolutionSetup');
    setupEvolution();

    const { iniciarListenerNotificaciones } = require('./src/services/notificacionService');
    iniciarListenerNotificaciones();
  } else {
    console.log('[WhatsApp] Listener de notificaciones desactivado (WHATSAPP_ENABLED != true)');
  }
}

module.exports = app;
