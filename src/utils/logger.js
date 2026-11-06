const fs = require('fs');
const path = require('path');

const ELASTICSEARCH_URL = process.env.ELASTICSEARCH_URL;
const ELASTIC_PASSWORD  = process.env.ELASTIC_PASSWORD;
const LOG_FILE = path.join(__dirname, '../../data/logs.ndjson');
const ERROR_LOG_FILE = path.join(__dirname, '../../data/errors.ndjson');
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

function getIndex() {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '.');
  return `bot-logs-${date}-000001`;
}

async function sendToES(message) {
  if (!ELASTICSEARCH_URL) return;
  const url = `${ELASTICSEARCH_URL}/${getIndex()}/_doc`;
  const headers = { 'Content-Type': 'application/json' };
  if (ELASTIC_PASSWORD) {
    headers['Authorization'] = 'Basic ' + Buffer.from(`elastic:${ELASTIC_PASSWORD}`).toString('base64');
  }
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ '@timestamp': new Date().toISOString(), message }),
    });
    const body = await res.text();
    const esLog = `[ES] ${res.status} → ${body}`;
    console.log(esLog);
    appendToFile(esLog);
  } catch (err) {
    const esError = `[ES] Error enviando a ${url}: ${err.message}`;
    console.error(esError, err);
  }
}

/**
 * Trunca el archivo si excede maxBytes conservando los bytes más recientes (keepBytes).
 * Evita que el archivo se vacíe completamente a cero.
 */
function trimFileIfNeeded(filePath, maxBytes = MAX_BYTES, keepBytes = Math.floor(MAX_BYTES / 2)) {
  try {
    const stat = fs.statSync(filePath);
    if (stat.size > maxBytes) {
      const buffer = Buffer.alloc(keepBytes);
      const fd = fs.openSync(filePath, 'r');
      fs.readSync(fd, buffer, 0, keepBytes, stat.size - keepBytes);
      fs.closeSync(fd);

      let text = buffer.toString('utf8');
      const firstNewline = text.indexOf('\n');
      if (firstNewline !== -1) {
        text = text.slice(firstNewline + 1);
      }
      fs.writeFileSync(filePath, text, 'utf8');
    }
  } catch (_) {
    // Si no existe o hay error de concurrencia, continuar de forma defensiva
  }
}

function appendToFile(message) {
  try {
    const dataDir = path.dirname(LOG_FILE);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    trimFileIfNeeded(LOG_FILE);

    const entry = JSON.stringify({ ts: new Date().toISOString(), msg: String(message) }) + '\n';
    fs.appendFileSync(LOG_FILE, entry);
  } catch (_) { /* nunca debe romper el flujo principal */ }
}

function appendErrorToFile(message, errorObj) {
  try {
    const dataDir = path.dirname(ERROR_LOG_FILE);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    trimFileIfNeeded(ERROR_LOG_FILE);

    let stack = null;
    if (errorObj instanceof Error) {
      stack = errorObj.stack || null;
    } else if (errorObj && typeof errorObj === 'object' && errorObj.stack) {
      stack = String(errorObj.stack);
    }

    const entry = JSON.stringify({
      ts: new Date().toISOString(),
      msg: String(message),
      stack,
    }) + '\n';

    fs.appendFileSync(ERROR_LOG_FILE, entry);
  } catch (_) { /* nunca debe romper el flujo principal */ }
}

function getErrorLogs(limit = 300, after = null) {
  try {
    if (!fs.existsSync(ERROR_LOG_FILE)) return [];
    const content = fs.readFileSync(ERROR_LOG_FILE, 'utf8');
    let lines = content
      .trim()
      .split('\n')
      .filter(Boolean)
      .map(line => {
        try { return JSON.parse(line); } catch { return null; }
      })
      .filter(Boolean);

    if (after) lines = lines.filter(e => e.ts > after);
    return lines.slice(-limit);
  } catch (_) {
    return [];
  }
}

const origLog = console.log;
const origError = console.error;
const origWarn = console.warn;

function formatArgs(args) {
  return args.map(a => {
    if (a instanceof Error) return a.stack || a.message;
    if (typeof a === 'object' && a !== null) {
      try { return JSON.stringify(a); } catch { return String(a); }
    }
    return String(a);
  }).join(' ');
}

// Interceptar logs globales de consola para que aparezcan en el visor web y registro persistente
console.log = function(...args) {
  origLog.apply(console, args);
  appendToFile(formatArgs(args));
};

console.error = function(...args) {
  origError.apply(console, args);
  const formatted = formatArgs(args);
  appendToFile('[ERROR] ' + formatted);

  const errObj = args.find(a => a instanceof Error || (a && typeof a === 'object' && a.stack));
  appendErrorToFile(formatted, errObj);
};

console.warn = function(...args) {
  origWarn.apply(console, args);
  appendToFile('[WARN] ' + formatArgs(args));
};

function log(message) {
  origLog(message);
  appendToFile(message);
  sendToES(message); // fire-and-forget
}

function logError(message, err) {
  console.error(message, err);
}

/**
 * Vacía por completo los archivos de logs (logs.ndjson y errors.ndjson) en disco.
 * Usado por la interfaz administrativa para limpiar el historial de eventos.
 */
function clearAllLogs() {
  try {
    const dataDir = path.dirname(LOG_FILE);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    fs.writeFileSync(LOG_FILE, '', 'utf8');
    fs.writeFileSync(ERROR_LOG_FILE, '', 'utf8');
    origLog('[Logger] Archivos de logs y errores vaciados por el usuario.');
    return true;
  } catch (err) {
    origError('[Logger] Error vaciando archivos de logs:', err);
    return false;
  }
}

module.exports = {
  log,
  logError,
  getErrorLogs,
  clearAllLogs,
  LOG_FILE,
  ERROR_LOG_FILE,
  trimFileIfNeeded,
};
