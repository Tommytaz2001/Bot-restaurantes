const { db } = require('./firebaseService');
const { doc, getDoc, collection, getDocs } = require('firebase/firestore');

const TTL_MS = 5 * 60 * 1000; // 5 minutos
const _cache = new Map(); // Map<restauranteId, { config, menu, loadedAt }>

async function getRestauranteConfig(restauranteId) {
  const cached = _cache.get(restauranteId);
  if (cached && Date.now() - cached.loadedAt < TTL_MS) {
    return cached.config;
  }

  const restauranteDoc = await getDoc(doc(db, 'restaurantes', restauranteId));
  if (!restauranteDoc.exists()) {
    throw new Error(`Restaurante no encontrado: ${restauranteId}`);
  }

  const config = restauranteDoc.data();
  const menuSnapshot = await getDocs(collection(db, 'restaurantes', restauranteId, 'menu'));
  const menu = menuSnapshot.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => a.orden - b.orden);

  _cache.set(restauranteId, { config, menu, loadedAt: Date.now() });
  return config;
}

async function getMenu(restauranteId) {
  await getRestauranteConfig(restauranteId); // ensures cache is loaded
  return _cache.get(restauranteId).menu;
}

async function formatMenuForPrompt(restauranteId) {
  const config = await getRestauranteConfig(restauranteId);
  const menu = await getMenu(restauranteId);
  const moneda = config.moneda;

  const lines = [];
  for (const categoria of menu) {
    lines.push(`\n### ${categoria.nombre}`);
    for (const item of categoria.items) {
      let line = `- ${item.nombre}: ${moneda}${item.precio} — ${item.descripcion}`;
      if (item.opciones && item.opciones.length > 0) {
        line += ` [Opciones: ${item.opciones.join(', ')}]`;
      }
      lines.push(line);
    }
  }
  return lines.join('\n');
}

function clearMenuCache() {
  _cache.clear();
}

module.exports = { getRestauranteConfig, getMenu, formatMenuForPrompt, clearMenuCache };
