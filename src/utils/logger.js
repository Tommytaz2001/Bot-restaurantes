const fs = require('fs');
const path = require('path');

const ELASTICSEARCH_URL = process.env.ELASTICSEARCH_URL;
const ELASTIC_PASSWORD  = process.env.ELASTIC_PASSWORD;
const LOG_FILE = path.join(__dirname, '../../data/logs.ndjson');
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
    console.error(esError);
    appendToFile(esError);
  }
}

function appendToFile(message) {
  try {
    const dataDir = path.dirname(LOG_FILE);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    try {
      const stat = fs.statSync(LOG_FILE);
      if (stat.size > MAX_BYTES) fs.writeFileSync(LOG_FILE, '');
    } catch (_) { /* archivo no existe aún */ }

    const entry = JSON.stringify({ ts: new Date().toISOString(), msg: String(message) }) + '\n';
    fs.appendFileSync(LOG_FILE, entry);
  } catch (_) { /* nunca debe romper el flujo principal */ }
}

const origLog = console.log;
const origError = console.error;
const origWarn = console.warn;

function formatArgs(args) {
  return args.map(a => (typeof a === 'object' && a !== null ? JSON.stringify(a) : String(a))).join(' ');
}

// Interceptar logs globales de consola para que aparezcan en el visor web
console.log = function(...args) {
  origLog.apply(console, args);
  appendToFile(formatArgs(args));
};

console.error = function(...args) {
  origError.apply(console, args);
  appendToFile('[ERROR] ' + formatArgs(args));
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

module.exports = { log };
