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
const blacklistRoutes = require('./src/routes/blacklistRoutes');
const { requireAuth } = require('./src/middleware/authMiddleware');
const { requestLogger } = require('./src/middleware/requestLogger');
const { initDb } = require('./src/db/initDb');

const app = express();
app.use(cors());

app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));
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
app.use('/blacklist', requireAuth, blacklistRoutes);


app.get('/health', (req, res) => res.json({ status: 'ok', database: 'postgresql', time: new Date() }));

// Manejador centralizado de errores de Express (captura PayloadTooLargeError y fallos de parsing)
app.use((err, req, res, next) => {
  if (err.type === 'entity.too.large' || err.status === 413) {
    console.warn(`[HTTP] [WARN] Payload demasiado grande en ${req.method} ${req.originalUrl} (${err.message})`);
    return res.status(413).json({ error: 'Payload Too Large', message: 'El cuerpo de la petición excede el tamaño máximo permitido' });
  }
  if (err.status === 400 && err.type === 'entity.parse.failed') {
    console.warn(`[HTTP] [WARN] JSON inválido en ${req.method} ${req.originalUrl}`);
    return res.status(400).json({ error: 'Bad Request', message: 'JSON malformado' });
  }
  console.error('[Express] Error interno:', err);
  res.status(err.status || 500).json({ error: err.message || 'Error interno del servidor' });
});

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

  if (process.env.WHATSAPP_ENABLED === 'true' || process.env.EVOLUTION_API_URL) {
    const { setupEvolution } = require('./src/services/evolutionSetup');
    setupEvolution()
      .then(() => {
        const { notificarDespliegue } = require('./src/services/deployNotificationService');
        notificarDespliegue().catch((err) => {
          console.error('[Deploy] Error en notificación de redespliegue:', err.message);
        });
      })
      .catch((err) => {
        console.error('[Evolution] Error en setup:', err.message);
      });

    const { iniciarListenerNotificaciones } = require('./src/services/notificacionService');
    iniciarListenerNotificaciones();
  } else {
    console.log('[WhatsApp] Listener de notificaciones desactivado (WHATSAPP_ENABLED != true)');
  }
}

module.exports = app;
