const { query } = require('../db/connection');

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
 * Verifica si un número telefónico o remitente está registrado en la lista negra
 * @param {string} telefono Número o JID de WhatsApp (+505..., 505..., 8888..., etc.)
 * @param {string} [restauranteId]
 * @returns {Promise<boolean>}
 */
async function isBlacklisted(telefono, restauranteId = RESTAURANTE_ID) {
  if (!telefono) return false;
  const inClean = cleanDigits(telefono);
  if (!inClean) return false;

  const entries = await cargarListaNegra(restauranteId);
  for (const entry of entries) {
    const entryClean = entry.telefono_clean || cleanDigits(entry.telefono);
    if (!entryClean) continue;

    // 1. Coincidencia exacta de dígitos
    if (inClean === entryClean) return true;

    // 2. Coincidencia de número local vs con código de país
    // Ej: número guardado como '88888888' y entrante como '50588888888'
    // o guardado como '50588888888' y entrante como '88888888'
    if (inClean.length >= 8 && entryClean.length >= 8) {
      if (inClean.endsWith(entryClean) || entryClean.endsWith(inClean)) {
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
