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
