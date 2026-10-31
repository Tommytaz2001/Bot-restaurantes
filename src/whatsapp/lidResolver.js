const { log } = require('../utils/logger');
const { isAdminOrOwnerPhone } = require('../utils/phoneUtils');

// Caché en memoria: lid -> telefono (ej: '229712898017378@lid' -> '50512345678')
const _lidToPhone = new Map();
const _phoneToLid = new Map();

function cacheLidMapping(lid, phone) {
  if (!lid || !phone) return;
  const canonicalLid = lid.includes('@') ? lid : `${lid}@lid`;
  const canonicalPhone = phone.includes('@') ? phone.split('@')[0] : phone;
  const cleanPhone = String(canonicalPhone).replace(/\D/g, '');

  // Evitar almacenar LIDs como si fueran teléfonos, y NUNCA almacenar números del administrador/dueño
  if (cleanPhone.length > 15 || canonicalPhone.endsWith('@lid')) return;
  if (isAdminOrOwnerPhone(cleanPhone || canonicalPhone)) return;

  _lidToPhone.set(canonicalLid, cleanPhone || canonicalPhone);
  _lidToPhone.set(canonicalLid.split('@')[0], cleanPhone || canonicalPhone);
  _phoneToLid.set(cleanPhone || canonicalPhone, canonicalLid);

  if (cleanPhone.length >= 8 && cleanPhone.startsWith('505')) {
    _phoneToLid.set(cleanPhone.substring(3), canonicalLid);
  }
}

function getPhoneForLid(lid) {
  if (!lid) return null;
  const canonicalLid = lid.includes('@') ? lid : `${lid}@lid`;
  return _lidToPhone.get(canonicalLid) || _lidToPhone.get(lid.split('@')[0]) || null;
}

function getLidForPhone(phone) {
  if (!phone) return null;
  const canonicalPhone = phone.includes('@') ? phone.split('@')[0] : phone;
  const clean = String(canonicalPhone).replace(/\D/g, '');
  return _phoneToLid.get(canonicalPhone) || _phoneToLid.get(clean) || null;
}

/**
 * Resuelve un @lid a número de teléfono real.
 * 1. Primero busca en caché en memoria.
 * 2. Consulta endpoints de contacto de Evolution API (/contact/profile, /chat/findContacts).
 * 3. Busca en Evolution API findMessages (campo key.senderPn).
 */
async function resolveLid(lidJid, overrideFetch) {
  if (!lidJid) return null;
  const lidKey = lidJid.includes('@') ? lidJid : `${lidJid}@lid`;

  // 1. Revisar caché en memoria
  const cached = getPhoneForLid(lidKey);
  if (cached) return cached;

  const apiUrl = process.env.EVOLUTION_API_URL;
  const apiKey = process.env.EVOLUTION_API_KEY;
  const instance = process.env.EVOLUTION_INSTANCE || 'bot-restaurantes';

  if (!apiUrl || !apiKey) return null;

  const fetchFn = overrideFetch || globalThis.fetch;

  try {
    // 2. Intentar POST /chat/findContacts/:instance con filtro
    let resContacts = null;
    try {
      resContacts = await fetchFn(`${apiUrl}/chat/findContacts/${instance}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: apiKey },
        body: JSON.stringify({ where: { id: lidKey } }),
      });
    } catch {}

    if (resContacts && resContacts.ok) {
      const data = await resContacts.json().catch(() => []);
      const list = Array.isArray(data) ? data : (data.data ?? []);
      for (const c of list) {
        const cPhone = (c.id && !c.id.endsWith('@lid')) ? c.id.split('@')[0] : (c.number || c.phone);
        if (cPhone && !cPhone.endsWith('@lid') && cPhone.length <= 14 && !isAdminOrOwnerPhone(cPhone)) {
          cacheLidMapping(lidKey, cPhone);
          return cPhone;
        }
      }
    }

    // 3. Intentar POST /chat/findMessages para ver si mensajes previos tienen key.senderPn
    let resMessages = null;
    try {
      resMessages = await fetchFn(`${apiUrl}/chat/findMessages/${instance}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: apiKey },
        body: JSON.stringify({
          where: { key: { remoteJid: lidKey } },
          take: 5,
        }),
      });
    } catch {}

    if (resMessages && resMessages.ok) {
      const msgData = await resMessages.json().catch(() => []);
      const msgList = Array.isArray(msgData) ? msgData : (msgData.messages?.records || msgData.data || []);
      for (const m of msgList) {
        const senderPn = m.key?.senderPn || m.senderPn;
        if (senderPn) {
          const rawPn = String(senderPn).split('@')[0].replace(/\D/g, '');
          if (rawPn.length >= 7 && rawPn.length <= 15 && !isAdminOrOwnerPhone(rawPn)) {
            log(`[LidResolver] @lid ${lidKey} resuelto desde findMessages de Evolution API → ${rawPn}`);
            cacheLidMapping(lidKey, rawPn);
            return rawPn;
          }
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
