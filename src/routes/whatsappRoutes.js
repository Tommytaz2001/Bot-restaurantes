const express = require('express');
const QRCode = require('qrcode');

const router = express.Router();

// GET /whatsapp/status — estado JSON de la sesión
router.get('/status', (req, res) => {
  const { getWAState } = require('../whatsapp/baileys');
  const state = getWAState();
  res.json({
    status: state.status,
    hasQR: !!state.qr,
    connectedAt: state.connectedAt,
  });
});

// GET /whatsapp/qr — página HTML con el QR para escanear
router.get('/qr', async (req, res) => {
  const { getWAState } = require('../whatsapp/baileys');
  const state = getWAState();

  // Si ya está conectado, mostrar pantalla de éxito
  if (state.status === 'connected') {
    return res.send(renderPage({
      title: 'WhatsApp Conectado',
      body: `
        <div class="status connected">
          <div class="icon">✓</div>
          <h2>Bot activo</h2>
          <p>WhatsApp conectado desde<br><strong>${new Date(state.connectedAt).toLocaleString()}</strong></p>
        </div>
      `,
      refresh: false,
    }));
  }

  // Si hay QR disponible, generarlo como imagen
  if (state.qr) {
    try {
      const qrDataURL = await QRCode.toDataURL(state.qr, {
        width: 280,
        margin: 2,
        color: { dark: '#000000', light: '#ffffff' },
      });

      return res.send(renderPage({
        title: 'Escanea el QR',
        body: `
          <div class="status waiting">
            <h2>Vincula WhatsApp</h2>
            <p>Abre WhatsApp en tu teléfono →<br><strong>Dispositivos vinculados → Vincular dispositivo</strong></p>
            <div class="qr-wrap">
              <img src="${qrDataURL}" alt="QR WhatsApp" width="280" height="280" />
            </div>
            <p class="hint">El QR expira en ~60 segundos. La página se actualiza automáticamente.</p>
          </div>
        `,
        refresh: true,
      }));
    } catch (err) {
      console.error('[whatsappRoutes] Error generando QR:', err.message);
    }
  }

  // Estado: iniciando / sin QR todavía
  res.send(renderPage({
    title: 'Iniciando...',
    body: `
      <div class="status loading">
        <div class="spinner"></div>
        <h2>Iniciando WhatsApp...</h2>
        <p>El QR aparecerá en unos segundos.</p>
      </div>
    `,
    refresh: true,
  }));
});

// ─── HTML template ────────────────────────────────────────────────────────────

function renderPage({ title, body, refresh }) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title} — Bot Restaurantes</title>
  ${refresh ? '<meta http-equiv="refresh" content="5" />' : ''}
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #0C0C0C;
      color: #E5E7EB;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .card {
      background: #161616;
      border: 1px solid #2A2A2A;
      border-radius: 16px;
      padding: 40px 32px;
      max-width: 380px;
      width: 90%;
      text-align: center;
    }
    .brand {
      font-size: 12px;
      letter-spacing: 0.15em;
      text-transform: uppercase;
      color: #6B7280;
      margin-bottom: 28px;
    }
    h2 { font-size: 20px; font-weight: 600; margin-bottom: 12px; color: #F9FAFB; }
    p  { font-size: 14px; color: #9CA3AF; line-height: 1.6; margin-bottom: 20px; }
    p strong { color: #E5E7EB; }

    /* QR */
    .qr-wrap {
      background: #fff;
      border-radius: 12px;
      padding: 12px;
      display: inline-block;
      margin: 4px 0 20px;
    }
    .hint { font-size: 12px; color: #6B7280; margin-bottom: 0; }

    /* Connected */
    .status.connected .icon {
      width: 64px; height: 64px; border-radius: 50%;
      background: rgba(52,211,153,0.15);
      color: #34D399;
      font-size: 28px; line-height: 64px;
      margin: 0 auto 20px;
    }
    .status.connected h2 { color: #34D399; }

    /* Spinner */
    .spinner {
      width: 48px; height: 48px;
      border: 3px solid #2A2A2A;
      border-top-color: #F59E0B;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      margin: 0 auto 20px;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    .refresh-note {
      font-size: 11px;
      color: #4B5563;
      margin-top: 24px;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="brand">Bot Restaurantes</div>
    ${body}
    ${refresh ? '<p class="refresh-note">Actualizando en 5 segundos...</p>' : ''}
  </div>
</body>
</html>`;
}

module.exports = router;
