const express = require('express');
const { processMessage } = require('../agent/agentService');

const router = express.Router();

router.post('/', async (req, res) => {
  const { message, sessionId, restauranteId, telefono } = req.body;

  if (!message || !sessionId || !restauranteId) {
    return res.status(400).json({ error: 'message, sessionId y restauranteId son requeridos' });
  }

  try {
    const result = await processMessage({ message, sessionId, restauranteId, telefono });
    return res.json(result);
  } catch (err) {
    if (err.message && err.message.includes('Restaurante no encontrado')) {
      return res.status(404).json({ error: err.message });
    }
    console.error('[chatRoutes] Error:', err.message);
    return res.status(503).json({ error: 'Servicio temporalmente no disponible' });
  }
});

module.exports = router;
