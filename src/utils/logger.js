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
    // Rotación simple: si supera 5MB, truncar a 0 y empezar de nuevo
    try {
      const stat = fs.statSync(LOG_FILE);
      if (stat.size > MAX_BYTES) fs.writeFileSync(LOG_FILE, '');
    } catch (_) { /* archivo no existe aún */ }

    const entry = JSON.stringify({ ts: new Date().toISOString(), msg: message }) + '\n';
    fs.appendFileSync(LOG_FILE, entry);
  } catch (_) { /* nunca debe romper el flujo principal */ }
}

function log(message) {
  console.log(message);
  appendToFile(message);
  sendToES(message); // fire-and-forget
}

module.exports = { log };
