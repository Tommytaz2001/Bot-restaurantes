const { log } = require('../utils/logger');

// Caché en memoria: lid -> telefono (ej: '229712898017378@lid' -> '50512345678')
const _lidToPhone = new Map();
const _phoneToLid = new Map();

function cacheLidMapping(lid, phone) {
  if (!lid || !phone) return;
  const canonicalLid = lid.includes('@') ? lid : `${lid}@lid`;
  const canonicalPhone = phone.includes('@') ? phone.split('@')[0] : phone;
  _lidToPhone.set(canonicalLid, canonicalPhone);
  _lidToPhone.set(canonicalLid.split('@')[0], canonicalPhone);
  _phoneToLid.set(canonicalPhone, canonicalLid);
}

function getPhoneForLid(lid) {
  if (!lid) return null;
  const canonicalLid = lid.includes('@') ? lid : `${lid}@lid`;
  return _lidToPhone.get(canonicalLid) || _lidToPhone.get(lid.split('@')[0]) || null;
}

function getLidForPhone(phone) {
  if (!phone) return null;
  const canonicalPhone = phone.includes('@') ? phone.split('@')[0] : phone;
  return _phoneToLid.get(canonicalPhone) || null;
}

/**
 * Resuelve un @lid a número de teléfono real.
 * 1. Primero busca en caché en memoria.
 * 2. Si no está en caché, consulta a Evolution API (perfil de contacto / lista de contactos).
 */
async function resolveLid(lidJid, overrideFetch) {
  if (!lidJid) return null;
  const lidKey = lidJid.includes('@') ? lidJid : `${lidJid}@lid`;

  // 1. Revisar caché
  const cached = getPhoneForLid(lidKey);
  if (cached) return cached;

  const apiUrl = process.env.EVOLUTION_API_URL;
  const apiKey = process.env.EVOLUTION_API_KEY;
  const instance = process.env.EVOLUTION_INSTANCE || 'bot-restaurantes';

  if (!apiUrl || !apiKey) return null;

  const fetchFn = overrideFetch || globalThis.fetch;

  try {
    // 2. Intentar GET /contact/profile/:remoteJid
    const resProfile = await fetchFn(`${apiUrl}/contact/profile/${lidKey}`, {
      headers: { apikey: apiKey },
    }).catch(() => null);

    if (resProfile && resProfile.ok) {
      const data = await resProfile.json().catch(() => ({}));
      const candidate = data.number || data.phone || (data.id && !data.id.endsWith('@lid') ? data.id.split('@')[0] : null);
      if (candidate && !candidate.endsWith('@lid') && candidate.length <= 14) {
        cacheLidMapping(lidKey, candidate);
        return candidate;
      }
    }

    // 3. Intentar POST /chat/findContacts/:instance con filtro
    const resContacts = await fetchFn(`${apiUrl}/chat/findContacts/${instance}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: apiKey },
      body: JSON.stringify({ where: { id: lidKey } }),
    }).catch(() => null);

    if (resContacts && resContacts.ok) {
      const data = await resContacts.json().catch(() => []);
      const list = Array.isArray(data) ? data : (data.data ?? []);
      for (const c of list) {
        const cPhone = (c.id && !c.id.endsWith('@lid')) ? c.id.split('@')[0] : (c.number || c.phone);
        if (cPhone && !cPhone.endsWith('@lid') && cPhone.length <= 14) {
          cacheLidMapping(lidKey, cPhone);
          return cPhone;
        }
      }
    }
  } catch (err) {
    log(`[LidResolver] Error consultando Evolution API para ${lidKey}: ${err.message}`);
  }

  return null;
}

module.exports = {
  cacheLidMapping,
  getPhoneForLid,
  getLidForPhone,
  resolveLid,
  _lidToPhone,
  _phoneToLid,
};
