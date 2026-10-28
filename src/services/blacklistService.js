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
 * Carga o refresca la lista negra en memoria y sincroniza LIDs conocidos
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

    // Mapear LIDs históricos conocidos en pedidos para agilizar resolución
    try {
      const lidsRes = await query(
        `SELECT DISTINCT jid, telefono 
         FROM pedidos 
         WHERE jid LIKE '%@lid%' 
           AND telefono IS NOT NULL 
           AND LENGTH(telefono) >= 7`
      );
      if (lidsRes && lidsRes.rows) {
        for (const row of lidsRes.rows) {
          cacheLidMapping(row.jid, row.telefono);
        }
      }
    } catch {
      // Ignorar si falla la carga de LIDs
    }

    _cache.set(restauranteId, res.rows || []);
    _lastCacheTime = now;
    return res.rows || [];
  } catch (err) {
    console.warn('[blacklistService] Error al cargar lista_negra:', err.message);
    return _cache.get(restauranteId) || [];
  }
}

/**
 * Verifica si un número telefónico, JID o remitente está registrado en la lista negra.
 * Es compatible con formato @lid de WhatsApp resolviendo contra pedidos y caché.
 *
 * @param {string} telefono Número o JID de WhatsApp (+505..., 505..., 8888..., o LID numérico)
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

  // 1. Verificar si telefono o remoteJid es un LID y tiene mapeo en caché
  const cachedTel = getPhoneForLid(telefono) || (remoteJid ? getPhoneForLid(remoteJid) : null);
  if (cachedTel) {
    const cleanCached = cleanDigits(cachedTel);
    if (cleanCached) candidates.add(cleanCached);
  }

  // 2. Si el identificador tiene 14-16 dígitos (típico @lid) y aún no hay mapeo en caché,
  // consultar si la tabla pedidos tiene registrado el número real
  const lidCandidate = (rawTel.length >= 14 && rawTel.length <= 16) ? rawTel : (rawJid.length >= 14 && rawJid.length <= 16 ? rawJid : null);
  if (lidCandidate) {
    try {
      const dbLid = await query(
        `SELECT telefono FROM pedidos 
         WHERE (jid LIKE $1 OR jid = $2) 
           AND telefono IS NOT NULL 
           AND LENGTH(telefono) >= 7 
           AND telefono NOT LIKE '%@lid%' 
         ORDER BY created_at DESC 
         LIMIT 1`,
        [`%${lidCandidate}%`, `${lidCandidate}@lid`]
      );
      if (dbLid && dbLid.rows && dbLid.rows.length > 0 && dbLid.rows[0].telefono) {
        const dbPhoneClean = cleanDigits(dbLid.rows[0].telefono);
        if (dbPhoneClean) {
          candidates.add(dbPhoneClean);
          cacheLidMapping(`${lidCandidate}@lid`, dbPhoneClean);
        }
      }
    } catch {
      // Ignorar si BD no disponible en este contexto
    }
  }

  if (candidates.size === 0) return false;

  const entries = await cargarListaNegra(restauranteId);
  for (const entry of entries) {
    const entryClean = entry.telefono_clean || cleanDigits(entry.telefono);
    if (!entryClean) continue;

    for (const cand of candidates) {
      // Coincidencia exacta de dígitos
      if (cand === entryClean) return true;

      // Coincidencia con/sin código de país (>= 8 dígitos)
      // Ej: '50558544518' termina con '58544518'
      if (cand.length >= 8 && entryClean.length >= 8) {
        if (cand.endsWith(entryClean) || entryClean.endsWith(cand)) {
          return true;
        }
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

  // Asociar de inmediato cualquier LID histórico existente en pedidos para este número
  try {
    const localPhone = clean.length >= 8 && clean.startsWith('505') ? clean.substring(3) : clean;
    const dbJids = await query(
      `SELECT DISTINCT jid FROM pedidos 
       WHERE (telefono = $1 OR telefono = $2 OR telefono LIKE $3) 
         AND jid LIKE '%@lid%'`,
      [clean, localPhone, `%${localPhone}%`]
    );
    if (dbJids && dbJids.rows) {
      for (const row of dbJids.rows) {
        cacheLidMapping(row.jid, clean);
      }
    }
  } catch {
    // Continuar si la consulta falla
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
