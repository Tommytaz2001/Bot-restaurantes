const { Router } = require('express');
const {
  getCategorias,
  addCategoria,
  updateCategoriaNombre,
  updateCategoriaOrden,
  deleteCategoria,
  addItem,
  updateItem,
  deleteItem,
  toggleDisponible,
} = require('../services/menuAdminService');

const router = Router();

// ── Categorías ────────────────────────────────────────────────────────────────

router.get('/categorias', async (req, res) => {
  try {
    const categorias = await getCategorias();
    res.json(categorias);
  } catch (err) {
    console.error('[GET /menu-admin/categorias]', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/categorias', async (req, res) => {
  try {
    const { nombre, orden } = req.body;
    if (!nombre) return res.status(400).json({ error: 'Falta el campo nombre' });
    const result = await addCategoria(nombre, orden ?? 0);
    res.status(201).json(result);
  } catch (err) {
    console.error('[POST /menu-admin/categorias]', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.patch('/categorias/:id/nombre', async (req, res) => {
  try {
    const { nombre } = req.body;
    if (!nombre) return res.status(400).json({ error: 'Falta el campo nombre' });
    await updateCategoriaNombre(req.params.id, nombre);
    res.json({ ok: true });
  } catch (err) {
    console.error('[PATCH /menu-admin/categorias/:id/nombre]', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.patch('/categorias/:id/orden', async (req, res) => {
  try {
    const { orden } = req.body;
    if (orden == null) return res.status(400).json({ error: 'Falta el campo orden' });
    await updateCategoriaOrden(req.params.id, orden);
    res.json({ ok: true });
  } catch (err) {
    console.error('[PATCH /menu-admin/categorias/:id/orden]', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.delete('/categorias/:id', async (req, res) => {
  try {
    await deleteCategoria(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    console.error('[DELETE /menu-admin/categorias/:id]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Items ─────────────────────────────────────────────────────────────────────

router.post('/categorias/:categoriaId/items', async (req, res) => {
  try {
    await addItem(req.params.categoriaId, req.body);
    res.status(201).json({ ok: true });
  } catch (err) {
    console.error('[POST /menu-admin/categorias/:id/items]', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.patch(['/categorias/:categoriaId/items/:idx', '/categorias/:categoriaId/items/:idx/actualizar'], async (req, res) => {
  try {
    const indexOrId = isNaN(Number(req.params.idx)) ? req.params.idx : Number(req.params.idx);
    await updateItem(req.params.categoriaId, indexOrId, req.body);
    res.json({ ok: true });
  } catch (err) {
    console.error('[PATCH /menu-admin/categorias/:id/items/:idx]', err.message);
    res.status(err.message.includes('rango') ? 400 : 500).json({ error: err.message });
  }
});

router.delete('/categorias/:categoriaId/items/:idx', async (req, res) => {
  try {
    const indexOrId = isNaN(Number(req.params.idx)) ? req.params.idx : Number(req.params.idx);
    await deleteItem(req.params.categoriaId, indexOrId);
    res.json({ ok: true });
  } catch (err) {
    console.error('[DELETE /menu-admin/categorias/:id/items/:idx]', err.message);
    res.status(err.message.includes('rango') ? 400 : 500).json({ error: err.message });
  }
});

router.patch(['/categorias/:categoriaId/items/:idx/toggle', '/categorias/:categoriaId/items/:idx/toggle-disponible'], async (req, res) => {
  try {
    const indexOrId = isNaN(Number(req.params.idx)) ? req.params.idx : Number(req.params.idx);
    await toggleDisponible(req.params.categoriaId, indexOrId);
    res.json({ ok: true });
  } catch (err) {
    console.error('[PATCH /menu-admin/categorias/:id/items/:idx/toggle]', err.message);
    res.status(err.message.includes('rango') ? 400 : 500).json({ error: err.message });
  }
});

module.exports = router;
