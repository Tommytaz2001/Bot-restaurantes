const { query } = require('../db/connection');
const { getOrder } = require('../orders/orderService');
const { orderEvents } = require('./orderEvents');

const RESTAURANTE_ID = process.env.RESTAURANTE_ID ?? 'urbano';

async function actualizarEstado(id, data) {
  const fields = [];
  const values = [];
  let idx = 1;

  for (const [key, value] of Object.entries(data)) {
    fields.push(`${key} = $${idx}`);
    values.push(value);
    idx++;
  }
  fields.push('updated_at = NOW()');
  values.push(id);

  const sql = `UPDATE pedidos SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`;
  await query(sql, values);

  const updated = await getOrder(id);
  if (updated) {
    orderEvents.emit('order:updated', { restauranteId: updated.restauranteId, pedido: updated });
  }
  return updated;
}

async function confirmarPedidoConETA(id, tiempoEstimadoMin) {
  const update = { estado: 'confirmado' };
  if (tiempoEstimadoMin) update.tiempo_estimado_min = tiempoEstimadoMin;
  return actualizarEstado(id, update);
}

async function marcarEnCamino(id) {
  return actualizarEstado(id, { estado: 'en_camino' });
}

async function marcarEntregado(id) {
  return actualizarEstado(id, { estado: 'entregado' });
}

async function rechazarPedido(id) {
  return actualizarEstado(id, { estado: 'cancelado' });
}

async function aprobarCambio(id, tiempoEstimadoMin) {
  const snap = await query('SELECT * FROM pedidos WHERE id = $1', [id]);
  if (snap.rows.length === 0) throw new Error(`Pedido no encontrado: ${id}`);

  const row = snap.rows[0];
  const cambio = row.cambio_solicitado;
  if (!cambio) throw new Error(`Pedido ${id} no tiene cambio_solicitado`);

  cambio.estado = 'aprobado';
  cambio.respondidoAt = new Date().toISOString();

  const etaVal = (tiempoEstimadoMin !== undefined && tiempoEstimadoMin !== null && !isNaN(parseInt(tiempoEstimadoMin, 10)))
    ? parseInt(tiempoEstimadoMin, 10)
    : null;

  if (etaVal !== null) {
    cambio.nuevo_tiempo_estimado = etaVal;
  }

  let totalNuevo = parseFloat(row.total);
  if (cambio.tipo === 'agregar_productos' && cambio.productos_nuevos?.length > 0) {
    for (const p of cambio.productos_nuevos) {
      const subtotal = p.precio_unitario * p.cantidad;
      await query(
        `INSERT INTO pedido_items (pedido_id, nombre, cantidad, precio_unitario, opcion, subtotal)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [id, p.nombre, p.cantidad, p.precio_unitario, p.opcion || null, subtotal]
      );
    }
    if (cambio.total_nuevo != null) {
      totalNuevo = parseFloat(cambio.total_nuevo);
    }
  }

  if (cambio.tipo === 'cambiar_entrega' && cambio.datos_entrega) {
    const { tipo_entrega, direccion, costo_envio, total_nuevo } = cambio.datos_entrega;
    if (etaVal !== null) {
      await query(
        `UPDATE pedidos 
         SET tipo_entrega = $1, direccion = $2, costo_envio = $3, total = $4, cambio_solicitado = $5, tiempo_estimado_min = $6, updated_at = NOW()
         WHERE id = $7`,
        [tipo_entrega, direccion || null, costo_envio, total_nuevo, JSON.stringify(cambio), etaVal, id]
      );
    } else {
      await query(
        `UPDATE pedidos 
         SET tipo_entrega = $1, direccion = $2, costo_envio = $3, total = $4, cambio_solicitado = $5, updated_at = NOW()
         WHERE id = $6`,
        [tipo_entrega, direccion || null, costo_envio, total_nuevo, JSON.stringify(cambio), id]
      );
    }
  } else {
    if (etaVal !== null) {
      await query(
        `UPDATE pedidos 
         SET total = $1, cambio_solicitado = $2, tiempo_estimado_min = $3, updated_at = NOW()
         WHERE id = $4`,
        [totalNuevo, JSON.stringify(cambio), etaVal, id]
      );
    } else {
      await query(
        `UPDATE pedidos 
         SET total = $1, cambio_solicitado = $2, updated_at = NOW()
         WHERE id = $3`,
        [totalNuevo, JSON.stringify(cambio), id]
      );
    }
  }

  const updated = await getOrder(id);
  orderEvents.emit('order:updated', { restauranteId: updated.restauranteId, pedido: updated });
  return updated;
}

async function rechazarCambio(id) {
  const snap = await query('SELECT * FROM pedidos WHERE id = $1', [id]);
  if (snap.rows.length === 0) throw new Error(`Pedido no encontrado: ${id}`);

  const cambio = snap.rows[0].cambio_solicitado;
  if (!cambio) throw new Error(`Pedido ${id} no tiene cambio_solicitado`);

  cambio.estado = 'rechazado';
  cambio.respondidoAt = new Date().toISOString();

  await query(
    `UPDATE pedidos SET cambio_solicitado = $1, updated_at = NOW() WHERE id = $2`,
    [JSON.stringify(cambio), id]
  );

  const updated = await getOrder(id);
  orderEvents.emit('order:updated', { restauranteId: updated.restauranteId, pedido: updated });
  return updated;
}

async function fetchHistorial({ filtro = 'todos' }) {
  let dateCondition = '';
  if (filtro === 'hoy') {
    dateCondition = "AND created_at >= CURRENT_DATE";
  } else if (filtro === 'ayer') {
    dateCondition = "AND created_at >= CURRENT_DATE - INTERVAL '1 day' AND created_at < CURRENT_DATE";
  } else if (filtro === '7dias') {
    dateCondition = "AND created_at >= CURRENT_DATE - INTERVAL '7 days'";
  } else if (filtro === '30dias') {
    dateCondition = "AND created_at >= CURRENT_DATE - INTERVAL '30 days'";
  }

  const sql = `
    SELECT * FROM pedidos 
    WHERE restaurante_id = $1 AND estado IN ('entregado', 'cancelado') ${dateCondition}
    ORDER BY created_at DESC LIMIT 50
  `;
  const res = await query(sql, [RESTAURANTE_ID]);
  const pedidos = [];
  for (const row of res.rows) {
    const itemsRes = await query('SELECT * FROM pedido_items WHERE pedido_id = $1', [row.id]);
    const { mapRowToOrder } = require('../orders/orderService');
    // Simple inline mapping if helper is internal
    pedidos.push({
      id: row.id,
      cliente: row.cliente,
      telefono: row.telefono,
      jid: row.jid,
      tipo_entrega: row.tipo_entrega,
      direccion: row.direccion,
      costo_envio: parseFloat(row.costo_envio || 0),
      total: parseFloat(row.total || 0),
      metodo_pago: row.metodo_pago,
      estado: row.estado,
      comprobante_url: row.comprobante_url,
      createdAt: row.created_at,
      productos: itemsRes.rows.map((i) => ({
        nombre: i.nombre,
        cantidad: parseInt(i.cantidad, 10),
        precio_unitario: parseFloat(i.precio_unitario),
        opcion: i.opcion,
      })),
    });
  }

  return { pedidos, hasMore: false };
}

async function getPedidosActivos(restauranteId = RESTAURANTE_ID) {
  const sql = `
    SELECT * FROM pedidos 
    WHERE restaurante_id = $1 AND estado IN ('pendiente', 'pendiente_pago', 'confirmado', 'en_camino')
    ORDER BY created_at DESC
  `;
  const res = await query(sql, [restauranteId]);
  const pedidos = [];
  for (const row of res.rows) {
    const itemsRes = await query('SELECT * FROM pedido_items WHERE pedido_id = $1', [row.id]);
    pedidos.push({
      id: row.id,
      restauranteId: row.restaurante_id,
      cliente: row.cliente,
      telefono: row.telefono,
      jid: row.jid,
      tipo_entrega: row.tipo_entrega,
      direccion: row.direccion,
      costo_envio: parseFloat(row.costo_envio || 0),
      total: parseFloat(row.total || 0),
      metodo_pago: row.metodo_pago,
      estado: row.estado,
      comprobante_url: row.comprobante_url,
      tiempo_estimado_min: row.tiempo_estimado_min,
      sessionId: row.session_id,
      cambio_solicitado: row.cambio_solicitado,
      createdAt: row.created_at,
      productos: itemsRes.rows.map((i) => ({
        nombre: i.nombre,
        cantidad: parseInt(i.cantidad, 10),
        precio_unitario: parseFloat(i.precio_unitario),
        opcion: i.opcion,
      })),
    });
  }
  return pedidos;
}

module.exports = {
  actualizarEstado,
  confirmarPedidoConETA,
  marcarEnCamino,
  marcarEntregado,
  rechazarPedido,
  aprobarCambio,
  rechazarCambio,
  fetchHistorial,
  getPedidosActivos,
};
