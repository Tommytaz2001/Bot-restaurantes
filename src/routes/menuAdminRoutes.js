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
    res.json({ categorias });
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

router.patch('/categorias/:categoriaId/items/:idx', async (req, res) => {
  try {
    const index = Number(req.params.idx);
    if (isNaN(index)) return res.status(400).json({ error: 'idx debe ser un número' });
    await updateItem(req.params.categoriaId, index, req.body);
    res.json({ ok: true });
  } catch (err) {
    console.error('[PATCH /menu-admin/categorias/:id/items/:idx]', err.message);
    res.status(err.message.includes('rango') ? 400 : 500).json({ error: err.message });
  }
});

router.delete('/categorias/:categoriaId/items/:idx', async (req, res) => {
  try {
    const index = Number(req.params.idx);
    if (isNaN(index)) return res.status(400).json({ error: 'idx debe ser un número' });
    await deleteItem(req.params.categoriaId, index);
    res.json({ ok: true });
  } catch (err) {
    console.error('[DELETE /menu-admin/categorias/:id/items/:idx]', err.message);
    res.status(err.message.includes('rango') ? 400 : 500).json({ error: err.message });
  }
});

router.patch('/categorias/:categoriaId/items/:idx/toggle', async (req, res) => {
  try {
    const index = Number(req.params.idx);
    if (isNaN(index)) return res.status(400).json({ error: 'idx debe ser un número' });
    await toggleDisponible(req.params.categoriaId, index);
    res.json({ ok: true });
  } catch (err) {
    console.error('[PATCH /menu-admin/categorias/:id/items/:idx/toggle]', err.message);
    res.status(err.message.includes('rango') ? 400 : 500).json({ error: err.message });
  }
});

module.exports = router;
