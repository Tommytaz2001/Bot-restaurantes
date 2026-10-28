const { query } = require('../db/connection');
const { getPhoneForLid, cacheLidMapping } = require('../whatsapp/lidResolver');

const RESTAURANTE_ID = process.env.RESTAURANTE_ID || 'urbano';

// Caché en memoria para comprobación O(1)/O(N) rápida en webhooks
// Map: restauranteId -> Array<{ id, telefono, telefono_clean, nombre, motivo, created_at }>
const _cache = new Map();
let _lastCacheTime = 0;
const CACHE_TTL_MS = 60_000; // 1 minuto de vigencia de caché

/**
 * Extrae solo los dígitos de un string telefónico o JID
 */
function cleanDigits(phone) {
  if (!phone) return '';
  // Remover sufijos de JID si existen (@s.whatsapp.net, @lid, etc.)
  const raw = String(phone).split('@')[0];
  return raw.replace(/\D/g, '');
}

/**
 * Asegura que la tabla lista_negra exista en la BD (resiliente ante migraciones pendientes)
 */
let _tableChecked = false;
async function asegurarTabla() {
  if (_tableChecked) return;
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS lista_negra (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        restaurante_id VARCHAR(64) REFERENCES restaurantes(id) ON DELETE CASCADE,
        telefono VARCHAR(64) NOT NULL,
        telefono_clean VARCHAR(64) NOT NULL,
        nombre VARCHAR(255) DEFAULT 'Repartidor',
        motivo VARCHAR(255) DEFAULT 'Repartidor',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_lista_negra_restaurante ON lista_negra (restaurante_id);
      CREATE INDEX IF NOT EXISTS idx_lista_negra_clean ON lista_negra (telefono_clean);
    `);
    _tableChecked = true;
  } catch (err) {
    // Si no hay conexión a BD aún, continuar
  }
}

/**
 * Comprueba si un número de teléfono entrante coincide con un número de la lista negra.
 * Maneja códigos de país internacionales de forma estricta:
 * - Coincidencia exacta de dígitos
 * - Nicaragua (+505): 8 dígitos locales vs 11 dígitos con prefijo 505
 * - Ecuador (+593): 9 dígitos locales vs 12 dígitos con prefijo 593
 * - Nunca cruza prefijos distintos (un número 593 jamás coincidirá con uno 505)
 */
function phonesMatch(incomingClean, entryClean) {
  if (!incomingClean || !entryClean) return false;
  if (incomingClean === entryClean) return true;

  // Si ambos tienen prefijo de país distinto, jamás coinciden
  const incomingIs505 = incomingClean.startsWith('505') && incomingClean.length === 11;
  const entryIs505 = entryClean.startsWith('505') && entryClean.length === 11;
  const incomingIs593 = incomingClean.startsWith('593') && incomingClean.length === 12;
  const entryIs593 = entryClean.startsWith('593') && entryClean.length === 12;

  // Si uno es Nicaragua (505) y el otro es Ecuador (593), no coinciden
  if ((incomingIs505 && entryIs593) || (incomingIs593 && entryIs505)) {
    return false;
  }

  // Nicaragua: comparar local (8 dígitos) con internacional (505 + 8 dígitos)
  if (entryIs505 && incomingClean.length === 8) {
    return entryClean === `505${incomingClean}`;
  }
  if (incomingIs505 && entryClean.length === 8) {
    return incomingClean === `505${entryClean}`;
  }

  // Ecuador: comparar local (9 dígitos) con internacional (593 + 9 dígitos)
  if (entryIs593 && incomingClean.length === 9) {
    return entryClean === `593${incomingClean}`;
  }
  if (incomingIs593 && entryClean.length === 9) {
    return incomingClean === `593${entryClean}`;
  }

  // Normalización genérica de prefijo solo si coincide exactamente
  if (incomingClean.startsWith('505') && incomingClean.substring(3) === entryClean) return true;
  if (entryClean.startsWith('505') && entryClean.substring(3) === incomingClean) return true;
  if (incomingClean.startsWith('593') && incomingClean.substring(3) === entryClean) return true;
  if (entryClean.startsWith('593') && entryClean.substring(3) === incomingClean) return true;

  return false;
}

/**
 * Carga o refresca la lista negra en memoria
 */
async function cargarListaNegra(restauranteId = RESTAURANTE_ID, forzar = false) {
  const now = Date.now();
  if (!forzar && _cache.has(restauranteId) && (now - _lastCacheTime < CACHE_TTL_MS)) {
    return _cache.get(restauranteId) || [];
  }

  await asegurarTabla();

  try {
    const res = await query(
      `SELECT id, restaurante_id, telefono, telefono_clean, nombre, motivo, created_at
       FROM lista_negra
       WHERE restaurante_id = $1
       ORDER BY created_at DESC`,
      [restauranteId]
    );

    _cache.set(restauranteId, res.rows || []);
    _lastCacheTime = now;
    return res.rows || [];
  } catch (err) {
    console.warn('[blacklistService] Error al cargar lista_negra:', err.message);
    return _cache.get(restauranteId) || [];
  }
}

/**
 * Verifica si un número telefónico o remitente está registrado en la lista negra.
 * @param {string} telefono Número o JID de WhatsApp (+505..., 505..., 8888..., etc.)
 * @param {string} [restauranteId]
 * @param {string} [remoteJid] JID completo original si está disponible (ej: 229712098017378@lid)
 * @returns {Promise<boolean>}
 */
async function isBlacklisted(telefono, restauranteId = RESTAURANTE_ID, remoteJid = null) {
  if (!telefono && !remoteJid) return false;

  const candidates = new Set();
  const rawTel = cleanDigits(telefono);
  const rawJid = cleanDigits(remoteJid);
  if (rawTel) candidates.add(rawTel);
  if (rawJid) candidates.add(rawJid);

  // Si telefono o remoteJid es un @lid, consultar teléfono verificado por WhatsApp en caché
  const cachedTel = getPhoneForLid(telefono) || (remoteJid ? getPhoneForLid(remoteJid) : null);
  if (cachedTel) {
    const cleanCached = cleanDigits(cachedTel);
    if (cleanCached) candidates.add(cleanCached);
  }

  if (candidates.size === 0) return false;

  const entries = await cargarListaNegra(restauranteId);
  for (const entry of entries) {
    const entryClean = entry.telefono_clean || cleanDigits(entry.telefono);
    if (!entryClean) continue;

    for (const cand of candidates) {
      if (phonesMatch(cand, entryClean)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Obtiene todos los registros de la lista negra para el restaurante
 */
async function getBlacklist(restauranteId = RESTAURANTE_ID) {
  return cargarListaNegra(restauranteId, true);
}

/**
 * Registra o actualiza un número en la lista negra
 */
async function addBlacklist({
  restauranteId = RESTAURANTE_ID,
  telefono,
  nombre = 'Repartidor',
  motivo = 'Repartidor',
}) {
  if (!telefono || typeof telefono !== 'string') {
    throw new Error('El número de teléfono es obligatorio');
  }

  const clean = cleanDigits(telefono);
  if (clean.length < 7) {
    throw new Error('El número debe tener al menos 7 dígitos');
  }

  await asegurarTabla();

  // Verificar si ya existe este número para el restaurante
  const check = await query(
    'SELECT id FROM lista_negra WHERE restaurante_id = $1 AND telefono_clean = $2',
    [restauranteId, clean]
  );

  let result;
  if (check.rows && check.rows.length > 0) {
    const existingId = check.rows[0].id;
    const updateRes = await query(
      `UPDATE lista_negra
       SET telefono = $1, nombre = $2, motivo = $3, updated_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [telefono.trim(), nombre.trim(), motivo.trim(), existingId]
    ).catch(async () => {
      // Fallback si no existe columna updated_at
      return query(
        `UPDATE lista_negra
         SET telefono = $1, nombre = $2, motivo = $3
         WHERE id = $4
         RETURNING *`,
        [telefono.trim(), nombre.trim(), motivo.trim(), existingId]
      );
    });
    result = updateRes.rows[0];
  } else {
    const insertRes = await query(
      `INSERT INTO lista_negra (restaurante_id, telefono, telefono_clean, nombre, motivo)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [restauranteId, telefono.trim(), clean, nombre.trim(), motivo.trim()]
    );
    result = insertRes.rows[0];
  }

  // Refrescar caché
  await cargarListaNegra(restauranteId, true);
  return result;
}

/**
 * Elimina un número de la lista negra
 */
async function removeBlacklist(id, restauranteId = RESTAURANTE_ID) {
  await asegurarTabla();
  await query(
    'DELETE FROM lista_negra WHERE id = $1 AND restaurante_id = $2',
    [id, restauranteId]
  );
  await cargarListaNegra(restauranteId, true);
  return true;
}

/**
 * Limpia la caché en memoria (útil en tests)
 */
function clearCache() {
  _cache.clear();
  _lastCacheTime = 0;
}

module.exports = {
  cleanDigits,
  isBlacklisted,
  getBlacklist,
  addBlacklist,
  removeBlacklist,
  clearCache,
};
