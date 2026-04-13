const { Router } = require('express');
const {
  getHorario,
  saveHorario,
  getProteinasBloqueadas,
  setProteinasBloqueadas,
  registerPushToken,
} = require('../services/restauranteService');

const router = Router();

// Horario
router.get('/horario', async (req, res) => {
  try {
    const horario = await getHorario();
    res.json({ horario });
  } catch (err) {
    console.error('[GET /restaurante/horario]', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.put('/horario', async (req, res) => {
  try {
    const { horario } = req.body;
    if (!horario) return res.status(400).json({ error: 'Falta el campo horario' });
    await saveHorario(horario);
    res.json({ ok: true });
  } catch (err) {
    console.error('[PUT /restaurante/horario]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Proteinas bloqueadas
router.get('/proteinas', async (req, res) => {
  try {
    const proteinasBloqueadas = await getProteinasBloqueadas();
    res.json({ proteinasBloqueadas });
  } catch (err) {
    console.error('[GET /restaurante/proteinas]', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.put('/proteinas', async (req, res) => {
  try {
    const { proteinasBloqueadas } = req.body;
    if (!Array.isArray(proteinasBloqueadas)) {
      return res.status(400).json({ error: 'proteinasBloqueadas debe ser un array' });
    }
    await setProteinasBloqueadas(proteinasBloqueadas);
    res.json({ ok: true });
  } catch (err) {
    console.error('[PUT /restaurante/proteinas]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Push token
router.post('/push-token', async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'Falta el campo token' });
    await registerPushToken(token);
    res.json({ ok: true });
  } catch (err) {
    console.error('[POST /restaurante/push-token]', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
