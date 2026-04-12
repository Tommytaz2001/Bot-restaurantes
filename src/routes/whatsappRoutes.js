const express = require('express');
const { estaActivo, pausarBot, reanudarBot } = require('../services/botStateService');
const { handleWebhook } = require('../whatsapp/metaWebhook');
const { clearMenuCache } = require('../services/menuService');
const { requireAuth } = require('../middleware/authMiddleware');
const { getWriteStats } = require('../services/firebaseService');

const router = express.Router();

// GET /whatsapp/status — estado del bot
router.get('/status', requireAuth, (req, res) => {
  res.json({
    status: 'active',
    botActivo: estaActivo(),
  });
});

// POST /whatsapp/pause — pausa el bot (deja de responder mensajes)
router.post('/pause', requireAuth, (req, res) => {
  pausarBot();
  res.json({ botActivo: false });
});

// POST /whatsapp/resume — reanuda el bot
router.post('/resume', requireAuth, (req, res) => {
  reanudarBot();
  res.json({ botActivo: true });
});

// POST /whatsapp/cache/clear — invalida el caché de configuración (llamar tras cambios en Firestore)
// Sin auth: operación idempotente, no destructiva. La llama la app al guardar menú/horarios.
router.post('/cache/clear', (req, res) => {
  clearMenuCache();
  res.json({ ok: true });
});

// GET /whatsapp/write-stats — diagnóstico de escrituras Firestore
router.get('/write-stats', (req, res) => {
  res.json(getWriteStats());
});

// POST /whatsapp/webhook — mensajes entrantes de clientes via Evolution API
router.post('/webhook', handleWebhook);

// GET /whatsapp/qr — página para ver y escanear el QR de Evolution API
router.get('/qr', async (req, res) => {
  const apiUrl = process.env.EVOLUTION_API_URL;
  const apiKey = process.env.EVOLUTION_API_KEY;
  const instance = process.env.EVOLUTION_INSTANCE;

  try {
    // Verificar estado de conexión
    const stateRes = await fetch(`${apiUrl}/instance/connectionState/${instance}`, {
      headers: { apikey: apiKey },
    });
    const stateData = await stateRes.json();

    if (stateData?.instance?.state === 'open') {
      return res.send(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>WhatsApp QR</title>
<style>body{font-family:sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#0a1628;color:#fff;}
.card{text-align:center;padding:2rem;border-radius:12px;background:#1a2942;}
.connected{color:#4ade80;font-size:1.5rem;}</style></head>
<body><div class="card"><p class="connected">✅ WhatsApp conectado</p>
<p>La instancia <strong>${instance}</strong> ya está vinculada.</p>
<p style="margin-top:1rem;"><a href="/whatsapp/qr" style="color:#60a5fa;">Recargar</a></p>
</div></body></html>`);
    }

    // Obtener QR
    const qrRes = await fetch(`${apiUrl}/instance/connect/${instance}`, {
      headers: { apikey: apiKey },
    });
    const qrData = await qrRes.json();
    const base64 = qrData?.base64;

    res.send(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>WhatsApp QR</title>
<meta http-equiv="refresh" content="30">
<style>body{font-family:sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#0a1628;color:#fff;}
.card{text-align:center;padding:2rem;border-radius:12px;background:#1a2942;}
img{border-radius:8px;margin:1rem 0;max-width:300px;}
.hint{color:#94a3b8;font-size:0.9rem;}</style></head>
<body><div class="card">
<h2>📱 Escanea el QR con WhatsApp</h2>
<p>WhatsApp → Dispositivos vinculados → Vincular dispositivo</p>
${base64 ? `<img src="${base64}" alt="QR Code"/>` : '<p style="color:#f87171;">⏳ QR no disponible aún. La página se recarga automáticamente...</p>'}
<p class="hint">Instancia: ${instance}</p>
<p class="hint">La página se recarga cada 30 segundos</p>
</div></body></html>`);
  } catch (err) {
    res.status(500).send(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>WhatsApp QR - Error</title>
<meta http-equiv="refresh" content="10">
<style>body{font-family:sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#0a1628;color:#fff;}
.card{text-align:center;padding:2rem;border-radius:12px;background:#1a2942;}</style></head>
<body><div class="card">
<h2 style="color:#f87171;">❌ Error conectando con Evolution API</h2>
<p>${err.message}</p>
<p style="color:#94a3b8;">Reintentando en 10 segundos...</p>
</div></body></html>`);
  }
});

module.exports = router;
