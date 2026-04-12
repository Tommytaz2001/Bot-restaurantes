const fs = require('fs');
const path = require('path');
const { chatCompletion } = require('../services/openaiService');
const { getRestauranteConfig, formatMenuForPrompt, getCuentasBancariasText } = require('../services/menuService');
const { getSession, addMessage, setLastOrderId, getLastOrderId, clearSession } = require('./sessionStore');
const { saveOrder, solicitarCambioPedido, cancelarPedido, consultarEstadoPedido, estadoLegible, findActiveOrderByPhone, findLastDeliveryAddress } = require('../orders/orderService');
const { log } = require('../utils/logger');

const PROMPT_TEMPLATE = fs.readFileSync(
  path.join(__dirname, '../../prompts/agent.txt'),
  'utf-8'
);

async function buildSystemPrompt(restauranteId, telefono, esRepartidor = false, activeOrder = null, lastAddress = null) {
  const config = await getRestauranteConfig(restauranteId);
  const menuText = await formatMenuForPrompt(restauranteId);
  const cuentasBancariasText = await getCuentasBancariasText(restauranteId);
  const telefonoContexto = telefono
    ? `El número de teléfono del cliente es: ${telefono}. No necesitas pedírselo.`
    : 'No tienes el número de teléfono del cliente. Pídelo durante el proceso de pedido.';

  const contextoRepartidor = esRepartidor
    ? `\n## MODO REPARTIDOR\nEste chat proviene de un REPARTIDOR (moto/mandado) que pasa a retirar el pedido en el local, NO de un cliente final.\n\nComportamiento obligatorio:\n- NO preguntes nombre, dirección ni método de pago — no son necesarios.\n- Saluda brevemente y pide directamente qué quieren ordenar.\n- Al confirmar el pedido, usa siempre tipo_entrega: "retiro", direccion: "Retiro repartidor", cliente: "Repartidor", metodo_pago: "efectivo".\n- Después de guardar responde EXACTAMENTE: "✅ ¡Pedido recibido! Ya le avisamos al chef. Te notificamos aquí cuando esté listo para retirar. 🍔"\n- La consulta de estado y cancelación aplican igual que normalmente.`
    : '';

  let contextoPedidoActivo = '';
  if (activeOrder) {
    const productos = (activeOrder.productos || [])
      .map(p => `${p.cantidad}x ${p.nombre}`).join(', ');
    contextoPedidoActivo = `\n## PEDIDO ACTIVO\nEste cliente tiene un pedido activo.\n- Estado: ${estadoLegible(activeOrder.estado)}\n- Productos: ${productos}\n- Total: ${activeOrder.total} ${activeOrder.moneda || 'C$'}\n- Tipo entrega: ${activeOrder.tipo_entrega}\n\nNO inicies un nuevo pedido. Ofrece ayuda con su pedido actual (consultar estado, solicitar cambio, cancelar) o pregunta si desea hacer un pedido ADICIONAL separado.`;
  }

  let contextoDireccion = '';
  if (lastAddress && !esRepartidor) {
    contextoDireccion = `\n## DIRECCIÓN ANTERIOR\nLa última dirección de entrega de este cliente fue: "${lastAddress}".\nCuando pida delivery, ofrece: "¿Te lo enviamos a ${lastAddress} como la última vez, o a otra dirección?"\nSi confirma, usa esa dirección. Si da una nueva, usa la nueva.`;
  }

  return PROMPT_TEMPLATE
    .replace(/{{NOMBRE_RESTAURANTE}}/g, config.nombre)
    .replace(/{{MONEDA}}/g, config.moneda)
    .replace('{{MENU}}', menuText)
    .replace('{{CUENTAS_BANCARIAS}}', cuentasBancariasText)
    .replace('{{CONTEXTO_TELEFONO}}', telefonoContexto)
    .replace('{{CONTEXTO_REPARTIDOR}}', contextoRepartidor)
    .replace('{{CONTEXTO_PEDIDO_ACTIVO}}', contextoPedidoActivo)
    .replace('{{CONTEXTO_DIRECCION}}', contextoDireccion);
}

async function processMessage({ message, sessionId, restauranteId, telefono, remoteJid, esRepartidor = false }) {
  // Throws 'Restaurante no encontrado' if restauranteId is invalid
  const config = await getRestauranteConfig(restauranteId);

  // Rehidratar contexto de pedido activo si la sesión en memoria expiró
  let activeOrder = null;
  if (!getLastOrderId(sessionId) && telefono) {
    activeOrder = await findActiveOrderByPhone(telefono);
    if (activeOrder) {
      setLastOrderId(sessionId, activeOrder.id);
      log(`[agentService] Pedido activo recuperado de Firestore: ${activeOrder.id} (${activeOrder.estado})`);
    }
  } else if (getLastOrderId(sessionId)) {
    activeOrder = await findActiveOrderByPhone(telefono);
  }

  // Buscar dirección anterior para clientes frecuentes
  const lastAddress = telefono ? await findLastDeliveryAddress(telefono) : null;

  const systemPrompt = await buildSystemPrompt(restauranteId, telefono, esRepartidor, activeOrder, lastAddress);

  // Capture history BEFORE addMessage to avoid duplication when spreading
  const history = getSession(sessionId);

  // Add user message to history
  addMessage(sessionId, { role: 'user', content: message });

  const assistantMessage = await chatCompletion({
    systemPrompt,
    messages: [...history, { role: 'user', content: message }],
    tools: true,
  });

  // Handle function calls
  if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
    const toolCall = assistantMessage.tool_calls[0];

    // --- guardar_pedido ---
    if (toolCall.function.name === 'guardar_pedido') {
      let toolResult;
      let savedOrder = null;

      try {
        const orderArgs = JSON.parse(toolCall.function.arguments);
        savedOrder = await saveOrder({
          ...orderArgs,
          restauranteId,
          sessionId,
          moneda: config.moneda,
          jid: remoteJid, // JID real para notificaciones WhatsApp
        });
        setLastOrderId(sessionId, savedOrder.id);
        log(`[PEDIDO] guardado id=${savedOrder.id} telefono=${telefono}`);
        toolResult = JSON.stringify({ exito: true, pedidoId: savedOrder.id });
      } catch (err) {
        toolResult = JSON.stringify({ error: err.message });
      }

      addMessage(sessionId, assistantMessage);
      addMessage(sessionId, { role: 'tool', tool_call_id: toolCall.id, content: toolResult });

      const confirmHistory = getSession(sessionId);
      const confirmMessage = await chatCompletion({ systemPrompt, messages: confirmHistory, tools: false });
      addMessage(sessionId, { role: 'assistant', content: confirmMessage.content });

      return { reply: confirmMessage.content, order: savedOrder };
    }

    // --- solicitar_cambio_pedido ---
    if (toolCall.function.name === 'solicitar_cambio_pedido') {
      let toolResult;
      const pedidoId = getLastOrderId(sessionId);

      if (!pedidoId) {
        toolResult = JSON.stringify({ error: 'No hay pedido activo en esta sesión.' });
      } else {
        try {
          const { descripcion_cambio, tipo, productos_nuevos } = JSON.parse(toolCall.function.arguments);
          await solicitarCambioPedido({
            pedidoId,
            descripcionCambio: descripcion_cambio,
            tipo: tipo ?? 'modificacion',
            productosNuevos: productos_nuevos ?? null,
          });
          toolResult = JSON.stringify({ exito: true, pedidoId });
        } catch (err) {
          toolResult = JSON.stringify({ error: err.message });
        }
      }

      addMessage(sessionId, assistantMessage);
      addMessage(sessionId, { role: 'tool', tool_call_id: toolCall.id, content: toolResult });

      const changeHistory = getSession(sessionId);
      const changeMessage = await chatCompletion({ systemPrompt, messages: changeHistory, tools: false });
      addMessage(sessionId, { role: 'assistant', content: changeMessage.content });

      return { reply: changeMessage.content, order: null };
    }

    // --- cancelar_pedido ---
    if (toolCall.function.name === 'cancelar_pedido') {
      let toolResult;
      const pedidoId = getLastOrderId(sessionId);

      if (!pedidoId) {
        toolResult = JSON.stringify({ error: 'No hay pedido activo en esta sesión.' });
      } else {
        try {
          await cancelarPedido({ pedidoId });
          clearSession(sessionId);
          toolResult = JSON.stringify({ exito: true, pedidoId });
        } catch (err) {
          toolResult = JSON.stringify({ error: err.message });
        }
      }

      addMessage(sessionId, assistantMessage);
      addMessage(sessionId, { role: 'tool', tool_call_id: toolCall.id, content: toolResult });

      const cancelHistory = getSession(sessionId);
      const cancelMessage = await chatCompletion({ systemPrompt, messages: cancelHistory, tools: false });
      // Session was cleared on success; we don't re-add messages to a dead session

      return { reply: cancelMessage.content, order: null };
    }

    // --- consultar_estado_pedido ---
    if (toolCall.function.name === 'consultar_estado_pedido') {
      let toolResult;
      let shouldResetSession = false;
      const pedidoId = getLastOrderId(sessionId);

      if (!pedidoId) {
        toolResult = JSON.stringify({ error: 'No hay pedido activo en esta sesión.' });
      } else {
        try {
          const { estado, cliente, productos } = await consultarEstadoPedido({ pedidoId });
          const legible = estadoLegible(estado);
          toolResult = JSON.stringify({ estado, legible, cliente, cantidadProductos: productos?.length });
          shouldResetSession = ['en_camino', 'entregado'].includes(estado);
        } catch (err) {
          toolResult = JSON.stringify({ error: err.message });
        }
      }

      addMessage(sessionId, assistantMessage);
      addMessage(sessionId, { role: 'tool', tool_call_id: toolCall.id, content: toolResult });

      const statusHistory = getSession(sessionId);
      const statusMessage = await chatCompletion({ systemPrompt, messages: statusHistory, tools: false });
      addMessage(sessionId, { role: 'assistant', content: statusMessage.content });

      if (shouldResetSession) {
        clearSession(sessionId);
      }

      return { reply: statusMessage.content, order: null };
    }
  }

  // Normal response — no function call
  addMessage(sessionId, { role: 'assistant', content: assistantMessage.content });
  return { reply: assistantMessage.content, order: null };
}

module.exports = { processMessage };
