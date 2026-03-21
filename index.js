require('dotenv').config();
const express = require('express');
const chatRoutes = require('./src/routes/chatRoutes');
const orderRoutes = require('./src/routes/orderRoutes');

const app = express();
app.use(express.json());

app.use('/chat', chatRoutes);
app.use('/orders', orderRoutes);

app.get('/health', (req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 3001;
if (require.main === module) {
  app.listen(PORT, () => console.log(`Servidor en puerto ${PORT}`));

  // Iniciar Baileys solo si WHATSAPP_ENABLED=true
  if (process.env.WHATSAPP_ENABLED === 'true') {
    const { iniciarBaileys } = require('./src/whatsapp/baileys');
    iniciarBaileys().catch(err => {
      console.error('[WhatsApp] Error al iniciar Baileys:', err.message);
    });
  } else {
    console.log('[WhatsApp] Modo REST únicamente (WHATSAPP_ENABLED no está activado)');
  }
}

module.exports = app;
