const fs = require('fs');
const path = require('path');
const { chatCompletion } = require('../services/openaiService');
const { getRestauranteConfig, formatMenuForPrompt, getCuentasBancariasText } = require('../services/menuService');
const { getSession, addMessage, setLastOrderId, getLastOrderId, clearSession } = require('./sessionStore');
const { saveOrder, solicitarCambioPedido, cancelarPedido, consultarEstadoPedido, estadoLegible, findActiveOrderByPhone, findLastDeliveryAddress } = require('../orders/orderService');
const { log } = require('../utils/logger');
const { cleanPhoneNumber } = require('../utils/phoneUtils');

const PROMPT_TEMPLATE = fs.readFileSync(
  path.join(__dirname, '../../prompts/agent.txt'),
  'utf-8'
);

async function buildSystemPrompt(restauranteId, telefono, esRepartidor = false, activeOrder = null, lastAddress = null) {
  const config = await getRestauranteConfig(restauranteId);
  const menuText = await formatMenuForPrompt(restauranteId);
  const cuentasBancariasText = await getCuentasBancariasText(restauranteId);
  const cleanTel = cleanPhoneNumber(telefono);
  const telefonoContexto = cleanTel
    ? `El número de teléfono del cliente en este chat es: ${cleanTel}. Usa este único número en el campo 'telefono' al invocar guardar_pedido (salvo que el cliente indique expresamente otro número de contacto para la entrega). NUNCA repitas, concatenes ni dupliques números telefónicos.`
    : 'No tienes el número de teléfono del cliente. Si el pedido es DELIVERY, pídelo. Si es RETIRO EN LOCAL, no lo necesitas — omite el campo telefono al guardar el pedido.';

  const contextoRepartidor = esRepartidor
    ? `\n## MODO REPARTIDOR\nEste chat proviene de un REPARTIDOR (moto/mandado) que pasa a retirar el pedido en el local, NO de un cliente final.\n\nComportamiento obligatorio:\n- NO preguntes nombre, dirección ni método de pago — no son necesarios.\n- Saluda brevemente y pide directamente qué quieren ordenar.\n- Al confirmar el pedido, usa siempre tipo_entrega: "retiro", direccion: "Retiro repartidor", cliente: "Repartidor", metodo_pago: "efectivo".\n- Después de guardar responde EXACTAMENTE: "✅ ¡Pedido recibido! Ya le avisamos al chef. Te notificamos aquí cuando esté listo para retirar. 🍔"\n- La consulta de estado y cancelación aplican igual que normalmente.`
    : '';

  let contextoPedidoActivo = '';
  if (activeOrder) {
    const productos = (activeOrder.productos || [])
      .map(p => `${p.cantidad}x ${p.nombre}`).join(', ');

    if (activeOrder.estado === 'en_camino') {
      contextoPedidoActivo = `\n## 🛵 PEDIDO EN CAMINO / DESPACHADO
Este cliente tiene un pedido que YA VA EN CAMINO hacia su dirección (o listo para retiro):
- Productos despachados: ${productos}
- Total: ${activeOrder.total} ${activeOrder.moneda || 'C$'}
- Tipo entrega: ${activeOrder.tipo_entrega}${activeOrder.direccion ? `\n- Dirección: ${activeOrder.direccion}` : ''}

**REGLAS OBLIGATORIAS para pedidos en camino:**
1. Este pedido YA SALIÓ del restaurante y NO SE PUEDE MODIFICAR NI CANCELAR, ni se le pueden agregar productos.
2. Si el cliente responde con agradecimientos o cortesía ("gracias", "muchas gracias", "dale", "ok", "bueno", "excelente", etc.):
   - Responde de forma breve y amable (ej: "¡Con gusto! Que lo disfrutes mucho 🍔"). NO inicies un pedido nuevo por simples cortesías.
3. Si el cliente pide MODIFICACIONES, CAMBIOS o AGREGAR PRODUCTOS (ej: "quiero agregar...", "cámbiame...", "mándame también...", "quiero una hamburguesa"):
   - A partir de este momento, cualquier cambio o adición se toma como un **PEDIDO NUEVO**.
   - Infórmale amablemente que su pedido anterior ya va en camino y procede a tomar esto inmediatamente como un nuevo pedido con el menú y precios correspondientes.
   - NUNCA uses solicitar_cambio_pedido ni cancelar_pedido para este cliente porque ese pedido ya está en camino. Al confirmar, guarda el nuevo pedido con guardar_pedido normalmente.
4. Si el cliente pregunta por el estado de su pedido ("¿dónde viene?", "¿cuánto falta?"):
   - Confírmale que ya va en camino hacia su dirección.`;
    } else {
      contextoPedidoActivo = `\n## ⚠️ PEDIDO ACTIVO EN COCINA — LEE ESTO ANTES DE RESPONDER
Este cliente tiene un pedido activo en cocina que aún NO ha sido despachado:
- Estado: ${estadoLegible(activeOrder.estado)}
- Productos: ${productos}
- Total: ${activeOrder.total} ${activeOrder.moneda || 'C$'}
- Tipo entrega: ${activeOrder.tipo_entrega}${activeOrder.direccion ? `\n- Dirección: ${activeOrder.direccion}` : ''}

**REGLAS OBLIGATORIAS cuando hay pedido activo en cocina:**
1. NUNCA inicies un nuevo pedido automáticamente — ni siquiera si el cliente saluda o pide algo nuevo.
2. Si el cliente saluda ("hola", "buenas", etc.), responde con saludo + mención del pedido activo.
3. Si el cliente pide productos nuevos o quiere agregar algo, PREGUNTA PRIMERO: "¿Quieres agregar esto a tu pedido actual, o es un pedido nuevo aparte?"
   - Si es para el pedido actual → usa solicitar_cambio_pedido con tipo "agregar_productos".
   - Si es un pedido nuevo → solo entonces toma un nuevo pedido normalmente.
4. Ofrece las opciones disponibles: consultar estado, solicitar cambio, agregar productos, o cancelar.
5. Estas reglas tienen PRIORIDAD sobre las reglas de saludo y flujo de pedido de las secciones anteriores.`;
    }
  }

  let contextoDireccion = '';
  if (lastAddress && !esRepartidor) {
    contextoDireccion = `\n## DIRECCIÓN ANTERIOR\nLa última dirección de entrega de este cliente fue: "${lastAddress}".\nCuando pida delivery, ofrece: "¿Te lo enviamos a ${lastAddress} como la última vez, o a otra dirección?"\nSi confirma, usa esa dirección. Si da una nueva, usa la nueva.`;
  }

  return PROMPT_TEMPLATE
    .replace(/{{NOMBRE_RESTAURANTE}}/g, config.nombre)
    .replace(/{{MONEDA}}/g, config.moneda)
    .replace(/{{DIRECCION_RESTAURANTE}}/g, config.direccion || 'De rest Mi Rancho 10 vrs al sur, casa naranja, sin rótulo de momento')
    .replace(/{{DEPARTAMENTO_RESTAURANTE}}/g, config.departamento || 'Jinotega')
    .replace('{{MENU}}', menuText)
    .replace('{{CUENTAS_BANCARIAS}}', cuentasBancariasText)
    .replace('{{CONTEXTO_TELEFONO}}', telefonoContexto)
    .replace('{{CONTEXTO_REPARTIDOR}}', contextoRepartidor)
    .replace('{{CONTEXTO_PEDIDO_ACTIVO}}', contextoPedidoActivo)
    .replace('{{CONTEXTO_DIRECCION}}', contextoDireccion);
}

/**
 * Removes incomplete tool_call sequences from a message history before sending to OpenAI.
 * Prevents "tool_calls without response" 400 errors caused by orphaned tool_call messages.
 */
function sanitizeMessages(messages) {
  const result = [];
  let i = 0;
  while (i < messages.length) {
    const msg = messages[i];
    if (msg.role === 'assistant' && Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0) {
      const requiredIds = new Set(msg.tool_calls.map(tc => tc.id));
      const toolResponses = [];
      let j = i + 1;
      while (j < messages.length && messages[j].role === 'tool') {
        if (requiredIds.has(messages[j].tool_call_id)) {
          toolResponses.push(messages[j]);
          requiredIds.delete(messages[j].tool_call_id);
        }
        j++;
      }
      if (requiredIds.size === 0) {
        // All tool_calls have responses — include the full block
        result.push(msg, ...toolResponses);
      }
      // Else: incomplete block (orphaned tool_calls) — skip it entirely
      i = j;
    } else if (msg.role === 'tool') {
      // Orphaned tool response with no preceding tool_calls — skip
      i++;
    } else {
      result.push(msg);
      i++;
    }
  }
  return result;
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
    if (!activeOrder && telefono) {
      // El pedido rastreado ya no está activo (entregado/cancelado externamente) — resetear sesión
      clearSession(sessionId);
      log(`[agentService] Sesión limpiada — pedido ya no está activo (entregado o cancelado)`);
    }
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
    messages: sanitizeMessages([...history, { role: 'user', content: message }]),
    tools: true,
  });

  // Handle function calls
  if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
    const toolCall = assistantMessage.tool_calls[0];

    // --- guardar_pedido ---
    if (toolCall.function.name === 'guardar_pedido') {
      let toolResult;
      let savedOrder = null;
      let esNuevo = false;

      try {
        const orderArgs = JSON.parse(toolCall.function.arguments);
        const prevOrderId = getLastOrderId(sessionId);
        const rawTelefono = orderArgs.telefono || telefono || null;
        const telefonoFinal = cleanPhoneNumber(rawTelefono, telefono);
        savedOrder = await saveOrder({
          ...orderArgs,
          telefono: telefonoFinal,
          restauranteId,
          sessionId,
          moneda: config.moneda,
          jid: remoteJid, // JID real para notificaciones WhatsApp
        });
        esNuevo = !prevOrderId || prevOrderId !== savedOrder.id;
        setLastOrderId(sessionId, savedOrder.id);
        log(`[PEDIDO] guardado id=${savedOrder.id} telefono=${telefono} esNuevo=${esNuevo}`);
        toolResult = JSON.stringify({ exito: true, pedidoId: savedOrder.id, esNuevo });
      } catch (err) {
        toolResult = JSON.stringify({ error: err.message });
      }

      addMessage(sessionId, assistantMessage);
      addMessage(sessionId, { role: 'tool', tool_call_id: toolCall.id, content: toolResult });
      // Respond to any extra tool_calls the model may have emitted (defensive)
      for (const extraCall of assistantMessage.tool_calls.slice(1)) {
        addMessage(sessionId, { role: 'tool', tool_call_id: extraCall.id, content: JSON.stringify({ error: 'Solo se procesa una herramienta a la vez.' }) });
      }

      // Pedido ya existía — el cliente confirmó de nuevo. No enviar otra "¡Pedido recibido!".
      if (!esNuevo) {
        return { reply: null, order: savedOrder };
      }

      let confirmReply = null;
      try {
        const confirmHistory = sanitizeMessages(getSession(sessionId));
        const confirmMessage = await chatCompletion({ systemPrompt, messages: confirmHistory, tools: false });
        confirmReply = confirmMessage.content;
      } catch (err) {
        log(`[agentService] Fallback en confirmación de pedido: ${err.message}`);
        const orderArgs = JSON.parse(toolCall.function.arguments);
        const nombre = orderArgs.cliente || 'amigo';
        if (orderArgs.tipo_entrega === 'delivery') {
          if (orderArgs.metodo_pago === 'transferencia') {
            confirmReply = `✅ *¡Pedido recibido!* Para completarlo, por favor envíanos el comprobante de pago por este chat 📸.\n\n¡Gracias, ${nombre}! 🍔`;
          } else {
            confirmReply = `✅ *¡Pedido recibido!* Tu orden fue enviada al chef. En cuanto sea confirmada te avisamos. ¡Gracias por ordenar con nosotros, ${nombre}! 🍔`;
          }
        } else {
          if (orderArgs.metodo_pago === 'transferencia') {
            confirmReply = `✅ *¡Pedido recibido!* Para completarlo, por favor envíanos el comprobante de pago por este chat 📸.\n\n¡Gracias, ${nombre}! 🍔`;
          } else {
            confirmReply = `✅ *¡Pedido recibido!* Tu orden fue enviada al chef. Te avisaremos por aquí cuando esté listo para que pases a retirarlo. ¡Gracias, ${nombre}! 🍔`;
          }
        }
      }

      addMessage(sessionId, { role: 'assistant', content: confirmReply });
      return { reply: confirmReply, order: savedOrder };
    }

    // --- solicitar_cambio_pedido ---
    if (toolCall.function.name === 'solicitar_cambio_pedido') {
      let toolResult;
      const pedidoId = getLastOrderId(sessionId);

      if (!pedidoId) {
        toolResult = JSON.stringify({ error: 'No hay pedido activo en esta sesión.' });
      } else {
        try {
          const { descripcion_cambio, tipo, productos_nuevos, datos_entrega } = JSON.parse(toolCall.function.arguments);
          const resultado = await solicitarCambioPedido({
            pedidoId,
            descripcionCambio: descripcion_cambio,
            tipo: tipo ?? 'modificacion',
            productosNuevos: productos_nuevos ?? null,
            datosEntrega: datos_entrega ?? null,
          });
          toolResult = JSON.stringify({
            exito: true,
            pedidoId,
            aplicadoDirectamente: resultado.aplicadoDirectamente ?? false,
          });
        } catch (err) {
          toolResult = JSON.stringify({ error: err.message });
        }
      }

      addMessage(sessionId, assistantMessage);
      addMessage(sessionId, { role: 'tool', tool_call_id: toolCall.id, content: toolResult });
      for (const extraCall of assistantMessage.tool_calls.slice(1)) {
        addMessage(sessionId, { role: 'tool', tool_call_id: extraCall.id, content: JSON.stringify({ error: 'Solo se procesa una herramienta a la vez.' }) });
      }

      let changeReply = null;
      try {
        const changeHistory = sanitizeMessages(getSession(sessionId));
        const changeMessage = await chatCompletion({ systemPrompt, messages: changeHistory, tools: false });
        changeReply = changeMessage.content;
      } catch (err) {
        log(`[agentService] Fallback en cambio de pedido: ${err.message}`);
        changeReply = '📨 Tu solicitud de cambio fue enviada al chef. Te notificaremos cuando responda.';
      }

      addMessage(sessionId, { role: 'assistant', content: changeReply });
      return { reply: changeReply, order: null };
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
      for (const extraCall of assistantMessage.tool_calls.slice(1)) {
        addMessage(sessionId, { role: 'tool', tool_call_id: extraCall.id, content: JSON.stringify({ error: 'Solo se procesa una herramienta a la vez.' }) });
      }

      const cancelHistory = sanitizeMessages(getSession(sessionId));
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
      for (const extraCall of assistantMessage.tool_calls.slice(1)) {
        addMessage(sessionId, { role: 'tool', tool_call_id: extraCall.id, content: JSON.stringify({ error: 'Solo se procesa una herramienta a la vez.' }) });
      }

      const statusHistory = sanitizeMessages(getSession(sessionId));
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
