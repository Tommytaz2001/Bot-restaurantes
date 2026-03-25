const ELASTICSEARCH_URL = process.env.ELASTICSEARCH_URL;

function getIndex() {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '.');
  return `bot-logs-${date}-000001`;
}

async function sendToES(message) {
  if (!ELASTICSEARCH_URL) return;
  const url = `${ELASTICSEARCH_URL}/${getIndex()}/_doc`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ '@timestamp': new Date().toISOString(), message }),
    });
    const body = await res.text();
    console.log(`[ES] ${res.status} → ${body}`);
  } catch (err) {
    console.error(`[ES] Error enviando a ${url}:`, err.message);
  }
}

function log(message) {
  console.log(message);
  sendToES(message); // fire-and-forget
}

module.exports = { log };
