/**
 * Auto-configuración de Evolution API al iniciar el backend.
 * Crea la instancia y configura el webhook si no existen.
 * Se ejecuta una vez al arrancar index.js.
 */

const { log } = require('../utils/logger');

const MAX_WAIT_MS  = 30_000; // esperar hasta 30s a que Evolution API arranque
const RETRY_DELAY  = 3_000;  // reintentar cada 3s

function getConfig() {
  const apiUrl   = process.env.EVOLUTION_API_URL;
  const apiKey   = process.env.EVOLUTION_API_KEY;
  const instance = process.env.EVOLUTION_INSTANCE || 'bot-restaurantes';

  // URL interna del webhook: usa EVOLUTION_WEBHOOK_URL si está definida,
  // si no, construye desde el nombre del contenedor del backend
  const containerName = process.env.BOT_CONTAINER_NAME || 'bot-restaurantes';
  const port          = process.env.PORT || 3001;
  const webhookUrl    = process.env.EVOLUTION_WEBHOOK_URL
    || `http://${containerName}:${port}/whatsapp/webhook`;

  return { apiUrl, apiKey, instance, webhookUrl };
}

async function evFetch(path, options = {}) {
  const { apiUrl, apiKey } = getConfig();
  const res = await fetch(`${apiUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      apikey: apiKey,
      ...(options.headers || {}),
    },
  });
  return res;
}

// Espera hasta que Evolution API responda al health check
async function waitForEvolution() {
  const started = Date.now();
  while (Date.now() - started < MAX_WAIT_MS) {
    try {
      const res = await evFetch('/');
      if (res.status < 500) return true;
    } catch (_) { /* no disponible aún */ }
    await new Promise(r => setTimeout(r, RETRY_DELAY));
  }
  return false;
}

async function instanceExists(instance) {
  try {
    const res = await evFetch(`/instance/fetchInstances`);
    if (!res.ok) return false;
    const data = await res.json();
    const list = Array.isArray(data) ? data : (data.data ?? []);
    return list.some(i => i.instance?.instanceName === instance || i.instanceName === instance);
  } catch {
    return false;
  }
}

async function createInstance(instance) {
  const res = await evFetch(`/instance/create`, {
    method: 'POST',
    body: JSON.stringify({ instanceName: instance, qrcode: true }),
  });
  return res.ok;
}

async function webhookIsConfigured(instance) {
  try {
    const res = await evFetch(`/webhook/find/${instance}`);
    if (!res.ok) return false;
    const data = await res.json();
    // Devuelve false si la url está vacía o no existe
    const url = data?.url || data?.webhook?.url || '';
    return url.length > 0;
  } catch {
    return false;
  }
}

async function setWebhook(instance, webhookUrl) {
  const res = await evFetch(`/webhook/set/${instance}`, {
    method: 'POST',
    body: JSON.stringify({
      url: webhookUrl,
      enabled: true,
      webhook_by_events: false,
      events: ['MESSAGES_UPSERT'],
    }),
  });
  return res.ok;
}

async function setupEvolution() {
  const { apiUrl, apiKey, instance, webhookUrl } = getConfig();

  if (!apiUrl || !apiKey) {
    log('[Init] EVOLUTION_API_URL o EVOLUTION_API_KEY no configuradas — setup omitido');
    return;
  }

  log(`[Init] Esperando Evolution API en ${apiUrl}...`);
  const ready = await waitForEvolution();
  if (!ready) {
    log('[Init] ⚠️  Evolution API no respondió en 30s — webhook no configurado');
    return;
  }

  // 1. Crear instancia si no existe
  const exists = await instanceExists(instance);
  if (!exists) {
    log(`[Init] Instancia "${instance}" no encontrada — creando...`);
    const created = await createInstance(instance);
    if (created) {
      log(`[Init] Instancia "${instance}" creada`);
    } else {
      log(`[Init] ⚠️  Error al crear instancia "${instance}"`);
      return;
    }
  } else {
    log(`[Init] Instancia "${instance}" encontrada`);
  }

  // 2. Configurar webhook si falta o está vacío
  const hasWebhook = await webhookIsConfigured(instance);
  if (!hasWebhook) {
    log(`[Init] Configurando webhook → ${webhookUrl}`);
    const ok = await setWebhook(instance, webhookUrl);
    if (ok) {
      log(`[Init] ✓ Webhook configurado correctamente`);
    } else {
      log(`[Init] ⚠️  Error al configurar webhook`);
    }
  } else {
    log(`[Init] ✓ Webhook ya configurado`);
  }

  log(`[Init] Evolution API lista. QR en /whatsapp/qr si aún no escaneaste`);
}

module.exports = { setupEvolution };
