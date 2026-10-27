const { query } = require('../db/connection');

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

/**
 * Envía una notificación push a todos los dispositivos registrados del chef/restaurante via Expo Push API.
 * Los tokens se guardan en PostgreSQL bajo restaurantes.push_tokens (JSONB array).
 *
 * Failsafe: nunca lanza excepción para no bloquear el flujo del pedido.
 */
async function enviarPushAlChef(restauranteId, titulo, cuerpo, data = {}) {
  try {
    const res = await query('SELECT push_tokens FROM restaurantes WHERE id = $1', [restauranteId]);
    if (res.rows.length === 0 || !res.rows[0].push_tokens) return;

    let tokens = res.rows[0].push_tokens;
    if (typeof tokens === 'string') {
      try {
        tokens = JSON.parse(tokens);
      } catch (_) {
        tokens = [tokens];
      }
    }
    if (!Array.isArray(tokens) || tokens.length === 0) return;

    // Filtrar tokens válidos de Expo
    const validTokens = tokens.filter(
      (t) => typeof t === 'string' && (t.startsWith('ExponentPushToken[') || t.startsWith('ExpoPushToken['))
    );

    if (validTokens.length === 0) return;

    const messages = validTokens.map((token) => ({
      to: token,
      title: titulo,
      body: cuerpo,
      sound: 'default',
      priority: 'high',
      channelId: 'pedidos',
      data: { ...data, timestamp: new Date().toISOString() },
    }));

    const response = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip, deflate',
      },
      body: JSON.stringify(messages),
    });

    const json = await response.json();
    const tickets = Array.isArray(json.data) ? json.data : [json.data];
    const staleTokens = new Set();

    tickets.forEach((ticket, idx) => {
      if (ticket && ticket.status === 'error') {
        const errCode = ticket.details?.error;
        console.warn(`[pushService] Error en ticket Expo (${validTokens[idx]}):`, ticket.message, errCode);
        if (errCode === 'DeviceNotRegistered') {
          staleTokens.add(validTokens[idx]);
        }
      }
    });

    // Limpiar tokens obsoletos en PostgreSQL si algún dispositivo se desinstaló
    if (staleTokens.size > 0) {
      const activeTokens = tokens.filter((t) => !staleTokens.has(t));
      await query(
        'UPDATE restaurantes SET push_tokens = $1, updated_at = NOW() WHERE id = $2',
        [JSON.stringify(activeTokens), restauranteId]
      );
      console.log(`[pushService] Eliminados ${staleTokens.size} tokens obsoletos para ${restauranteId}`);
    }

    console.log(`[pushService] Push enviado a ${validTokens.length} dispositivo(s) para restaurante ${restauranteId}: "${titulo}"`);
  } catch (err) {
    console.warn('[pushService] Error enviando push notification:', err.message);
  }
}

/**
 * Notifica específicamente la llegada de una nueva comanda al chef.
 */
async function enviarPushNuevoPedido(restauranteId, pedido) {
  if (!pedido) return;

  const idCorto = (pedido.id || '').slice(-6).toUpperCase();
  const titulo = `🍔 ¡Nuevo Pedido #${idCorto}!`;

  const tipo = pedido.tipo_entrega === 'delivery' ? 'Delivery 🛵' : 'Retiro en sucursal 🏪';
  const total = pedido.total ? `C$${pedido.total}` : '';
  const cliente = pedido.cliente || 'Cliente';

  const resumenProductos = (pedido.productos || [])
    .map((p) => `${p.cantidad}× ${p.nombre}`)
    .slice(0, 3)
    .join(', ');

  const cuerpo = `${cliente} — ${total} (${tipo})\n${resumenProductos}`;

  await enviarPushAlChef(restauranteId, titulo, cuerpo, {
    pedidoId: pedido.id,
    tipo: 'nuevo_pedido',
  });
}

module.exports = {
  enviarPushAlChef,
  enviarPushNuevoPedido,
};
