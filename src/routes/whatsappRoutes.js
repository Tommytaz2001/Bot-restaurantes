const express = require('express');
const { estaActivo, pausarBot, reanudarBot } = require('../services/botStateService');
const { handleWebhook } = require('../whatsapp/metaWebhook');

const router = express.Router();

// GET /whatsapp/status — estado del bot
router.get('/status', (req, res) => {
  res.json({
    status: 'active',
    botActivo: estaActivo(),
  });
});

// POST /whatsapp/pause — pausa el bot (deja de responder mensajes)
router.post('/pause', (req, res) => {
  pausarBot();
  res.json({ botActivo: false });
});

// POST /whatsapp/resume — reanuda el bot
router.post('/resume', (req, res) => {
  reanudarBot();
  res.json({ botActivo: true });
});

// POST /whatsapp/webhook — mensajes entrantes de clientes via Evolution API
router.post('/webhook', handleWebhook);

module.exports = router;
