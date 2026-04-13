const { db, trackWrite, trackRead } = require('./firebaseService');
const {
  collection, doc, getDocs, addDoc, updateDoc, deleteDoc, getDoc,
} = require('firebase/firestore');
const { clearMenuCache } = require('./menuService');

const RESTAURANTE_ID = process.env.RESTAURANTE_ID ?? 'urbano';

const menuCol = () => collection(db, 'restaurantes', RESTAURANTE_ID, 'menu');
const categoriaDoc = (id) => doc(db, 'restaurantes', RESTAURANTE_ID, 'menu', id);

// ─── Categorías ───────────────────────────────────────────────────────────────

async function getCategorias() {
  trackRead('menuAdminService:getCategorias');
  const snap = await getDocs(menuCol());
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
}

async function addCategoria(nombre, orden) {
  trackWrite('menuAdminService:addCategoria', nombre);
  const ref = await addDoc(menuCol(), { nombre, orden, items: [] });
  clearMenuCache();
  return { id: ref.id };
}

async function updateCategoriaNombre(id, nombre) {
  trackWrite('menuAdminService:updateCategoriaNombre', `id=${id}`);
  await updateDoc(categoriaDoc(id), { nombre });
  clearMenuCache();
}

async function updateCategoriaOrden(id, orden) {
  trackWrite('menuAdminService:updateCategoriaOrden', `id=${id}`);
  await updateDoc(categoriaDoc(id), { orden });
  clearMenuCache();
}

async function deleteCategoria(id) {
  trackWrite('menuAdminService:deleteCategoria', `id=${id}`);
  await deleteDoc(categoriaDoc(id));
  clearMenuCache();
}

// ─── Items (siempre re-lee el array actual de Firestore) ──────────────────────

async function _getItems(categoriaId) {
  trackRead('menuAdminService:getItems', `categoriaId=${categoriaId}`);
  const snap = await getDoc(categoriaDoc(categoriaId));
  if (!snap.exists()) throw new Error(`Categoría no encontrada: ${categoriaId}`);
  return snap.data().items ?? [];
}

async function addItem(categoriaId, item) {
  const items = await _getItems(categoriaId);
  trackWrite('menuAdminService:addItem', `categoriaId=${categoriaId} nombre=${item.nombre}`);
  await updateDoc(categoriaDoc(categoriaId), {
    items: [...items, { ...item, disponible: true }],
  });
  clearMenuCache();
}

async function updateItem(categoriaId, index, updatedItem) {
  const items = await _getItems(categoriaId);
  if (index < 0 || index >= items.length) throw new Error(`Índice fuera de rango: ${index}`);
  const next = [...items];
  next[index] = updatedItem;
  trackWrite('menuAdminService:updateItem', `categoriaId=${categoriaId} idx=${index}`);
  await updateDoc(categoriaDoc(categoriaId), { items: next });
  clearMenuCache();
}

async function deleteItem(categoriaId, index) {
  const items = await _getItems(categoriaId);
  if (index < 0 || index >= items.length) throw new Error(`Índice fuera de rango: ${index}`);
  trackWrite('menuAdminService:deleteItem', `categoriaId=${categoriaId} idx=${index}`);
  await updateDoc(categoriaDoc(categoriaId), {
    items: items.filter((_, i) => i !== index),
  });
  clearMenuCache();
}

async function toggleDisponible(categoriaId, index) {
  const items = await _getItems(categoriaId);
  if (index < 0 || index >= items.length) throw new Error(`Índice fuera de rango: ${index}`);
  const next = [...items];
  next[index] = { ...next[index], disponible: !(next[index].disponible ?? true) };
  console.log(`[toggleDisponible] ${next[index].nombre} → disponible=${next[index].disponible} (doc=${categoriaId})`);
  trackWrite('menuAdminService:toggleDisponible', `categoriaId=${categoriaId} idx=${index}`);
  await updateDoc(categoriaDoc(categoriaId), { items: next });
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
