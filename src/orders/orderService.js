const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { query, pool } = require('../db/connection');
const { validateOrder } = require('./orderValidator');
const { orderEvents } = require('../services/orderEvents');

const COSTO_ENVIO = 40;
const UPLOADS_DIR = path.join(__dirname, '../../uploads');

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

function buildEstado(metodoPago) {
  return metodoPago === 'transferencia' ? 'pendiente_pago' : 'pendiente';
}

function mapRowToOrder(row, items = []) {
  if (!row) return null;
  return {
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
    notificaciones_enviadas: row.notificaciones_enviadas || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    productos: items.map((i) => ({
      nombre: i.nombre,
      cantidad: parseInt(i.cantidad, 10),
      precio_unitario: parseFloat(i.precio_unitario),
      opcion: i.opcion,
      subtotal: parseFloat(i.subtotal || 0),
    })),
  };
}

async function findExistingOrder(sessionId) {
  if (!sessionId) return null;
  const res = await query(
    `SELECT * FROM pedidos 
     WHERE session_id = $1 AND estado IN ('pendiente', 'pendiente_pago')
     ORDER BY created_at DESC LIMIT 1`,
    [sessionId]
  );
  if (res.rows.length === 0) return null;
  const itemsRes = await query(
    `SELECT * FROM pedido_items WHERE pedido_id = $1`,
    [res.rows[0].id]
  );
  return mapRowToOrder(res.rows[0], itemsRes.rows);
}

async function findActiveOrderByPhone(telefono) {
  if (!telefono) return null;
  const res = await query(
    `SELECT * FROM pedidos 
     WHERE (session_id = $1 OR telefono = $1)
       AND estado IN ('pendiente', 'pendiente_pago', 'confirmado', 'en_camino')
     ORDER BY created_at DESC LIMIT 1`,
    [telefono]
  );
  if (res.rows.length === 0) return null;
  const itemsRes = await query(
    `SELECT * FROM pedido_items WHERE pedido_id = $1`,
    [res.rows[0].id]
  );
  return mapRowToOrder(res.rows[0], itemsRes.rows);
}

async function findLastDeliveryAddress(telefono) {
  if (!telefono) return null;
  try {
    const res = await query(
      `SELECT direccion FROM pedidos 
       WHERE (session_id = $1 OR telefono = $1)
         AND estado = 'entregado'
         AND tipo_entrega = 'delivery'
       ORDER BY created_at DESC LIMIT 1`,
      [telefono]
    );
    if (res.rows.length === 0) return null;
    return res.rows[0].direccion || null;
  } catch (err) {
    console.warn('[orderService] findLastDeliveryAddress error:', err.message);
    return null;
  }
}

async function saveOrder(orderData) {
  const existing = await findExistingOrder(orderData.sessionId);
  if (existing) return existing;

  validateOrder(orderData);

  const costoEnvio = orderData.tipo_entrega === 'delivery' ? COSTO_ENVIO : 0;
  const subtotal = orderData.productos.reduce(
    (sum, p) => sum + p.precio_unitario * p.cantidad,
    0
  );
  const total = subtotal + costoEnvio;
  const id = randomUUID();
  const estado = buildEstado(orderData.metodo_pago);
  const restauranteId = orderData.restauranteId || 'urbano';

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const insertPedidoSql = `
      INSERT INTO pedidos (
        id, restaurante_id, cliente, telefono, jid, tipo_entrega,
        direccion, costo_envio, total, metodo_pago, estado, session_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *
    `;
    const pedidoRes = await client.query(insertPedidoSql, [
      id,
      restauranteId,
      orderData.cliente,
      orderData.telefono || null,
      orderData.jid || null,
      orderData.tipo_entrega,
      orderData.direccion,
      costoEnvio,
      total,
      orderData.metodo_pago,
      estado,
      orderData.sessionId,
    ]);

    const items = [];
    for (const p of orderData.productos) {
      const itemSubtotal = p.precio_unitario * p.cantidad;
      const itemRes = await client.query(
        `INSERT INTO pedido_items (pedido_id, nombre, cantidad, precio_unitario, opcion, subtotal)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [id, p.nombre, p.cantidad, p.precio_unitario, p.opcion || null, itemSubtotal]
      );
      items.push(itemRes.rows[0]);
    }

    await client.query('COMMIT');

    const nuevoPedido = mapRowToOrder(pedidoRes.rows[0], items);

    // Emite evento en tiempo real para todos los clientes SSE (app del chef)
    orderEvents.emit('order:created', { restauranteId, pedido: nuevoPedido });
    console.log(`[orderService] Pedido guardado en PostgreSQL id=${id} total=${total} estado=${estado}`);

    return nuevoPedido;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function getOrder(id) {
  const res = await query('SELECT * FROM pedidos WHERE id = $1', [id]);
  if (res.rows.length === 0) return null;
  const itemsRes = await query('SELECT * FROM pedido_items WHERE pedido_id = $1', [id]);
  return mapRowToOrder(res.rows[0], itemsRes.rows);
}

async function findPedidoPendientePago(sessionId) {
  if (!sessionId) return null;
  const res = await query(
    `SELECT * FROM pedidos 
     WHERE session_id = $1 AND estado = 'pendiente_pago'
     ORDER BY created_at DESC LIMIT 1`,
    [sessionId]
  );
  if (res.rows.length === 0) return null;
  const itemsRes = await query('SELECT * FROM pedido_items WHERE pedido_id = $1', [res.rows[0].id]);
  return mapRowToOrder(res.rows[0], itemsRes.rows);
}

async function attachComprobante(pedidoId, imageBuffer, mimeType = 'image/jpeg') {
  const ext = mimeType.includes('png') ? '.png' : '.jpg';
  const fileName = `comprobante_${pedidoId}_${Date.now()}${ext}`;
  const filePath = path.join(UPLOADS_DIR, fileName);

  await fs.promises.writeFile(filePath, imageBuffer);
  const comprobanteUrl = `/uploads/${fileName}`;

  const res = await query(
    `UPDATE pedidos 
     SET comprobante_url = $1, estado = 'pendiente', updated_at = NOW()
     WHERE id = $2 RETURNING *`,
    [comprobanteUrl, pedidoId]
  );

  if (res.rows.length > 0) {
    const updated = await getOrder(pedidoId);
    orderEvents.emit('order:updated', { restauranteId: updated.restauranteId, pedido: updated });
    console.log(`[orderService] Comprobante adjuntado para pedido ${pedidoId}: ${comprobanteUrl}`);
  }

  return comprobanteUrl;
}

async function solicitarCambioPedido({ pedidoId, descripcionCambio, tipo = 'modificacion', productosNuevos = null, datosEntrega = null }) {
  const pedido = await getOrder(pedidoId);
  if (!pedido) throw new Error('Pedido no encontrado');

  if (['en_camino', 'entregado', 'cancelado'].includes(pedido.estado)) {
    throw new Error(`El pedido ya está ${pedido.estado} y no puede modificarse. Debe realizarse como un nuevo pedido.`);
  }

  const esPendiente = ['pendiente', 'pendiente_pago'].includes(pedido.estado);

  if (esPendiente) {
    if (tipo === 'agregar_productos' && productosNuevos?.length > 0) {
      let subtotalExtra = 0;
      for (const p of productosNuevos) {
        const itemSubtotal = p.precio_unitario * p.cantidad;
        subtotalExtra += itemSubtotal;
        await query(
          `INSERT INTO pedido_items (pedido_id, nombre, cantidad, precio_unitario, opcion, subtotal)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [pedidoId, p.nombre, p.cantidad, p.precio_unitario, p.opcion || null, itemSubtotal]
        );
      }
      await query(
        `UPDATE pedidos SET total = total + $1, updated_at = NOW() WHERE id = $2`,
        [subtotalExtra, pedidoId]
      );
      const updated = await getOrder(pedidoId);
      orderEvents.emit('order:updated', { restauranteId: updated.restauranteId, pedido: updated });
      return { pedidoId, descripcionCambio, aplicadoDirectamente: true };
    }

    if (tipo === 'cambiar_entrega' && datosEntrega) {
      await query(
        `UPDATE pedidos 
         SET tipo_entrega = $1, direccion = $2, costo_envio = $3, total = $4, updated_at = NOW()
         WHERE id = $5`,
        [
          datosEntrega.tipo_entrega,
          datosEntrega.direccion || null,
          datosEntrega.costo_envio,
          datosEntrega.total_nuevo,
          pedidoId,
        ]
      );
      const updated = await getOrder(pedidoId);
      orderEvents.emit('order:updated', { restauranteId: updated.restauranteId, pedido: updated });
      return { pedidoId, descripcionCambio, aplicadoDirectamente: true };
    }
  }

  // Pedido ya confirmado: solicitar aprobación del chef
  let totalNuevo = null;
  if (tipo === 'agregar_productos' && productosNuevos?.length > 0) {
    const subtotalExtra = productosNuevos.reduce((sum, p) => sum + p.precio_unitario * p.cantidad, 0);
    totalNuevo = pedido.total + subtotalExtra;
  }

  const cambioSolicitado = {
    tipo,
    descripcion: descripcionCambio,
    productos_nuevos: productosNuevos,
    total_nuevo: totalNuevo,
    datos_entrega: tipo === 'cambiar_entrega' ? datosEntrega : null,
    estado: 'pendiente_chef',
    solicitadoAt: new Date().toISOString(),
  };

  await query(
    `UPDATE pedidos SET cambio_solicitado = $1, updated_at = NOW() WHERE id = $2`,
    [JSON.stringify(cambioSolicitado), pedidoId]
  );

  const updated = await getOrder(pedidoId);
  orderEvents.emit('order:updated', { restauranteId: updated.restauranteId, pedido: updated });
  return { pedidoId, descripcionCambio };
}

async function cancelarPedido({ pedidoId }) {
  const pedido = await getOrder(pedidoId);
  if (!pedido) throw new Error('Pedido no encontrado');

  const cancelable = ['pendiente', 'pendiente_pago'];
  if (!cancelable.includes(pedido.estado)) {
    throw new Error(`El pedido ya no puede cancelarse (estado: ${pedido.estado})`);
  }

  await query(
    `UPDATE pedidos SET estado = 'cancelado', updated_at = NOW() WHERE id = $1`,
    [pedidoId]
  );

  const updated = await getOrder(pedidoId);
  orderEvents.emit('order:cancelled', { restauranteId: updated.restauranteId, pedido: updated });
  return { pedidoId, cancelado: true };
}

async function consultarEstadoPedido({ pedidoId }) {
  const pedido = await getOrder(pedidoId);
  if (!pedido) throw new Error('Pedido no encontrado');
  return {
    pedidoId: pedido.id,
    estado: pedido.estado,
    cliente: pedido.cliente,
    productos: pedido.productos,
  };
}

const ESTADOS_LEGIBLES = {
  pendiente: 'pendiente de confirmación por el chef',
  pendiente_pago: 'pendiente — esperando confirmación de pago',
  confirmado: 'confirmado por el chef, en preparación',
  en_camino: 'en camino a tu dirección',
  entregado: 'entregado',
  cancelado: 'cancelado',
};

function estadoLegible(estado) {
  return ESTADOS_LEGIBLES[estado] ?? estado;
}

module.exports = {
  saveOrder,
  getOrder,
  findPedidoPendientePago,
  attachComprobante,
  solicitarCambioPedido,
  cancelarPedido,
  consultarEstadoPedido,
  estadoLegible,
  findActiveOrderByPhone,
  findLastDeliveryAddress,
};
