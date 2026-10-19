const { randomUUID } = require('crypto');
const { query } = require('../db/connection');
const { clearMenuCache } = require('./menuService');

const RESTAURANTE_ID = process.env.RESTAURANTE_ID ?? 'urbano';

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

async function getCategorias() {
  const restRes = await query(
    'SELECT proteinas_bloqueadas FROM restaurantes WHERE id = $1',
    [RESTAURANTE_ID]
  );
  const proteinasBloqueadas = Array.isArray(restRes.rows[0]?.proteinas_bloqueadas)
    ? restRes.rows[0].proteinas_bloqueadas
    : [];

  const catRes = await query(
    'SELECT * FROM categorias WHERE restaurante_id = $1 ORDER BY orden ASC',
    [RESTAURANTE_ID]
  );
  const prodRes = await query(
    'SELECT * FROM productos WHERE restaurante_id = $1 ORDER BY nombre ASC',
    [RESTAURANTE_ID]
  );

  return catRes.rows.map((cat) => {
    const items = prodRes.rows
      .filter((p) => p.categoria_id === cat.id)
      .map((p) => {
        const bloqueadoPorProteina = isProteinaBloqueada(p.proteina, proteinasBloqueadas);
        return {
          id: p.id,
          nombre: p.nombre,
          precio: parseFloat(p.precio),
          descripcion: p.descripcion,
          opciones: p.opciones || [],
          disponible: p.disponible,
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
}

async function addCategoria(nombre, orden = 0) {
  const id = `cat_${Date.now()}`;
  await query(
    'INSERT INTO categorias (id, restaurante_id, nombre, orden) VALUES ($1, $2, $3, $4)',
    [id, RESTAURANTE_ID, nombre, orden]
  );
  clearMenuCache();
  return { id };
}

async function updateCategoriaNombre(id, nombre) {
  await query('UPDATE categorias SET nombre = $1 WHERE id = $2', [nombre, id]);
  clearMenuCache();
}

async function updateCategoriaOrden(id, orden) {
  await query('UPDATE categorias SET orden = $1 WHERE id = $2', [orden, id]);
  clearMenuCache();
}

async function deleteCategoria(id) {
  await query('DELETE FROM categorias WHERE id = $1', [id]);
  clearMenuCache();
}

async function addItem(categoriaId, item) {
  const id = item.id || `prod_${Date.now()}`;
  await query(
    `INSERT INTO productos (id, restaurante_id, categoria_id, nombre, precio, descripcion, opciones, disponible, proteina)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      id,
      RESTAURANTE_ID,
      categoriaId,
      item.nombre,
      item.precio,
      item.descripcion || '',
      JSON.stringify(item.opciones || []),
      item.disponible !== false,
      item.proteina || null,
    ]
  );
  clearMenuCache();
  return { id };
}

async function updateItem(categoriaId, indexOrId, updatedItem) {
  const hasProteina = updatedItem.proteina !== undefined;
  if (typeof indexOrId === 'string' && indexOrId.length > 5) {
    if (hasProteina) {
      await query(
        `UPDATE productos 
         SET nombre = $1, precio = $2, descripcion = $3, opciones = $4, disponible = $5, proteina = $6
         WHERE id = $7`,
        [
          updatedItem.nombre,
          updatedItem.precio,
          updatedItem.descripcion || '',
          JSON.stringify(updatedItem.opciones || []),
          updatedItem.disponible !== false,
          updatedItem.proteina || null,
          indexOrId,
        ]
      );
    } else {
      await query(
        `UPDATE productos 
         SET nombre = $1, precio = $2, descripcion = $3, opciones = $4, disponible = $5
         WHERE id = $6`,
        [
          updatedItem.nombre,
          updatedItem.precio,
          updatedItem.descripcion || '',
          JSON.stringify(updatedItem.opciones || []),
          updatedItem.disponible !== false,
          indexOrId,
        ]
      );
    }
  } else {
    // Buscar por índice en la categoría
    const prodRes = await query(
      'SELECT id FROM productos WHERE categoria_id = $1 ORDER BY nombre ASC',
      [categoriaId]
    );
    const target = prodRes.rows[indexOrId];
    if (target) {
      if (hasProteina) {
        await query(
          `UPDATE productos 
           SET nombre = $1, precio = $2, descripcion = $3, opciones = $4, disponible = $5, proteina = $6
           WHERE id = $7`,
          [
            updatedItem.nombre,
            updatedItem.precio,
            updatedItem.descripcion || '',
            JSON.stringify(updatedItem.opciones || []),
            updatedItem.disponible !== false,
            updatedItem.proteina || null,
            target.id,
          ]
        );
      } else {
        await query(
          `UPDATE productos 
           SET nombre = $1, precio = $2, descripcion = $3, opciones = $4, disponible = $5
           WHERE id = $6`,
          [
            updatedItem.nombre,
            updatedItem.precio,
            updatedItem.descripcion || '',
            JSON.stringify(updatedItem.opciones || []),
            updatedItem.disponible !== false,
            target.id,
          ]
        );
      }
    }
  }
  clearMenuCache();
}

async function deleteItem(categoriaId, indexOrId) {
  if (typeof indexOrId === 'string' && indexOrId.length > 5) {
    await query('DELETE FROM productos WHERE id = $1', [indexOrId]);
  } else {
    const prodRes = await query(
      'SELECT id FROM productos WHERE categoria_id = $1 ORDER BY nombre ASC',
      [categoriaId]
    );
    const target = prodRes.rows[indexOrId];
    if (target) {
      await query('DELETE FROM productos WHERE id = $1', [target.id]);
    }
  }
  clearMenuCache();
}

async function toggleDisponible(categoriaId, indexOrId) {
  let targetId = indexOrId;
  if (typeof indexOrId === 'number' || (typeof indexOrId === 'string' && !isNaN(indexOrId))) {
    const prodRes = await query(
      'SELECT id FROM productos WHERE categoria_id = $1 ORDER BY nombre ASC',
      [categoriaId]
    );
    const target = prodRes.rows[indexOrId];
    if (target) targetId = target.id;
  }

  await query('UPDATE productos SET disponible = NOT disponible WHERE id = $1', [targetId]);
  clearMenuCache();
}

module.exports = {
  getCategorias,
  addCategoria,
  updateCategoriaNombre,
  updateCategoriaOrden,
  deleteCategoria,
  addItem,
  updateItem,
  deleteItem,
  toggleDisponible,
};
