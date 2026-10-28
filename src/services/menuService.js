const { query } = require('../db/connection');

const TTL_MS = 5 * 60 * 1000; // 5 minutos
const _cache = new Map(); // Map<restauranteId, { config, menu, loadedAt }>

async function getRestauranteConfig(restauranteId = 'urbano') {
  const cached = _cache.get(restauranteId);
  if (cached && Date.now() - cached.loadedAt < TTL_MS) {
    return cached.config;
  }

  const res = await query('SELECT * FROM restaurantes WHERE id = $1', [restauranteId]);
  if (res.rows.length === 0) {
    throw new Error(`Restaurante no encontrado: ${restauranteId}`);
  }

  const row = res.rows[0];
  const proteinasBloqueadas = Array.isArray(row.proteinas_bloqueadas) ? row.proteinas_bloqueadas : [];
  const config = {
    id: row.id,
    nombre: row.nombre,
    moneda: row.moneda,
    pais: row.pais,
    departamento: row.departamento || 'Jinotega',
    direccion: row.direccion || 'De rest Mi Rancho 10 vrs al sur, casa naranja, sin rótulo de momento',
    telefono: row.telefono,
    activo: row.activo,
    horario: row.horario,
    cuentas_bancarias: row.cuentas_bancarias,
    proteinas_bloqueadas: proteinasBloqueadas,
  };

  // Cargar categorías y productos
  const catRes = await query(
    'SELECT * FROM categorias WHERE restaurante_id = $1 ORDER BY orden ASC',
    [restauranteId]
  );
  const prodRes = await query(
    'SELECT * FROM productos WHERE restaurante_id = $1 ORDER BY nombre ASC',
    [restauranteId]
  );

  const menu = catRes.rows.map((cat) => {
    const items = prodRes.rows
      .filter((p) => p.categoria_id === cat.id)
      .map((p) => {
        const bloqueadoPorProteina = isProteinaBloqueada(p.proteina, proteinasBloqueadas);
        const estaDisponible = p.disponible && !bloqueadoPorProteina;
        return {
          id: p.id,
          nombre: p.nombre,
          precio: parseFloat(p.precio),
          descripcion: p.descripcion,
          opciones: p.opciones || [],
          disponible: estaDisponible,
          disponibleBase: p.disponible,
          proteina: p.proteina || null,
          bloqueadoPorProteina,
        };
      });
    return {
      id: cat.id,
      nombre: cat.nombre,
      orden: cat.orden,
      items,
    };
  });

  _cache.set(restauranteId, { config, menu, loadedAt: Date.now() });
  return config;
}

function isProteinaBloqueada(proteina, proteinasBloqueadas = []) {
  if (!proteina || !Array.isArray(proteinasBloqueadas) || proteinasBloqueadas.length === 0) {
    return false;
  }
  const norm = proteina.toLowerCase().trim();
  const list = proteinasBloqueadas.map((p) => p.toLowerCase().trim());
  if (list.includes(norm)) return true;
  if (norm === 'mixto' && (list.includes('pollo') || list.includes('cerdo'))) return true;
  return false;
}

async function getMenu(restauranteId = 'urbano') {
  await getRestauranteConfig(restauranteId);
  return _cache.get(restauranteId).menu;
}

// Diccionario de sinónimos, apodos y términos populares de búsqueda para el menú
const ITEM_SYNONYMS = {
  // Hamburguesas
  'hamb-clasica': ['sencilla', 'normal', 'básica', 'simple', 'tradicional', 'la barata'],
  'hamb-premium': ['especial', 'jamón y queso', 'con salsa barbacoa/bbq', 'con chipotle', 'con salsa dulce'],
  'hamb-nivel-100': ['la más grande', 'la gigante', 'la que tiene de todo', 'la bomba', 'dos tortas con tocino', 'bacon', 'la monstruo', 'completa'],
  'hamb-cheeseburguer': ['sin vegetales', 'sin verduras', 'sin monte', 'solo carne y queso', 'triple queso', 'cheeseburger'],
  'hamb-pollito': ['de pollo', 'pollo a la plancha', 'pechuga'],
  'hamb-chuletona': ['de chuleta', 'de cerdo', 'de chancho', 'chuletón'],
  'hamb-double-cheeseburguer': ['doble carne', 'dos carnes', 'dos tortas', 'doble con queso', 'doble cheeseburger'],

  // Tacos
  'taco-birria': ['con caldo', 'con consomé', 'para remojar', 'birria'],
  'taco-pastor-cerdo': ['al pastor', 'pastor', 'adobada'],
  'taco-pollo': ['de pollo'],
  'taco-cerdo': ['de cerdo', 'de chancho', 'de puerco'],
  'taco-mixto': ['mixtos', 'combinados', 'mitad y mitad'],

  // Burritos
  'burrito-pastor-cerdo': ['al pastor', 'adobada', 'pastor'],
  'burrito-pastor-combo': ['pastor combo', 'con papas y gaseosa'],
  'burrito-pollo': ['de pollo'],
  'burrito-pollo-combo': ['pollo combo', 'con papas y gaseosa'],
  'burrito-cerdo': ['de cerdo', 'de chancho', 'de puerco'],
  'burrito-cerdo-combo': ['cerdo combo', 'con papas y gaseosa'],
  'burrito-mixto': ['mixto', 'con todo', 'dos carnes'],
  'burrito-mixto-combo': ['mixto combo', 'con papas y gaseosa'],
  'burrito-atun': ['de atún', 'de pescado', 'de mar'],
  'burrito-birria': ['de birria', 'con consomé', 'con caldo'],

  // Nachos
  'nacho-pollo': ['de pollo'],
  'nacho-cerdo': ['de cerdo', 'de chancho', 'de pastor'],
  'nacho-birria': ['de birria', 'con caldo', 'con consomé'],

  // Quesadillas
  'quesadilla-pastor': ['de pastor', 'al pastor', 'de carne'],
  'quesadilla-pollo': ['de pollo'],
  'quesadilla-cerdo': ['de cerdo', 'de chancho'],

  // Papas Fritas
  'papas-peor-es-nada': ['sencillas', 'con kétchup y cheddar', 'las normales de 80'],
  'papas-de-calle': ['bañadas', 'de la calle', 'con salsa dulce y queso rayado'],
  'papas-premium': ['salchipapas', 'con salchicha parrillera', 'con salchicha'],
  'papas-nivel-100': ['cargadas', 'con todo', 'locas', 'con carne y salchicha', 'preparadas'],

  // Bebidas
  'coca-cola': ['coca', 'coca normal', 'chesco', 'gaseosa negra'],
  'fresca': ['de toronja', 'gaseosa blanca'],
  'hi-c': ['té', 'té frío', 'té limón', 'jugo'],

  // Extras
  'extra-salsa-aguacate': ['guacamole', 'salsa verde'],
  'extra-salsa-roja': ['chile', 'picante', 'salsita roja'],
  'extra-cheddar': ['queso extra', 'queso amarillo'],
  'extra-papas': ['papas extras', 'más papas', 'porción de papas'],
};

function getItemSynonyms(item) {
  if (item.id && ITEM_SYNONYMS[item.id]) return ITEM_SYNONYMS[item.id];
  const normName = (item.nombre || '').toLowerCase().trim();
  for (const [id, syns] of Object.entries(ITEM_SYNONYMS)) {
    const cleanId = id.replace(/^(hamb-|taco-|burrito-|nacho-|quesadilla-|papas-|extra-)/, '').toLowerCase();
    if (normName.includes(cleanId) || cleanId.includes(normName)) {
      return syns;
    }
  }
  return null;
}

async function formatMenuForPrompt(restauranteId = 'urbano') {
  const config = await getRestauranteConfig(restauranteId);
  const menu = await getMenu(restauranteId);
  const moneda = config.moneda || 'C$';

  const lines = [];
  for (const categoria of menu) {
    lines.push(`\n### ${categoria.nombre}`);
    for (const item of categoria.items) {
      const agotado = item.disponible === false;
      let line = `- ${item.nombre}: ${moneda}${item.precio} — ${item.descripcion}`;
      if (item.opciones && item.opciones.length > 0) {
        line += ` [Opciones: ${item.opciones.join(', ')}]`;
      }
      const sinonimos = getItemSynonyms(item);
      if (sinonimos && sinonimos.length > 0) {
        line += ` [Sinónimos/Apodos: ${sinonimos.join(', ')}]`;
      }
      if (agotado) {
        if (item.bloqueadoPorProteina) {
          line += ` [AGOTADO — Proteína (${item.proteina}) agotada hoy]`;
        } else {
          line += ' [AGOTADO]';
        }
      }
      lines.push(line);
    }
  }
  return lines.join('\n');
}

async function getCuentasBancariasText(restauranteId = 'urbano') {
  const config = await getRestauranteConfig(restauranteId);
  return config.cuentas_bancarias || '';
}

function clearMenuCache() {
  _cache.clear();
}

module.exports = {
  getRestauranteConfig,
  getMenu,
  formatMenuForPrompt,
  getCuentasBancariasText,
  clearMenuCache,
};
