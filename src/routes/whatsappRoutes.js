const express = require('express');
const { estaActivo, pausarBot, reanudarBot, estaIgnorandoHorario, setIgnorarHorario } = require('../services/botStateService');
const { limpiarCooldownHorario } = require('../whatsapp/messageHandler');
const { handleWebhook } = require('../whatsapp/metaWebhook');
const { clearMenuCache } = require('../services/menuService');
const { requireAuth } = require('../middleware/authMiddleware');

const router = express.Router();

// GET /whatsapp/status — estado del bot
router.get('/status', requireAuth, (req, res) => {
  res.json({
    status: 'active',
    botActivo: estaActivo(),
    ignorarHorario: estaIgnorandoHorario(),
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

// POST /whatsapp/ignorar-horario — activa o desactiva modo test (ignorar horarios 24/7)
router.post('/ignorar-horario', (req, res) => {
  const { activo } = req.body || {};
  const nuevo = activo !== undefined ? !!activo : !estaIgnorandoHorario();
  setIgnorarHorario(nuevo);
  limpiarCooldownHorario();
  res.json({ ok: true, ignorarHorario: nuevo });
});

// GET /whatsapp/test-24-7 — botón rápido web para activar/desactivar modo test 24/7
router.get('/test-24-7', (req, res) => {
  const queryActivo = req.query.activo;
  const nuevo = queryActivo !== undefined ? (queryActivo === 'true' || queryActivo === '1') : !estaIgnorandoHorario();
  setIgnorarHorario(nuevo);
  limpiarCooldownHorario();
  res.send(`
    <!DOCTYPE html>
    <html lang="es">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Modo Test Horario — Urbano Bot</title>
      </head>
      <body style="font-family: system-ui, -apple-system, sans-serif; background: #0b0f17; color: #f8fafc; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; padding: 20px; box-sizing: border-box;">
        <div style="background: #182234; padding: 32px; border-radius: 24px; text-align: center; max-width: 440px; width: 100%; border: 2px solid ${nuevo ? '#10b981' : '#64748b'}; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);">
          <div style="font-size: 40px; margin-bottom: 12px;">${nuevo ? '⚡' : '🔒'}</div>
          <h2 style="margin: 0 0 10px 0; color: ${nuevo ? '#34d399' : '#94a3b8'}; font-size: 22px;">
            Modo Test (24/7): ${nuevo ? 'ACTIVADO' : 'DESACTIVADO'}
          </h2>
          <p style="color: #cbd5e1; font-size: 14px; line-height: 1.5; margin: 0 0 24px 0;">
            ${nuevo 
              ? 'El bot está configurado para <strong>ignorar el horario</strong> y responder inmediatamente a todos los mensajes de WhatsApp sin esperas ni cooldown.' 
              : 'El bot está respetando el horario comercial configurado habitualmente.'}
          </p>
          <a href="/whatsapp/test-24-7" style="display: inline-block; padding: 12px 24px; background: ${nuevo ? '#dc2626' : '#10b981'}; color: white; text-decoration: none; border-radius: 12px; font-weight: bold; font-size: 14px; transition: opacity 0.2s;">
            ${nuevo ? 'Desactivar Modo Test' : '⚡ Activar Modo Test (24/7)'}
          </a>
        </div>
      </body>
    </html>
  `);
});

// GET /whatsapp/ignorar-horario — consulta si el modo test 24/7 está activo
router.get('/ignorar-horario', (req, res) => {
  res.json({ ignorarHorario: estaIgnorandoHorario() });
});

// POST /whatsapp/cache/clear — invalida el caché de configuración (llamar tras cambios en Firestore)
// Sin auth: operación idempotente, no destructiva. La llama la app al guardar menú/horarios.
router.post('/cache/clear', (req, res) => {
  clearMenuCache();
  res.json({ ok: true });
});

// GET /whatsapp/write-stats — estado de la base de datos
router.get('/write-stats', (req, res) => {
  res.json({ database: 'postgresql', status: 'connected' });
});

const { setupEvolution, setWebhook } = require('../services/evolutionSetup');

// POST /whatsapp/webhook — mensajes entrantes de clientes via Evolution API
router.post('/webhook', handleWebhook);

// POST o GET /whatsapp/setup-webhook — Configura o refresca manualmente el webhook en Evolution API
router.all('/setup-webhook', async (req, res) => {
  const instance = req.query.instance || req.body?.instance || process.env.EVOLUTION_INSTANCE || 'bot-restaurantes';
  const containerName = process.env.BOT_CONTAINER_NAME || 'bot-restaurantes';
  const port = process.env.PORT || 3001;
  const webhookUrl = process.env.EVOLUTION_WEBHOOK_URL || `http://${containerName}:${port}/whatsapp/webhook`;

  try {
    const ok = await setWebhook(instance, webhookUrl);
    console.log(`[WhatsApp] Registro manual de webhook en "${instance}" (${webhookUrl}) → ${ok ? 'OK' : 'FALLÓ'}`);
    return res.json({ ok, instance, webhookUrl });
  } catch (err) {
    console.error(`[WhatsApp] Error configurando webhook:`, err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /whatsapp/connection-state — Consulta únicamente el estado de conexión sin regenerar QR
router.get('/connection-state', async (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');

  const apiUrl = process.env.EVOLUTION_API_URL;
  const apiKey = process.env.EVOLUTION_API_KEY;
  const instance = process.env.EVOLUTION_INSTANCE || 'bot-restaurantes';

  try {
    const stateRes = await fetch(`${apiUrl}/instance/connectionState/${instance}`, {
      headers: { apikey: apiKey },
    });
    const stateData = await stateRes.json().catch(() => ({}));
    const state = stateData?.instance?.state || stateData?.state || 'unknown';
    const isConnected = state === 'open';
    return res.json({ connected: isConnected, state, instance });
  } catch (err) {
    const causeDetail = err.cause?.code || err.cause?.message || '';
    const fullMsg = causeDetail ? `${err.message} (${causeDetail})` : err.message;
    console.error(`[WhatsApp] Error consultando /connection-state (${apiUrl}):`, fullMsg);
    return res.status(500).json({ error: fullMsg });
  }
});

// GET /whatsapp/get-qr — Obtiene un nuevo código QR explícitamente (se llama al cargar o al renovar)
router.get('/get-qr', async (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');

  const apiUrl = process.env.EVOLUTION_API_URL;
  const apiKey = process.env.EVOLUTION_API_KEY;
  const instance = process.env.EVOLUTION_INSTANCE || 'bot-restaurantes';

  if (!apiUrl || !apiKey) {
    console.error('[WhatsApp] EVOLUTION_API_URL o EVOLUTION_API_KEY no están configuradas en .env');
    return res.status(500).json({ error: 'Variables de Evolution API no configuradas en el servidor' });
  }

  try {
    let qrRes = await fetch(`${apiUrl}/instance/connect/${instance}`, {
      headers: { apikey: apiKey },
    });
    let qrData = await qrRes.json().catch(() => ({}));

    // Auto-recuperación: si la instancia no existe en Evolution API (404), la inicializamos
    const isNotFound = qrRes.status === 404 || qrData?.error === 'Not Found' ||
      (qrData?.message && String(qrData.message).toLowerCase().includes('not found'));

    if (isNotFound) {
      console.warn(`[WhatsApp] Instancia "${instance}" no encontrada en Evolution API (${qrRes.status}). Iniciando auto-configuración...`);
      const setupResult = await setupEvolution(instance);
      if (setupResult?.qr) {
        qrData = { base64: setupResult.qr };
        qrRes = { status: 200 };
      } else {
        qrRes = await fetch(`${apiUrl}/instance/connect/${instance}`, {
          headers: { apikey: apiKey },
        });
        qrData = await qrRes.json().catch(() => ({}));
      }
    } else if (process.env.NODE_ENV !== 'test') {
      // Si la instancia ya existe, asegurar que el webhook esté configurado en segundo plano
      setupEvolution(instance).catch(e => console.warn(`[WhatsApp] Auto-setup webhook en segundo plano: ${e.message}`));
    }

    const rawBase64 = qrData?.base64 || qrData?.qrcode?.base64 || qrData?.data?.base64 || null;
    let base64 = rawBase64;
    if (base64 && !base64.startsWith('data:image')) {
      base64 = `data:image/png;base64,${base64}`;
    }

    if (!base64) {
      console.warn(`[WhatsApp] /instance/connect respondió sin QR (HTTP ${qrRes.status}):`, JSON.stringify(qrData));
    } else {
      console.log(`[WhatsApp] Código QR obtenido exitosamente para instancia "${instance}"`);
    }

    return res.json({
      base64: base64 || null,
      pairingCode: qrData?.pairingCode || qrData?.qrcode?.pairingCode || null,
      status: qrRes.status,
      message: !base64 ? (qrData?.message || qrData?.error || 'Esperando generación del código QR por Evolution API...') : null
    });
  } catch (err) {
    const causeDetail = err.cause?.code || err.cause?.message || '';
    const fullMsg = causeDetail ? `${err.message} (${causeDetail})` : err.message;
    console.error(`[WhatsApp] Error conectando con Evolution API (${apiUrl}):`, fullMsg);
    return res.status(500).json({ error: fullMsg });
  }
});

// GET /whatsapp/pairing-code — Solicita código de 8 dígitos para emparejar por número de teléfono
router.get('/pairing-code', async (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  const apiUrl = process.env.EVOLUTION_API_URL;
  const apiKey = process.env.EVOLUTION_API_KEY;
  const instance = process.env.EVOLUTION_INSTANCE || 'bot-restaurantes';

  const rawPhone = req.query.number || req.query.phone;
  if (!rawPhone) {
    return res.status(400).json({ error: 'Parámetro "number" requerido (ej: 50586224206)' });
  }

  const cleanDigits = String(rawPhone).replace(/\D/g, '');
  const phone = cleanDigits.length === 8 ? `505${cleanDigits}` : cleanDigits;

  // Asegurar configuración del webhook en segundo plano
  if (process.env.NODE_ENV !== 'test') {
    setupEvolution(instance).catch(() => {});
  }

  try {
    const pairUrl = `${apiUrl}/instance/connect/${instance}?number=${phone}`;
    const pairRes = await fetch(pairUrl, {
      headers: { apikey: apiKey },
    });
    const pairData = await pairRes.json().catch(() => ({}));
    const pairingCode = pairData?.pairingCode || pairData?.qrcode?.pairingCode || pairData?.code || null;
    return res.json({
      ok: !!pairingCode,
      pairingCode,
      status: pairRes.status,
      raw: pairData,
    });
  } catch (err) {
    const causeDetail = err.cause?.code || err.cause?.message || '';
    const fullMsg = causeDetail ? `${err.message} (${causeDetail})` : err.message;
    console.error(`[WhatsApp] Error solicitando pairing code (${apiUrl}):`, fullMsg);
    return res.status(500).json({ error: fullMsg });
  }
});

// POST /whatsapp/restart-instance — Reinicia la instancia si la sesión quedó trabada
router.post('/restart-instance', async (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  const apiUrl = process.env.EVOLUTION_API_URL;
  const apiKey = process.env.EVOLUTION_API_KEY;
  const instance = process.env.EVOLUTION_INSTANCE || 'bot-restaurantes';

  try {
    console.log(`[WhatsApp] Reiniciando instancia "${instance}"...`);
    const rRes = await fetch(`${apiUrl}/instance/restart/${instance}`, {
      method: 'PUT',
      headers: { apikey: apiKey },
    }).catch(() => null);

    if (!rRes || rRes.status === 404) {
      await setupEvolution(instance);
    }
    return res.json({ ok: true });
  } catch (err) {
    console.error(`[WhatsApp] Error al reiniciar instancia:`, err.message);
    return res.status(500).json({ error: err.message });
  }
});

// GET /whatsapp/test-deploy-notification — Prueba o reenvío manual de la notificación de despliegue
router.get('/test-deploy-notification', async (req, res) => {
  const { notificarDespliegue } = require('../services/deployNotificationService');
  const result = await notificarDespliegue({ force: true });
  return res.json(result);
});

// GET /whatsapp/qr — página interactiva moderna con QR estable y contador
router.get('/qr', (req, res) => {
  const instance = process.env.EVOLUTION_INSTANCE || 'bot-restaurantes';

  res.send(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Conectar WhatsApp — Bot Restaurante</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background: #090d16;
      color: #f1f5f9;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      padding: 1.5rem;
    }
    .card {
      background: #111827;
      border: 1px solid #1f2937;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5);
      border-radius: 16px;
      padding: 2.5rem;
      max-width: 440px;
      width: 100%;
      text-align: center;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 14px;
      border-radius: 9999px;
      font-size: 0.85rem;
      font-weight: 600;
      margin-bottom: 1.5rem;
      background: #1e293b;
      color: #94a3b8;
    }
    .badge.connected {
      background: rgba(34, 197, 94, 0.15);
      color: #4ade80;
      border: 1px solid rgba(34, 197, 94, 0.3);
    }
    .badge.waiting {
      background: rgba(234, 179, 8, 0.15);
      color: #facc15;
      border: 1px solid rgba(234, 179, 8, 0.3);
    }
    h1 {
      font-size: 1.5rem;
      font-weight: 700;
      margin-bottom: 0.75rem;
      color: #ffffff;
    }
    p.subtitle {
      color: #94a3b8;
      font-size: 0.95rem;
      margin-bottom: 1.25rem;
      line-height: 1.4;
    }
    .qr-container {
      background: #ffffff;
      padding: 1rem;
      border-radius: 12px;
      display: inline-block;
      margin: 0.5rem 0 1rem;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
      min-height: 250px;
      min-width: 250px;
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
    }
    .qr-container img {
      display: block;
      max-width: 250px;
      height: auto;
      border-radius: 4px;
    }
    .timer-bar-wrap {
      width: 100%;
      height: 4px;
      background: #1e293b;
      border-radius: 2px;
      margin-bottom: 1rem;
      overflow: hidden;
    }
    .timer-bar {
      height: 100%;
      background: #25D366;
      width: 100%;
      transition: width 1s linear;
    }
    .timer-label {
      font-size: 0.8rem;
      color: #94a3b8;
      margin-bottom: 1rem;
    }
    .btn-renew {
      background: #1e293b;
      border: 1px solid #334155;
      color: #e2e8f0;
      padding: 7px 14px;
      border-radius: 8px;
      font-size: 0.82rem;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 1rem;
      transition: all 0.2s;
    }
    .btn-renew:hover {
      background: #334155;
    }
    .steps {
      text-align: left;
      background: #1a2234;
      border: 1px solid #283548;
      border-radius: 10px;
      padding: 1rem 1.25rem;
      margin-top: 0.5rem;
      font-size: 0.88rem;
      color: #cbd5e1;
    }
    .steps ol {
      padding-left: 1.2rem;
      line-height: 1.6;
    }
    .steps strong {
      color: #25D366;
    }
    .footer-hint {
      margin-top: 1.25rem;
      font-size: 0.8rem;
      color: #64748b;
    }
    .btn-action {
      background: #25D366;
      color: #000;
      font-weight: 700;
      text-decoration: none;
      padding: 10px 20px;
      border-radius: 8px;
      display: inline-block;
      margin-top: 1rem;
      transition: opacity 0.2s;
    }
    .btn-action:hover { opacity: 0.9; }
    .spinner {
      border: 3px solid #334155;
      border-top: 3px solid #25D366;
      border-radius: 50%;
      width: 36px;
      height: 36px;
      animation: spin 1s linear infinite;
      margin: 0 auto;
    }
    .tab-btn {
      flex: 1;
      padding: 8px 12px;
      border: none;
      background: transparent;
      color: #94a3b8;
      font-size: 0.85rem;
      font-weight: 600;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.2s;
    }
    .tab-btn.active {
      background: #334155;
      color: #ffffff;
    }
    @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div class="card" id="mainCard">
    <div id="badgeStatus" class="badge waiting">⏳ Comprobando estado...</div>
    <h1 id="titleHeader">Vinculación de WhatsApp</h1>
    <p class="subtitle" id="subtitleText">Elige el método de emparejamiento que prefieras:</p>

    <!-- Pestañas de selección -->
    <div id="tabsWrapper" style="display:flex; gap:6px; margin-bottom:1.25rem; background:#1e293b; padding:4px; border-radius:10px;">
      <button id="tabQr" class="tab-btn active" onclick="switchTab('qr')">📷 Código QR</button>
      <button id="tabPair" class="tab-btn" onclick="switchTab('pair')">🔢 Código de 8 Dígitos</button>
    </div>

    <!-- Sección QR -->
    <div id="sectionQr">
      <div class="qr-container" id="qrWrapper">
        <div class="spinner"></div>
      </div>

      <div class="timer-bar-wrap" id="timerWrap">
        <div class="timer-bar" id="timerBar"></div>
      </div>
      <div class="timer-label" id="timerLabel">Código QR válido por <span id="secsLeft">35</span>s</div>

      <div style="display:flex; justify-content:center; gap:8px; margin-bottom:1rem;">
        <button class="btn-renew" id="btnRenew" onclick="loadNewQR()">🔄 Renovar código QR</button>
        <button class="btn-renew" id="btnRestart" style="background:#334155;" onclick="restartInstance()">⚡ Reiniciar sesión</button>
      </div>

      <div class="steps" id="stepsGuide">
        <ol>
          <li>Abre <strong>WhatsApp</strong> en tu teléfono</li>
          <li>Toca los tres puntos ⋮ o Ajustes ⚙️</li>
          <li>Selecciona <strong>Dispositivos vinculados</strong></li>
          <li>Toca <strong>Vincular un dispositivo</strong> y apunta al QR</li>
        </ol>
      </div>
    </div>

    <!-- Sección Pairing Code (vincular con número) -->
    <div id="sectionPair" style="display:none;">
      <div style="background:#1a2234; border:1px solid #283548; border-radius:12px; padding:1.25rem; margin-bottom:1rem; text-align:left;">
        <label style="display:block; font-size:0.85rem; color:#cbd5e1; margin-bottom:6px; font-weight:600;">Número de WhatsApp del bot:</label>
        <input type="tel" id="inputPhone" placeholder="Ej: 50586224206 o 593961699586" style="width:100%; padding:10px 14px; border-radius:8px; background:#0b0f17; color:#f8fafc; border:1px solid #334155; font-size:1rem; margin-bottom:10px; box-sizing:border-box;">
        <button id="btnGetPair" onclick="requestPairingCode()" class="btn-action" style="width:100%; border:none; cursor:pointer; text-align:center; padding:12px;">Solicitar Código de 8 Dígitos</button>
      </div>

      <div id="pairingCodeDisplay" style="display:none; background:#0f172a; border:2px dashed #22c55e; border-radius:12px; padding:16px; margin-bottom:1rem;">
        <div style="font-size:0.85rem; color:#94a3b8; margin-bottom:6px;">Ingresa este código en WhatsApp:</div>
        <div id="codeValue" style="font-size:2.2rem; font-weight:800; letter-spacing:4px; color:#4ade80;">---- ----</div>
      </div>

      <div class="steps">
        <ol>
          <li>Abre <strong>WhatsApp</strong> ➔ Ajustes ⚙️ ➔ <strong>Dispositivos vinculados</strong></li>
          <li>Toca <strong>Vincular un dispositivo</strong></li>
          <li>Toca <strong>"Vincular con el número de teléfono"</strong> (abajo)</li>
          <li>Escribe el código de 8 dígitos mostrado arriba</li>
        </ol>
      </div>
    </div>

    <p class="footer-hint" id="footerHint">Instancia: <code>${instance}</code> • Evolution API v2</p>
  </div>

  <script>
    const qrWrapper = document.getElementById('qrWrapper');
    const badgeStatus = document.getElementById('badgeStatus');
    const titleHeader = document.getElementById('titleHeader');
    const subtitleText = document.getElementById('subtitleText');
    const stepsGuide = document.getElementById('stepsGuide');
    const timerBar = document.getElementById('timerBar');
    const timerWrap = document.getElementById('timerWrap');
    const timerLabel = document.getElementById('timerLabel');
    const btnRenew = document.getElementById('btnRenew');
    const btnRestart = document.getElementById('btnRestart');
    const secsLeft = document.getElementById('secsLeft');

    let isConnected = false;
    let isLoadingQR = false;
    const QR_LIFETIME = 35;
    let secondsRemaining = QR_LIFETIME;
    let qrTimerInterval = null;

    function startCountdown() {
      if (qrTimerInterval) clearInterval(qrTimerInterval);
      secondsRemaining = QR_LIFETIME;
      secsLeft.textContent = secondsRemaining;
      timerBar.style.width = '100%';

      qrTimerInterval = setInterval(() => {
        if (isConnected) {
          clearInterval(qrTimerInterval);
          return;
        }
        secondsRemaining--;
        secsLeft.textContent = Math.max(0, secondsRemaining);
        const pct = (secondsRemaining / QR_LIFETIME) * 100;
        timerBar.style.width = Math.max(0, pct) + '%';

        if (secondsRemaining <= 0) {
          clearInterval(qrTimerInterval);
          loadNewQR();
        }
      }, 1000);
    }

    async function restartInstance() {
      if (qrTimerInterval) clearInterval(qrTimerInterval);
      qrWrapper.innerHTML = '<div class="spinner"></div><p style="color:#94a3b8; font-size:0.85rem; margin-top:10px;">Reiniciando instancia en Evolution API...</p>';
      try {
        await fetch('/whatsapp/restart-instance', { method: 'POST', cache: 'no-store' });
        setTimeout(() => { isLoadingQR = false; loadNewQR(); }, 4000);
      } catch (e) {
        setTimeout(() => { isLoadingQR = false; loadNewQR(); }, 2000);
      }
    }

    async function loadNewQR() {
      if (isConnected || isLoadingQR) return;
      isLoadingQR = true;
      qrWrapper.innerHTML = '<div class="spinner"></div>';
      try {
        const res = await fetch('/whatsapp/get-qr', { cache: 'no-store' });
        const data = await res.json();
        if (data.base64) {
          qrWrapper.innerHTML = '<img src="' + data.base64 + '" alt="QR WhatsApp" />';
          startCountdown();
        } else {
          const detail = data.message ? '<br><small style="color:#94a3b8; font-size:0.75rem; display:block; margin-top:6px;">' + (typeof data.message === 'string' ? data.message : JSON.stringify(data.message)) + '</small>' : '';
          qrWrapper.innerHTML = '<p style="color:#f87171; font-size:0.85rem;">⏳ Generando nuevo código...' + detail + '</p>';
          setTimeout(() => {
            isLoadingQR = false;
            loadNewQR();
          }, 3500);
          return;
        }
      } catch (e) {
        qrWrapper.innerHTML = '<p style="color:#f87171; font-size:0.85rem;">Error al obtener QR<br><small style="color:#94a3b8; font-size:0.75rem;">' + e.message + '</small></p>';
      }
      isLoadingQR = false;
    }

    // Polling ligero ONLY de connection-state (NO regenera QR)
    async function checkConnectionOnly() {
      try {
        const res = await fetch('/whatsapp/connection-state', { cache: 'no-store' });
        const data = await res.json();

        if (data.connected) {
          if (!isConnected) {
            isConnected = true;
            fetch('/whatsapp/setup-webhook', { method: 'POST' }).catch(() => {});
            if (qrTimerInterval) clearInterval(qrTimerInterval);
            badgeStatus.className = 'badge connected';
            badgeStatus.innerHTML = '● Conectado a WhatsApp';
            titleHeader.innerHTML = '🎉 ¡WhatsApp Vinculado con éxito!';
            subtitleText.innerHTML = 'El bot ya está atendiendo pedidos en tiempo real con Gemini.';
            const tabsWrapper = document.getElementById('tabsWrapper');
            if (tabsWrapper) tabsWrapper.style.display = 'none';
            const sectionQr = document.getElementById('sectionQr');
            if (sectionQr) sectionQr.style.display = 'none';
            const sectionPair = document.getElementById('sectionPair');
            if (sectionPair) sectionPair.style.display = 'none';
            qrWrapper.style.display = 'none';
            timerWrap.style.display = 'none';
            timerLabel.style.display = 'none';
            btnRenew.style.display = 'none';
            if (btnRestart) btnRestart.style.display = 'none';
            stepsGuide.innerHTML = '<div style="text-align:center; padding: 0.5rem 0;">' +
              '<p style="color:#4ade80; font-size:1.1rem; font-weight:600; margin-bottom:0.5rem;">Tu número está enlazado y listo</p>' +
              '<p style="color:#94a3b8; font-size:0.85rem;">Escribe "Hola" desde cualquier chat para iniciar una orden.</p>' +
              '<a href="/logs?auth=admin" class="btn-action" style="margin-top:1rem;">Ver Monitor de Eventos</a>' +
              '</div>';
          }
        } else {
          if (isConnected) {
            isConnected = false;
            badgeStatus.className = 'badge waiting';
            badgeStatus.innerHTML = '● Desconectado';
            const tabsWrapper = document.getElementById('tabsWrapper');
            if (tabsWrapper) tabsWrapper.style.display = 'flex';
            loadNewQR();
          } else {
            badgeStatus.className = 'badge waiting';
            badgeStatus.innerHTML = '● Esperando vinculación';
          }
        }
      } catch (e) {
        // Red temporal
      }
    }

    function switchTab(tab) {
      const tabQr = document.getElementById('tabQr');
      const tabPair = document.getElementById('tabPair');
      const sectionQr = document.getElementById('sectionQr');
      const sectionPair = document.getElementById('sectionPair');
      if (tab === 'qr') {
        tabQr.classList.add('active');
        tabPair.classList.remove('active');
        sectionQr.style.display = 'block';
        sectionPair.style.display = 'none';
      } else {
        tabQr.classList.remove('active');
        tabPair.classList.add('active');
        sectionQr.style.display = 'none';
        sectionPair.style.display = 'block';
      }
    }

    async function requestPairingCode() {
      const input = document.getElementById('inputPhone');
      const phone = (input.value || '').trim();
      if (!phone) {
        alert('Por favor escribe tu número de teléfono con código de país (ej: 50586224206 o 593961699586)');
        return;
      }
      const btn = document.getElementById('btnGetPair');
      const display = document.getElementById('pairingCodeDisplay');
      const codeVal = document.getElementById('codeValue');

      btn.disabled = true;
      btn.textContent = 'Solicitando código...';

      try {
        const res = await fetch('/whatsapp/pairing-code?number=' + encodeURIComponent(phone), { cache: 'no-store' });
        const data = await res.json();
        if (data.ok && data.pairingCode) {
          codeVal.textContent = data.pairingCode;
          display.style.display = 'block';
        } else {
          const msg = data.error || data.raw?.message || 'No se pudo generar el código. Si la instancia está ocupada, intenta reiniciar sesión en la pestaña QR primero.';
          alert('Aviso: ' + msg);
        }
      } catch (e) {
        alert('Error conectando: ' + e.message);
      } finally {
        btn.disabled = false;
        btn.textContent = 'Solicitar Código de 8 Dígitos';
      }
    }

    // Inicializar: obtener QR una vez y monitorear conexión cada 2s
    loadNewQR();
    setInterval(checkConnectionOnly, 2000);
  </script>
</body>
</html>`);
});

module.exports = router;
