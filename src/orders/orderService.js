const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { query, pool } = require('../db/connection');
const { validateOrder } = require('./orderValidator');
const { orderEvents } = require('../services/orderEvents');
const { cleanPhoneNumber } = require('../utils/phoneUtils');

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
  // Solo deduplica pedidos creados en los últimos 60 segundos (ventana de idempotencia / doble mensaje)
  const res = await query(
    `SELECT * FROM pedidos 
     WHERE session_id = $1 
       AND estado IN ('pendiente', 'pendiente_pago')
       AND created_at >= NOW() - INTERVAL '60 seconds'
     ORDER BY created_at DESC LIMIT 1`,
    [sessionId]
  );
  if (res.rows.length === 0) return null;
  const itemsRes = await query(
    `SELECT * FROM pedido_items WHERE pedido_id = $1`,
    [res.rows[0].id]
  );
  const existing = mapRowToOrder(res.rows[0], itemsRes.rows);
  console.log(`[orderService] [IDEMPOTENCIA] Pedido existente reciente detectado id=${existing.id} (<60s)`);
  return existing;
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
  console.log(`[orderService] >>> Iniciando saveOrder para sessionId=${orderData.sessionId}...`);
  console.log(`[orderService] Datos crudos recibidos:`, JSON.stringify(orderData));

  // 1. Normalización defensiva de tipo_entrega
  let tipoEntrega = String(orderData.tipo_entrega || '').toLowerCase().trim();
  if (tipoEntrega.includes('deliv') || tipoEntrega.includes('domicil') || tipoEntrega.includes('envi') || tipoEntrega.includes('casa')) {
    tipoEntrega = 'delivery';
  } else if (tipoEntrega.includes('retir') || tipoEntrega.includes('llevar') || tipoEntrega.includes('recog') || tipoEntrega.includes('local')) {
    tipoEntrega = 'retiro';
  } else {
    tipoEntrega = (orderData.direccion && !orderData.direccion.toLowerCase().includes('retiro')) ? 'delivery' : 'retiro';
  }
  orderData.tipo_entrega = tipoEntrega;

  // 2. Normalización defensiva de dirección
  if (orderData.tipo_entrega === 'retiro') {
    if (!orderData.direccion || String(orderData.direccion).trim() === '') {
      orderData.direccion = 'Retiro en local';
    }
  }

  // 3. Normalización defensiva de método de pago
  let metodoPago = String(orderData.metodo_pago || '').toLowerCase().trim();
  if (metodoPago.includes('transf') || metodoPago.includes('banc') || metodoPago.includes('bac') || metodoPago.includes('depo')) {
    metodoPago = 'transferencia';
  } else {
    metodoPago = 'efectivo';
  }
  orderData.metodo_pago = metodoPago;

  // 4. Normalización defensiva de cliente
  if (!orderData.cliente || String(orderData.cliente).trim() === '') {
    orderData.cliente = 'Cliente';
  }

  // 5. Normalización defensiva de productos
  if (Array.isArray(orderData.productos)) {
    orderData.productos = orderData.productos.map((p) => {
      const cantidad = Math.max(1, parseInt(p.cantidad || 1, 10) || 1);
      const precioUnitario = parseFloat(p.precio_unitario ?? p.precio ?? p.unit_price ?? 0);
      return {
        nombre: String(p.nombre || 'Producto').trim(),
        cantidad,
        precio_unitario: isNaN(precioUnitario) ? 0 : precioUnitario,
        opcion: p.opcion || null,
      };
    });
  }

  // 6. Normalización y deduplicación defensiva de teléfono
  let tel = orderData.telefono || null;
  if (!tel && orderData.sessionId) {
    tel = cleanPhoneNumber(orderData.sessionId);
  }
  if (!tel && orderData.jid) {
    tel = cleanPhoneNumber(orderData.jid.split('@')[0]);
  }
  orderData.telefono = tel ? cleanPhoneNumber(tel, orderData.sessionId) : null;

  // 7. Calcular costo_envio y total ANTES de validar
  const costoEnvio = orderData.tipo_entrega === 'delivery' ? COSTO_ENVIO : 0;
  orderData.costo_envio = costoEnvio;
  const subtotal = (orderData.productos || []).reduce(
    (sum, p) => sum + (p.precio_unitario * p.cantidad),
    0
  );
  orderData.total = subtotal + costoEnvio;

  console.log(`[orderService] Datos normalizados: cliente="${orderData.cliente}", telefono="${orderData.telefono}", tipo="${orderData.tipo_entrega}", pago="${orderData.metodo_pago}", total=${orderData.total}, items=${orderData.productos?.length}`);

  // Verificar idempotencia (solo ventana de 60s)
  const existing = await findExistingOrder(orderData.sessionId);
  if (existing) {
    console.log(`[orderService] Pedido deduplicado retornado: id=${existing.id}`);
    return existing;
  }

  // Validación estricta
  try {
    validateOrder(orderData);
  } catch (valErr) {
    console.error(`[orderService] ❌ Error de validación en validateOrder: ${valErr.message}`);
    throw valErr;
  }

  const id = randomUUID();
  const estado = buildEstado(orderData.metodo_pago);
  const restauranteId = orderData.restauranteId || 'urbano';

  console.log(`[orderService] Conectando a PostgreSQL para insertar pedido id=${id}...`);
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
      orderData.total,
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
    console.log(`[orderService] ✅ COMMIT completado exitosamente en PostgreSQL id=${id} total=${orderData.total} items=${items.length}`);

    const nuevoPedido = mapRowToOrder(pedidoRes.rows[0], items);

    // Cachear mapeo de @lid con teléfono si corresponde
    if (orderData.jid && orderData.telefono && String(orderData.jid).includes('@lid')) {
      try {
        const { cacheLidMapping } = require('../whatsapp/lidResolver');
        cacheLidMapping(orderData.jid, orderData.telefono);
      } catch {}
    }

    // Emite evento en tiempo real para todos los clientes SSE (app del chef)
    orderEvents.emit('order:created', { restauranteId, pedido: nuevoPedido });
    console.log(`[orderService] 📡 Evento SSE order:created emitido para id=${id}`);

    // Disparar push notification al chef (Expo / móvil / app)
    try {
      const { enviarPushNuevoPedido } = require('../services/pushService');
      enviarPushNuevoPedido(restauranteId, nuevoPedido).catch((err) => {
        console.warn('[orderService] Error enviando push notification:', err.message);
      });
      console.log(`[orderService] 🔔 Push notification encolada para id=${id}`);
    } catch (_) {}

    return nuevoPedido;
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(`[orderService] ❌ ERROR en transacción PostgreSQL para pedido id=${id}: ${err.message}`, err.stack);
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

  const notif = { ...(pedido.notificaciones_enviadas || {}) };
  delete notif.cambio_aprobado;
  delete notif.cambio_rechazado;

  await query(
    `UPDATE pedidos SET cambio_solicitado = $1, notificaciones_enviadas = $2, updated_at = NOW() WHERE id = $3`,
    [JSON.stringify(cambioSolicitado), JSON.stringify(notif), pedidoId]
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
