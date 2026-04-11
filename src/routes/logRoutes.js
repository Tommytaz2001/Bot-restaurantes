const fs = require('fs');
const path = require('path');
const express = require('express');

const router = express.Router();
const LOG_FILE = path.join(__dirname, '../../data/logs.ndjson');

// GET /logs/data?limit=200&filter=<texto>
router.get('/data', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 200, 500);
  const filter = (req.query.filter || '').toLowerCase();

  let lines = [];
  try {
    const content = fs.readFileSync(LOG_FILE, 'utf8');
    lines = content
      .trim()
      .split('\n')
      .filter(Boolean)
      .map(line => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch (_) {
    /* archivo no existe aún */
  }

  if (filter) {
    lines = lines.filter(e => e.msg.toLowerCase().includes(filter));
  }

  res.json(lines.slice(-limit));
});

// GET /logs - página HTML con auto-refresco
router.get('/', (req, res) => {
  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Bot Logs</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background: #0f0f0f;
      color: #e0e0e0;
      padding: 20px;
    }

    .container {
      max-width: 1400px;
      margin: 0 auto;
    }

    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
      padding: 15px;
      background: #1a1a1a;
      border-radius: 8px;
      border-left: 4px solid #4a9eff;
    }

    h1 {
      font-size: 24px;
      font-weight: 600;
    }

    .controls {
      display: flex;
      gap: 15px;
      align-items: center;
      flex-wrap: wrap;
    }

    input[type="text"] {
      padding: 8px 12px;
      background: #2a2a2a;
      border: 1px solid #444;
      border-radius: 4px;
      color: #e0e0e0;
      font-size: 14px;
      width: 200px;
    }

    input[type="text"]:focus {
      outline: none;
      border-color: #4a9eff;
      box-shadow: 0 0 8px rgba(74, 158, 255, 0.3);
    }

    .button-group {
      display: flex;
      gap: 10px;
    }

    button {
      padding: 8px 16px;
      background: #2a2a2a;
      border: 1px solid #444;
      border-radius: 4px;
      color: #e0e0e0;
      cursor: pointer;
      font-size: 13px;
      transition: all 0.2s;
    }

    button:hover {
      background: #333;
      border-color: #555;
    }

    button.active {
      background: #4a9eff;
      border-color: #4a9eff;
      color: #000;
    }

    .status {
      font-size: 12px;
      color: #888;
    }

    .status.loading {
      color: #ffa500;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      background: #1a1a1a;
      border-radius: 8px;
      overflow: hidden;
      border: 1px solid #2a2a2a;
    }

    thead {
      position: sticky;
      top: 0;
      background: #222;
      z-index: 10;
    }

    th {
      padding: 12px;
      text-align: left;
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      color: #999;
      border-bottom: 1px solid #2a2a2a;
    }

    td {
      padding: 10px 12px;
      border-bottom: 1px solid #242424;
      font-size: 13px;
      font-family: 'Courier New', monospace;
    }

    tr:hover {
      background: #232323;
    }

    .timestamp {
      color: #888;
      font-size: 12px;
      white-space: nowrap;
    }

    .message {
      word-break: break-word;
      max-width: 800px;
    }

    /* Colores por tipo de log */
    .log-error { color: #ff6b6b; }
    .log-warn { color: #ffa500; }
    .log-http { color: #888; }
    .log-wa { color: #4a9eff; }
    .log-pedido { color: #51cf66; }
    .log-default { color: #e0e0e0; }

    .empty-state {
      text-align: center;
      padding: 40px;
      color: #666;
    }

    .empty-state p {
      font-size: 14px;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>📋 Bot Logs</h1>
      <div class="controls">
        <input
          type="text"
          id="filterInput"
          placeholder="Filtrar por texto... (ERROR, WA_IN, PEDIDO, etc)"
        >
        <div class="button-group">
          <button id="autoScrollBtn" class="active" title="Auto-scroll al último log">
            📌 Auto-scroll
          </button>
          <button id="clearBtn" title="Limpiar tabla">
            🗑️ Limpiar
          </button>
        </div>
        <div class="status" id="status">Actualizando...</div>
      </div>
    </header>

    <table>
      <thead>
        <tr>
          <th style="width: 180px">Hora</th>
          <th>Mensaje</th>
        </tr>
      </thead>
      <tbody id="logsTable">
        <tr><td colspan="2" class="empty-state"><p>Cargando logs...</p></td></tr>
      </tbody>
    </table>
  </div>

  <script>
    const filterInput = document.getElementById('filterInput');
    const logsTable = document.getElementById('logsTable');
    const statusEl = document.getElementById('status');
    const autoScrollBtn = document.getElementById('autoScrollBtn');
    const clearBtn = document.getElementById('clearBtn');

    let allLogs = [];
    let autoScroll = true;
    let lastUpdate = Date.now();
    let clearedBeforeTs = null; // timestamp ISO del último clear

    function getLogClass(message) {
      if (message.includes('[ERROR]')) return 'log-error';
      if (message.includes('[WARN]')) return 'log-warn';
      if (message.includes('[HTTP]')) return 'log-http';
      if (message.includes('[WA_IN]') || message.includes('[WA_OUT]')) return 'log-wa';
      if (message.includes('[PEDIDO]')) return 'log-pedido';
      return 'log-default';
    }

    function formatTime(isoString) {
      const date = new Date(isoString);
      return date.toLocaleTimeString('es-AR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        fractionalSecondDigits: 3
      });
    }

    function renderLogs() {
      const filterText = filterInput.value.toLowerCase();
      const filtered = allLogs.filter(log =>
        log.msg.toLowerCase().includes(filterText)
      );

      if (filtered.length === 0) {
        logsTable.innerHTML = '<tr><td colspan="2" class="empty-state"><p>No hay logs que coincidan</p></td></tr>';
        return;
      }

      logsTable.innerHTML = filtered
        .map(log => {
          const className = getLogClass(log.msg);
          return \`
            <tr>
              <td class="timestamp">\${formatTime(log.ts)}</td>
              <td class="message \${className}">\${escapeHtml(log.msg)}</td>
            </tr>
          \`;
        })
        .join('');

      if (autoScroll) {
        const lastRow = logsTable.lastElementChild;
        if (lastRow) lastRow.scrollIntoView({ behavior: 'smooth' });
      }
    }

    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    async function fetchLogs() {
      try {
        statusEl.classList.add('loading');
        statusEl.textContent = '⏳ Actualizando...';

        const response = await fetch('/logs/data?limit=500');
        const logs = await response.json();

        // Filtrar logs anteriores al último clear
        allLogs = clearedBeforeTs
          ? logs.filter(l => l.ts > clearedBeforeTs)
          : logs;
        lastUpdate = Date.now();
        renderLogs();

        statusEl.classList.remove('loading');
        const now = new Date().toLocaleTimeString('es-AR');
        statusEl.textContent = \`✓ Actualizado a las \${now}\`;
      } catch (err) {
        statusEl.classList.remove('loading');
        statusEl.textContent = '✗ Error al cargar logs';
        console.error('Error fetching logs:', err);
      }
    }

    // Event listeners
    filterInput.addEventListener('input', renderLogs);

    autoScrollBtn.addEventListener('click', () => {
      autoScroll = !autoScroll;
      autoScrollBtn.classList.toggle('active', autoScroll);
    });

    clearBtn.addEventListener('click', () => {
      // Usar el timestamp del último log del servidor para evitar clock skew cliente/servidor
      clearedBeforeTs = allLogs.length > 0
        ? allLogs[allLogs.length - 1].ts
        : new Date().toISOString();
      allLogs = [];
      logsTable.innerHTML = '<tr><td colspan="2" class="empty-state"><p>Pantalla limpiada — esperando nuevos logs...</p></td></tr>';
    });

    // Cargar logs inicialmente
    fetchLogs();

    // Auto-refresh cada 5 segundos
    setInterval(fetchLogs, 5000);
  </script>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});

module.exports = router;
