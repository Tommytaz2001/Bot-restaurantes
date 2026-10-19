const fs = require('fs');
const path = require('path');
const express = require('express');

const router = express.Router();
const LOG_FILE = path.join(__dirname, '../../data/logs.ndjson');

// ── Auth middleware ────────────────────────────────────────────────────────────

function requireLogs(req, res, next) {
  const validUser = process.env.LOGS_USER || 'admin';
  const validPass = process.env.LOGS_PASSWORD || 'admin';

  if (req.query.auth === validUser || req.query.key === validPass) {
    res.cookie('logs_session', validUser, {
      signed: true,
      httpOnly: true,
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 días
      sameSite: 'lax',
    });
    return next();
  }

  const session = req.signedCookies?.logs_session;
  if (session && session === validUser) return next();

  if (req.path === '/data') {
    return res.status(401).json({ error: 'No autorizado' });
  }
  res.redirect('/logs/login');
}

// ── Login ──────────────────────────────────────────────────────────────────────

router.get('/login', (req, res) => {
  const validUser = process.env.LOGS_USER || 'admin';
  const session = req.signedCookies?.logs_session;
  if (session && session === validUser) return res.redirect('/logs');

  const error = req.query.error
    ? '<div class="alert error">❌ Usuario o contraseña incorrectos.</div>'
    : '';

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Acceso — Monitor de Logs</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background: #090d16; color: #f1f5f9;
      display: flex; align-items: center; justify-content: center; min-height: 100vh;
      padding: 1.5rem;
    }
    .card {
      background: #111827; border: 1px solid #1f2937; border-radius: 16px;
      padding: 2.5rem; width: 100%; max-width: 400px;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);
    }
    .header { text-align: center; margin-bottom: 2rem; }
    .icon { font-size: 2.5rem; margin-bottom: 0.5rem; }
    h1 { font-size: 1.4rem; font-weight: 700; color: #fff; }
    p.sub { font-size: 0.85rem; color: #94a3b8; margin-top: 4px; }
    label { display: block; font-size: 11px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 6px; font-weight: 600; }
    input {
      width: 100%; padding: 12px 14px; background: #1e293b; border: 1px solid #334155;
      border-radius: 8px; color: #fff; font-size: 14px; margin-bottom: 1.2rem;
      transition: border-color 0.2s;
    }
    input:focus { outline: none; border-color: #3b82f6; }
    button.btn-primary {
      width: 100%; padding: 12px; background: #3b82f6; border: none;
      border-radius: 8px; color: #fff; font-weight: 600; font-size: 15px; cursor: pointer;
      transition: background 0.2s;
    }
    button.btn-primary:hover { background: #2563eb; }
    .btn-autofill {
      display: block; width: 100%; margin-top: 10px; padding: 8px;
      background: transparent; border: 1px dashed #334155; border-radius: 8px;
      color: #94a3b8; font-size: 12px; cursor: pointer; transition: all 0.2s;
    }
    .btn-autofill:hover { border-color: #64748b; color: #cbd5e1; }
    .alert { padding: 10px 14px; border-radius: 8px; font-size: 13px; margin-bottom: 1.2rem; }
    .alert.error { background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.3); color: #f87171; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <div class="icon">⚡</div>
      <h1>Monitor de Operaciones</h1>
      <p class="sub">Acceso administrativo a eventos y logs en tiempo real</p>
    </div>
    ${error}
    <form method="POST" action="/logs/login" id="loginForm">
      <label for="user">Usuario</label>
      <input type="text" id="user" name="user" autocomplete="username" value="${validUser}" required>
      <label for="pass">Contraseña</label>
      <input type="password" id="pass" name="pass" autocomplete="current-password" required autofocus>
      <button type="submit" class="btn-primary">Entrar al Monitor</button>
      <button type="button" class="btn-autofill" onclick="autoFill()">Completar credenciales por defecto</button>
    </form>
  </div>
  <script>
    function autoFill() {
      document.getElementById('user').value = '${validUser}';
      document.getElementById('pass').value = '${process.env.LOGS_PASSWORD || ""}';
      document.getElementById('loginForm').submit();
    }
  </script>
</body>
</html>`);
});

router.post('/login', express.urlencoded({ extended: false }), (req, res) => {
  const { user, pass } = req.body;
  const validUser = process.env.LOGS_USER || 'admin';
  const validPass = process.env.LOGS_PASSWORD;

  if (validUser && validPass && user === validUser && pass === validPass) {
    res.cookie('logs_session', user, {
      signed: true,
      httpOnly: true,
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 días
      sameSite: 'lax',
    });
    return res.redirect('/logs');
  }
  res.redirect('/logs/login?error=1');
});

router.get('/logout', (req, res) => {
  res.clearCookie('logs_session');
  res.redirect('/logs/login');
});

// ── Data endpoint ──────────────────────────────────────────────────────────────

// GET /logs/data?limit=500&filter=<texto>&after=<isoTimestamp>
router.get('/data', requireLogs, (req, res) => {
  const limit  = Math.min(parseInt(req.query.limit) || 300, 1000);
  const filter = (req.query.filter || '').toLowerCase();
  const after  = req.query.after || null;

  let lines = [];
  try {
    if (fs.existsSync(LOG_FILE)) {
      const content = fs.readFileSync(LOG_FILE, 'utf8');
      lines = content
        .trim()
        .split('\n')
        .filter(Boolean)
        .map(line => {
          try { return JSON.parse(line); } catch { return null; }
        })
        .filter(Boolean);
    }
  } catch (_) { /* no fallar */ }

  if (after)  lines = lines.filter(e => e.ts > after);
  if (filter) lines = lines.filter(e => e.msg.toLowerCase().includes(filter));

  res.json(lines.slice(-limit));
});

// ── Logs viewer (HTML) ─────────────────────────────────────────────────────────

router.get('/', requireLogs, (req, res) => {
  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Live Logs — Bot & Cocina</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }

    :root {
      --bg: #090d16;
      --card-bg: #111827;
      --border: #1f2937;
      --text: #f1f5f9;
      --text-muted: #94a3b8;
      --accent: #3b82f6;
      --wa: #25d366;
      --ai: #a855f7;
      --order: #10b981;
      --db: #06b6d4;
      --err: #ef4444;
      --warn: #f59e0b;
    }

    body {
      font-family: 'Plus Jakarta Sans', -apple-system, sans-serif;
      background: var(--bg);
      color: var(--text);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }

    header {
      background: var(--card-bg);
      border-bottom: 1px solid var(--border);
      padding: 0.75rem 1.5rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 1rem;
      position: sticky;
      top: 0;
      z-index: 100;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .brand-icon {
      background: linear-gradient(135deg, #3b82f6, #8b5cf6);
      width: 36px;
      height: 36px;
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.2rem;
      box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
    }

    .brand-title {
      font-size: 1.1rem;
      font-weight: 700;
      letter-spacing: -0.3px;
    }

    .brand-subtitle {
      font-size: 0.75rem;
      color: var(--text-muted);
    }

    .nav-links {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .nav-link {
      color: var(--text-muted);
      text-decoration: none;
      font-size: 0.85rem;
      font-weight: 500;
      padding: 6px 12px;
      border-radius: 8px;
      border: 1px solid var(--border);
      background: rgba(31, 41, 55, 0.5);
      transition: all 0.2s;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .nav-link:hover {
      color: #fff;
      border-color: #374151;
      background: #1f2937;
    }

    .nav-link.danger:hover {
      border-color: rgba(239, 68, 68, 0.4);
      color: #f87171;
    }

    /* ── Metrics Bar ── */
    .metrics-bar {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 1rem;
      padding: 1.25rem 1.5rem;
      background: rgba(17, 24, 39, 0.6);
      border-bottom: 1px solid var(--border);
    }

    .metric-card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 0.85rem 1.2rem;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .metric-label {
      font-size: 0.75rem;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.6px;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .metric-value {
      font-size: 1.4rem;
      font-weight: 700;
      color: #fff;
    }

    /* ── Control Bar ── */
    .toolbar {
      padding: 1rem 1.5rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 1rem;
      background: var(--bg);
    }

    .filters {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }

    .pill {
      background: #111827;
      border: 1px solid var(--border);
      color: var(--text-muted);
      padding: 6px 14px;
      border-radius: 9999px;
      font-size: 0.82rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .pill:hover {
      border-color: #374151;
      color: #fff;
    }

    .pill.active {
      background: #3b82f6;
      border-color: #3b82f6;
      color: #fff;
      box-shadow: 0 4px 10px rgba(59, 130, 246, 0.3);
    }

    .pill.active.wa { background: #16a34a; border-color: #16a34a; box-shadow: 0 4px 10px rgba(22, 163, 74, 0.3); }
    .pill.active.ai { background: #9333ea; border-color: #9333ea; box-shadow: 0 4px 10px rgba(147, 51, 234, 0.3); }
    .pill.active.order { background: #059669; border-color: #059669; box-shadow: 0 4px 10px rgba(5, 150, 105, 0.3); }
    .pill.active.db { background: #0891b2; border-color: #0891b2; box-shadow: 0 4px 10px rgba(8, 145, 178, 0.3); }
    .pill.active.err { background: #dc2626; border-color: #dc2626; box-shadow: 0 4px 10px rgba(220, 38, 38, 0.3); }

    .actions {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
    }

    .search-box {
      position: relative;
    }

    .search-box input {
      background: #111827;
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 8px 12px 8px 32px;
      color: #fff;
      font-size: 0.85rem;
      width: 240px;
      transition: all 0.2s;
    }

    .search-box input:focus {
      outline: none;
      border-color: #3b82f6;
      width: 280px;
    }

    .search-icon {
      position: absolute;
      left: 10px;
      top: 50%;
      transform: translateY(-50%);
      font-size: 0.85rem;
      color: var(--text-muted);
    }

    .btn {
      padding: 8px 14px;
      background: #111827;
      border: 1px solid var(--border);
      border-radius: 8px;
      color: var(--text-muted);
      font-size: 0.82rem;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
      transition: all 0.2s;
    }

    .btn:hover {
      background: #1f2937;
      color: #fff;
      border-color: #374151;
    }

    .btn.active {
      background: rgba(59, 130, 246, 0.15);
      border-color: #3b82f6;
      color: #60a5fa;
    }

    /* ── Logs Stream Table ── */
    .stream-container {
      flex: 1;
      padding: 0 1.5rem 1.5rem;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }

    .table-wrapper {
      flex: 1;
      background: #0b0f19;
      border: 1px solid var(--border);
      border-radius: 12px;
      overflow-y: auto;
      max-height: calc(100vh - 290px);
      box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.5);
    }

    table {
      width: 100%;
      border-collapse: collapse;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.84rem;
    }

    thead {
      position: sticky;
      top: 0;
      background: #111827;
      z-index: 10;
      border-bottom: 1px solid var(--border);
    }

    th {
      padding: 10px 14px;
      text-align: left;
      font-size: 0.72rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      color: var(--text-muted);
    }

    td {
      padding: 8px 14px;
      border-bottom: 1px solid #131c2e;
      line-height: 1.5;
      vertical-align: top;
    }

    tr:hover td {
      background: #141d30;
    }

    .col-time {
      width: 140px;
      color: #64748b;
      white-space: nowrap;
      font-size: 0.78rem;
    }

    .col-tag {
      width: 130px;
      white-space: nowrap;
    }

    .badge-tag {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 0.7rem;
      font-weight: 600;
      letter-spacing: 0.5px;
      text-transform: uppercase;
    }

    .tag-wa { background: rgba(37, 211, 102, 0.15); color: #4ade80; border: 1px solid rgba(37, 211, 102, 0.3); }
    .tag-ai { background: rgba(168, 85, 247, 0.15); color: #c084fc; border: 1px solid rgba(168, 85, 247, 0.3); }
    .tag-order { background: rgba(16, 185, 129, 0.15); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.3); }
    .tag-db { background: rgba(6, 182, 212, 0.15); color: #22d3ee; border: 1px solid rgba(6, 182, 212, 0.3); }
    .tag-err { background: rgba(239, 68, 68, 0.15); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.3); }
    .tag-warn { background: rgba(245, 158, 11, 0.15); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.3); }
    .tag-info { background: rgba(148, 163, 184, 0.1); color: #94a3b8; border: 1px solid rgba(148, 163, 184, 0.2); }

    .col-msg {
      word-break: break-all;
      color: #e2e8f0;
    }

    .highlight-search {
      background: rgba(234, 179, 8, 0.3);
      color: #fef08a;
      border-radius: 2px;
      padding: 0 2px;
    }

    .status-indicator {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 0.8rem;
      color: #4ade80;
    }

    .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #4ade80;
      box-shadow: 0 0 8px #4ade80;
      animation: pulse 2s infinite;
    }

    @keyframes pulse {
      0% { opacity: 1; }
      50% { opacity: 0.4; }
      100% { opacity: 1; }
    }
  </style>
</head>
<body>

  <!-- Header -->
  <header>
    <div class="brand">
      <div class="brand-icon">⚡</div>
      <div>
        <div class="brand-title">Bot & Kitchen Monitor</div>
        <div class="brand-subtitle">Gemini 3.5 Flash Lite • PostgreSQL • Real-Time SSE</div>
      </div>
    </div>

    <div class="nav-links">
      <div class="status-indicator">
        <span class="dot"></span>
        <span id="connStatus">En vivo (cada 2s)</span>
      </div>
      <a href="/whatsapp/qr" class="nav-link" target="_blank" title="Vincular teléfono">📱 WhatsApp QR</a>
      <a href="http://localhost:5173" class="nav-link" target="_blank" title="Abrir KDS de cocina">🍕 Cocina Web</a>
      <a href="/logs/logout" class="nav-link danger">Cerrar Sesión</a>
    </div>
  </header>

  <!-- Metrics Bar -->
  <div class="metrics-bar">
    <div class="metric-card">
      <div class="metric-label">📊 Total Eventos</div>
      <div class="metric-value" id="statTotal">0</div>
    </div>
    <div class="metric-card">
      <div class="metric-label">💬 WhatsApp</div>
      <div class="metric-value" id="statWA" style="color: #4ade80;">0</div>
    </div>
    <div class="metric-card">
      <div class="metric-label">🤖 Gemini AI</div>
      <div class="metric-value" id="statAI" style="color: #c084fc;">0</div>
    </div>
    <div class="metric-card">
      <div class="metric-label">🍔 Pedidos</div>
      <div class="metric-value" id="statOrders" style="color: #34d399;">0</div>
    </div>
    <div class="metric-card">
      <div class="metric-label">⚠️ Errores</div>
      <div class="metric-value" id="statErrors" style="color: #f87171;">0</div>
    </div>
  </div>

  <!-- Toolbar -->
  <div class="toolbar">
    <div class="filters">
      <button class="pill active" onclick="setCategory('all', this)">🌐 Todos</button>
      <button class="pill wa" onclick="setCategory('wa', this)">💬 WhatsApp</button>
      <button class="pill ai" onclick="setCategory('ai', this)">🤖 Gemini AI</button>
      <button class="pill order" onclick="setCategory('order', this)">🍔 Pedidos</button>
      <button class="pill db" onclick="setCategory('db', this)">🗄️ Base de Datos</button>
      <button class="pill err" onclick="setCategory('err', this)">⚠️ Errores</button>
    </div>

    <div class="actions">
      <div class="search-box">
        <span class="search-icon">🔍</span>
        <input type="text" id="searchInput" placeholder="Filtrar eventos o palabras...">
      </div>

      <button class="btn active" id="btnAutoScroll" onclick="toggleAutoScroll()">
        📌 Auto-Scroll: ON
      </button>

      <button class="btn" onclick="clearLogs()">
        🗑️ Limpiar
      </button>

      <button class="btn" onclick="copyLogs()">
        📋 Copiar
      </button>
    </div>
  </div>

  <!-- Logs Table -->
  <div class="stream-container">
    <div class="table-wrapper" id="scrollContainer">
      <table>
        <thead>
          <tr>
            <th class="col-time">Hora</th>
            <th class="col-tag">Categoría</th>
            <th class="col-msg">Evento / Mensaje</th>
          </tr>
        </thead>
        <tbody id="logsTbody">
          <tr><td colspan="3" style="text-align:center; padding: 40px; color:#64748b;">Cargando flujo de eventos...</td></tr>
        </tbody>
      </table>
    </div>
  </div>

  <script>
    let allLogs = [];
    let currentCategory = 'all';
    let autoScroll = true;
    let clearedTs = localStorage.getItem('logs_cleared_ts') || null;

    function classifyLog(msg) {
      const lower = msg.toLowerCase();
      if (lower.includes('[error]') || lower.includes('error') || lower.includes('fail') || lower.includes('exception')) {
        return { cat: 'err', label: 'ERROR', cls: 'tag-err' };
      }
      if (lower.includes('[warn]') || lower.includes('warn')) {
        return { cat: 'err', label: 'WARN', cls: 'tag-warn' };
      }
      if (lower.includes('[wa_in]') || lower.includes('[wa_out]') || lower.includes('whatsapp') || lower.includes('evolution') || lower.includes('webhook')) {
        return { cat: 'wa', label: 'WHATSAPP', cls: 'tag-wa' };
      }
      if (lower.includes('[ai engine]') || lower.includes('gemini') || lower.includes('guardar_pedido') || lower.includes('solicitar_cambio') || lower.includes('openai')) {
        return { cat: 'ai', label: 'GEMINI AI', cls: 'tag-ai' };
      }
      if (lower.includes('[pedido]') || lower.includes('order') || lower.includes('kds') || lower.includes('[sse]')) {
        return { cat: 'order', label: 'PEDIDO', cls: 'tag-order' };
      }
      if (lower.includes('[database]') || lower.includes('postgresql') || lower.includes('sql') || lower.includes('pg')) {
        return { cat: 'db', label: 'DATABASE', cls: 'tag-db' };
      }
      return { cat: 'info', label: 'INFO', cls: 'tag-info' };
    }

    function formatTime(iso) {
      const d = new Date(iso);
      return d.toLocaleTimeString('es-NI', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }) + '.' + String(d.getMilliseconds()).padStart(3, '0');
    }

    function escapeHtml(str) {
      const div = document.createElement('div');
      div.textContent = str;
      return div.innerHTML;
    }

    function render() {
      const tbody = document.getElementById('logsTbody');
      const search = document.getElementById('searchInput').value.trim().toLowerCase();

      let filtered = allLogs;

      // Filtro por categoría
      if (currentCategory !== 'all') {
        filtered = filtered.filter(l => classifyLog(l.msg).cat === currentCategory);
      }

      // Filtro por búsqueda
      if (search) {
        filtered = filtered.filter(l => l.msg.toLowerCase().includes(search));
      }

      // Actualizar contadores
      let countWA = 0, countAI = 0, countOrder = 0, countErr = 0;
      for (const l of allLogs) {
        const c = classifyLog(l.msg).cat;
        if (c === 'wa') countWA++;
        else if (c === 'ai') countAI++;
        else if (c === 'order') countOrder++;
        else if (c === 'err') countErr++;
      }
      document.getElementById('statTotal').textContent = allLogs.length;
      document.getElementById('statWA').textContent = countWA;
      document.getElementById('statAI').textContent = countAI;
      document.getElementById('statOrders').textContent = countOrder;
      document.getElementById('statErrors').textContent = countErr;

      if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; padding: 40px; color:#64748b;">No hay eventos para este filtro</td></tr>';
        return;
      }

      tbody.innerHTML = filtered.map(l => {
        const info = classifyLog(l.msg);
        let safeMsg = escapeHtml(l.msg);
        if (search) {
          const regex = new RegExp('(' + search.replace(/[-/\\^$*+?.()|[\\]{}]/g, '\\\\$&') + ')', 'gi');
          safeMsg = safeMsg.replace(regex, '<span class="highlight-search">$1</span>');
        }

        return \`
          <tr>
            <td class="col-time">\${formatTime(l.ts)}</td>
            <td class="col-tag"><span class="badge-tag \${info.cls}">\${info.label}</span></td>
            <td class="col-msg">\${safeMsg}</td>
          </tr>
        \`;
      }).join('');

      if (autoScroll) {
        const container = document.getElementById('scrollContainer');
        container.scrollTop = container.scrollHeight;
      }
    }

    function setCategory(cat, el) {
      currentCategory = cat;
      document.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
      el.classList.add('active');
      render();
    }

    function toggleAutoScroll() {
      autoScroll = !autoScroll;
      const btn = document.getElementById('btnAutoScroll');
      btn.textContent = autoScroll ? '📌 Auto-Scroll: ON' : '⏸ Auto-Scroll: OFF';
      btn.classList.toggle('active', autoScroll);
    }

    function clearLogs() {
      clearedTs = allLogs.length > 0 ? allLogs[allLogs.length - 1].ts : new Date().toISOString();
      localStorage.setItem('logs_cleared_ts', clearedTs);
      allLogs = [];
      render();
    }

    function copyLogs() {
      const text = allLogs.map(l => \`[\${l.ts}] \${l.msg}\`).join('\\n');
      navigator.clipboard.writeText(text).then(() => {
        alert('✓ Logs copiados al portapapeles');
      });
    }

    async function fetchLogs() {
      try {
        const url = clearedTs
          ? \`/logs/data?limit=500&after=\${encodeURIComponent(clearedTs)}\`
          : '/logs/data?limit=500';
        const res = await fetch(url);
        if (res.status === 401) {
          window.location.href = '/logs/login';
          return;
        }
        const data = await res.json();
        allLogs = data;
        render();
        document.getElementById('connStatus').textContent = 'En vivo (cada 2s)';
      } catch (err) {
        document.getElementById('connStatus').textContent = 'Reconectando...';
      }
    }

    document.getElementById('searchInput').addEventListener('input', render);

    fetchLogs();
    setInterval(fetchLogs, 2000);
  </script>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});

module.exports = router;
