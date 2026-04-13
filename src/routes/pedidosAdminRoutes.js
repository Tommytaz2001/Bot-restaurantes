const { Router } = require('express');
const { requireAuth, requireAuthQuery } = require('../middleware/authMiddleware');
const {
  confirmarPedidoConETA,
  marcarEnCamino,
  marcarEntregado,
  rechazarPedido,
  aprobarCambio,
  rechazarCambio,
  fetchHistorial,
} = require('../services/pedidosAdminService');
const {
  createPedidosActivosStream,
  createHistorialStream,
  createPedidoDetalleStream,
} = require('../services/sseService');

const router = Router();

// ── Rutas estáticas ANTES de /:id ────────────────────────────────────────────

// SSE: stream de pedidos activos
router.get('/activos/stream', requireAuthQuery, (req, res) => {
  createPedidosActivosStream(res);
});

// Historial paginado (REST)
router.get('/historial', requireAuth, async (req, res) => {
  try {
    const { filtro = 'todos', afterTs = null } = req.query;
    const result = await fetchHistorial({ filtro, afterTs });
    res.json(result);
  } catch (err) {
    console.error('[GET /pedidos-admin/historial]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// SSE: stream de historial
router.get('/historial/stream', requireAuthQuery, (req, res) => {
  createHistorialStream(res);
});

// ── Rutas dinámicas /:id ──────────────────────────────────────────────────────

// SSE: stream de un pedido individual
router.get('/:id/stream', requireAuthQuery, (req, res) => {
  createPedidoDetalleStream(res, req.params.id);
});

// Confirmar pedido (con ETA opcional)
router.patch('/:id/confirmar', requireAuth, async (req, res) => {
  try {
    await confirmarPedidoConETA(req.params.id, req.body.tiempoEstimadoMin);
    res.json({ ok: true });
  } catch (err) {
    console.error('[PATCH /pedidos-admin/:id/confirmar]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Marcar en camino
router.patch('/:id/en-camino', requireAuth, async (req, res) => {
  try {
    await marcarEnCamino(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    console.error('[PATCH /pedidos-admin/:id/en-camino]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Marcar entregado
router.patch('/:id/entregado', requireAuth, async (req, res) => {
  try {
    await marcarEntregado(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    console.error('[PATCH /pedidos-admin/:id/entregado]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Rechazar pedido
router.patch('/:id/rechazar', requireAuth, async (req, res) => {
  try {
    await rechazarPedido(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    console.error('[PATCH /pedidos-admin/:id/rechazar]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Aprobar cambio solicitado
router.patch('/:id/cambio/aprobar', requireAuth, async (req, res) => {
  try {
    await aprobarCambio(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    console.error('[PATCH /pedidos-admin/:id/cambio/aprobar]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Rechazar cambio solicitado
router.patch('/:id/cambio/rechazar', requireAuth, async (req, res) => {
  try {
    await rechazarCambio(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    console.error('[PATCH /pedidos-admin/:id/cambio/rechazar]', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
