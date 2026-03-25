const ELASTICSEARCH_URL = process.env.ELASTICSEARCH_URL;

function getIndex() {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '.');
  return `bot-logs-${date}-000001`;
}

async function sendToES(message) {
  if (!ELASTICSEARCH_URL) return;
  try {
    await fetch(`${ELASTICSEARCH_URL}/${getIndex()}/_doc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ '@timestamp': new Date().toISOString(), message }),
    });
  } catch (_) {
    // silencioso — no romper el bot si ES no está disponible
  }
}

function log(message) {
  console.log(message);
  sendToES(message); // fire-and-forget
}

module.exports = { log };
