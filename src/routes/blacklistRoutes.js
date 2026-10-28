const express = require('express');
const {
  getBlacklist,
  addBlacklist,
  removeBlacklist,
} = require('../services/blacklistService');

const router = express.Router();

const RESTAURANTE_ID = process.env.RESTAURANTE_ID || 'urbano';

// GET /blacklist - Listar todos los números en lista negra
router.get('/', async (req, res) => {
  try {
    const restauranteId = req.user?.restauranteId || RESTAURANTE_ID;
    const items = await getBlacklist(restauranteId);
    res.json({ ok: true, blacklist: items });
  } catch (err) {
    console.error('[GET /blacklist] Error:', err.message);
    res.status(500).json({ error: 'Error al obtener la lista negra' });
  }
});

// POST /blacklist - Registrar número en lista negra
router.post('/', async (req, res) => {
  try {
    const restauranteId = req.user?.restauranteId || RESTAURANTE_ID;
    const { telefono, nombre, motivo } = req.body;

    if (!telefono) {
      return res.status(400).json({ error: 'El número de teléfono es obligatorio' });
    }

    const item = await addBlacklist({
      restauranteId,
      telefono,
      nombre: nombre || 'Repartidor',
      motivo: motivo || 'Repartidor',
    });

    res.status(201).json({ ok: true, item });
  } catch (err) {
    console.error('[POST /blacklist] Error:', err.message);
    res.status(400).json({ error: err.message });
  }
});

// DELETE /blacklist/:id - Eliminar de la lista negra
router.delete('/:id', async (req, res) => {
  try {
    const restauranteId = req.user?.restauranteId || RESTAURANTE_ID;
    await removeBlacklist(req.params.id, restauranteId);
    res.json({ ok: true, message: 'Número eliminado de la lista negra' });
  } catch (err) {
    console.error('[DELETE /blacklist/:id] Error:', err.message);
    res.status(500).json({ error: 'Error al eliminar número de la lista negra' });
  }
});

module.exports = router;
