const fs = require('fs');
const path = require('path');
const { chatCompletion } = require('../services/openaiService');
const { getRestauranteConfig, formatMenuForPrompt, getCuentasBancariasText } = require('../services/menuService');
const { getSession, addMessage, setLastOrderId, getLastOrderId, clearSession } = require('./sessionStore');
const { saveOrder, solicitarCambioPedido, cancelarPedido, consultarEstadoPedido, estadoLegible, findActiveOrderByPhone, findLastDeliveryAddress } = require('../orders/orderService');
const { log } = require('../utils/logger');
const { cleanPhoneNumber, isAdminOrOwnerPhone, cleanContactName, isPlaceholderAddress } = require('../utils/phoneUtils');

const PROMPT_TEMPLATE = fs.readFileSync(
  path.join(__dirname, '../../prompts/agent.txt'),
  'utf-8'
);

const NAME_QUESTION_REGEX = /(a\s*qu[eé]\s*nombre|nombre\s*completo|tu\s*nombre|su\s*nombre|cu[aá]l\s*es\s*tu\s*nombre|c[oó]mo\s*te\s*llamas|br[ií]ndame\s*tu\s*nombre|ind[ií]came\s*tu\s*nombre)/i;

function esPreguntaActivaNombre(content) {
  if (!content || typeof content !== 'string') return false;
  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    // Descartar si es una viñeta pasiva de lista de requisitos (ej: "• Nombre completo", "- Nombre completo", "* Nombre completo", "1. Nombre completo")
    if (/^[•\-*\d.]+\s*(nombre\s*completo|tu\s*nombre|su\s*nombre)/i.test(trimmed)) {
      continue;
    }
    if (NAME_QUESTION_REGEX.test(trimmed)) {
      return true;
    }
  }
  return false;
}

function contarPreguntasNombre(history) {
  if (!Array.isArray(history)) return 0;
  return history.filter(m => m && m.role === 'assistant' && esPreguntaActivaNombre(m.content)).length;
}

const SUMMARY_REGEX = /📋\s*\*?Resumen\s*de\s*tu\s*pedido:\*?/i;
const DELIVERY_SUMMARY_LINE_REGEX = /📍\s*\*?Entrega:\*?\s*([^\n\r]+)/i;

function contieneResumenConDireccionPlaceholder(content) {
  if (!content || typeof content !== 'string') return false;
  if (!SUMMARY_REGEX.test(content)) return false;
  const match = content.match(DELIVERY_SUMMARY_LINE_REGEX);
  if (!match) return false;
  const direccionExtraida = match[1].trim();
  return isPlaceholderAddress(direccionExtraida);
}

const REDUNDANT_DELIVERY_QUESTION_REGEX = /(a\s*domicilio\s*🛵?\s*o\s*prefieres\s*pasar\s*a\s*retirar|pasar\s*a\s*retirar.*o.*a\s*domicilio|domicilio\s*🛵?\s*o\s*retiro)/i;

function haDefinidoTipoEntregaEnHistorial(history) {
  if (!Array.isArray(history)) return null;
  for (const m of history) {
    const text = (m.content || '').toLowerCase();
    if (m.role === 'user') {
      if (/\b(a\s*domicilio|delivery|env[ií]am[eo]|m[aá]ndam[eo]|para\s*env[ií]o|para\s*delivery)\b/i.test(text)) {
        return 'delivery';
      }
      if (/\b(retiro|para\s*llevar|paso\s*a\s*recoger|lo\s*recojo|voy\s*al\s*local|para\s*retirar)\b/i.test(text)) {
        return 'retiro';
      }
    } else if (m.role === 'assistant') {
      if (/ya\s*anot[eé]\s*tu\s*(pedido\s*a\s*domicilio|direcci[oó]n\s*para\s*el\s*delivery)/i.test(text)) {
        return 'delivery';
      }
      if (/ya\s*anot[eé]\s*tu\s*pedido\s*para\s*retiro/i.test(text)) {
        return 'retiro';
      }
    }
  }
  return null;
}

function sanearPreguntaRedundanteEntrega(content, tipoEntrega) {
  const match = (content || '').match(/^(¡[^!]+!\s*(?:🍔|🌭|🥤|🌮)?)/i);
  const prefijo = match ? match[1].trim() : '¡Perfecto! 🍔';

  // Si el prefijo contiene un producto (ej: "1 hamburguesa", "1 burrito", "2 tacos", etc.)
  const tieneProducto = /\b(\d+\s*(?:hamburguesa|cl[aá]sica|premium|burrito|tacos?|nachos?|quesadilla|hot\s*dog|papas?|combo))\b/i.test(prefijo);

  if (tieneProducto) {
    return `${prefijo} ¿Cómo prefieres realizar tu pago: en efectivo 💵 o por transferencia bancaria 🏦?`;
  } else {
    const textoEntrega = tipoEntrega === 'delivery' ? ' para el delivery 🛵' : ' para retiro en el local 🏪';
    return `${prefijo} Ya tengo registrada tu entrega${textoEntrega}. ¿Qué te gustaría ordenar hoy del menú? 🍔`;
  }
}

async function buildSystemPrompt(restauranteId, telefono, activeOrder = null, lastAddress = null, contactName = null, vecesPreguntadoNombre = 0) {
  const config = await getRestauranteConfig(restauranteId);
  const menuText = await formatMenuForPrompt(restauranteId);
  const cuentasBancariasText = await getCuentasBancariasText(restauranteId);
  const cleanTel = (!isAdminOrOwnerPhone(telefono)) ? cleanPhoneNumber(telefono) : null;
  const telefonoContexto = cleanTel
    ? `El número de teléfono del cliente en este chat es: ${cleanTel}. Usa este único número en el campo 'telefono' al invocar guardar_pedido (salvo que el cliente indique expresamente otro número de contacto para la entrega). NUNCA repitas, concatenes ni dupliques números telefónicos.`
    : `NO TIENES el número de teléfono del cliente en este chat (contacto con número privado o @lid).
- Si el pedido es RETIRO EN LOCAL: no necesitas pedir su número de teléfono. Omite el campo 'telefono' al guardar el pedido.
- Si el pedido es DELIVERY: ES ESTRICTAMENTE OBLIGATORIO que le pidas su número de teléfono de contacto para el repartidor ("¿Me podrías brindar un número de teléfono de contacto para que el repartidor te llame al llegar?"). NUNCA inventes números ni uses números del restaurante. Si el cliente no te da su teléfono de contacto, NO muestres el resumen y pídelo antes de proceder.`;

  const cleanContact = cleanContactName(contactName);
  let contextoCliente = '';
  if (cleanContact) {
    if (vecesPreguntadoNombre === 0) {
      contextoCliente = '\n## IDENTIDAD DEL CLIENTE\n' +
        '- Nombre del perfil de WhatsApp (SOLO RESPALDO / PLAN B): "' + cleanContact + '".\n' +
        '- ESTADO: Aún NO le has preguntado el nombre al cliente en este chat (0 preguntas previas).\n' +
        '- INSTRUCCIÓN OBLIGATORIA:\n' +
        '  1. DEBES preguntarle activamente su nombre completo en este mensaje ("¿A qué nombre completo dejamos la comanda?" o "¿A qué nombre dejamos tu pedido?").\n' +
        '  2. NUNCA asumas ni coloques el nombre de WhatsApp por adelantado en el resumen sin haberle preguntado primero al cliente.\n' +
        '  3. ESTÁ TERMINANTEMENTE PROHIBIDO mostrar el resumen del pedido en este turno si el cliente no ha dicho su nombre. Primero debes preguntárselo.';
    } else if (vecesPreguntadoNombre === 1) {
      contextoCliente = '\n## IDENTIDAD DEL CLIENTE\n' +
        '- Nombre del perfil de WhatsApp (SOLO RESPALDO / PLAN B): "' + cleanContact + '".\n' +
        '- ESTADO: Le has preguntado el nombre al cliente 1 SOLA VEZ y el cliente aún NO ha dicho su nombre.\n' +
        '- INSTRUCCIÓN OBLIGATORIA (SEGUNDA INSISTENCIA):\n' +
        '  1. DEBES INSISTIR POR SEGUNDA VEZ (2do intento) pidiéndole amablemente su nombre para la comanda ("Por favor, ¿a qué nombre dejamos la orden antes de continuar? 🙏").\n' +
        '  2. Si el cliente dio algún dato nuevo (como notas, salsas, etc.), confírmalo y añade la pregunta del nombre.\n' +
        '  3. ESTÁ TERMINANTEMENTE PROHIBIDO mostrar el resumen del pedido o utilizar el nombre de WhatsApp todavía. Debes insistir esta segunda vez.';
    } else {
      contextoCliente = '\n## IDENTIDAD DEL CLIENTE\n' +
        '- Nombre del perfil de WhatsApp (SOLO RESPALDO / PLAN B): "' + cleanContact + '".\n' +
        '- ESTADO: Ya le has preguntado su nombre al cliente 2 o más veces.\n' +
        '- INSTRUCCIÓN OBLIGATORIA:\n' +
        '  1. Si el cliente respondió indicando su nombre en el chat, USA el nombre que el cliente te dio.\n' +
        '  2. Si el cliente ignoró, evadió o no respondió el nombre tras haberle insistido 2 veces, AHORA SÍ puedes proceder al resumen utilizando como respaldo el nombre de WhatsApp ("' + cleanContact + '").\n' +
        '  3. NUNCA inventes nombres genéricos como "Cliente Urbano", "Cliente", "Amigo", etc.';
    }
  } else {
    if (vecesPreguntadoNombre === 0) {
      contextoCliente = '\n## IDENTIDAD DEL CLIENTE (DESCONOCIDA)\n' +
        '- NO TIENES el nombre del cliente en este chat.\n' +
        '- Es ESTRICTAMENTE OBLIGATORIO que le pidas su nombre completo ("¿A qué nombre completo dejamos tu pedido?") antes de mostrar el resumen o guardar el pedido.\n' +
        '- Si el cliente envía productos, dirección o pago pero no da su nombre, DEBES responder pidiéndole su nombre completo antes de mostrar el resumen.\n' +
        '- NUNCA inventes nombres genéricos como "Cliente Urbano", "Cliente", "Amigo", etc.';
    } else {
      contextoCliente = '\n## IDENTIDAD DEL CLIENTE (DESCONOCIDA - INSISTENCIA ' + (vecesPreguntadoNombre + 1) + ')\n' +
        '- NO TIENES el nombre del cliente en este chat y ya se lo preguntaste ' + vecesPreguntadoNombre + ' vez/veces.\n' +
        '- Si el cliente aún no te ha dado su nombre, vuelve a insistir amablemente ("Por favor, indícame tu nombre completo para poder enviar tu comanda al chef").\n' +
        '- NUNCA inventes nombres genéricos como "Cliente Urbano", "Cliente", "Amigo", etc.';
    }
  }

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

  let contextoDireccion = '\n## REGLA DE ENTREGA A DOMICILIO (DELIVERY)\n' +
    '- Si el pedido es a domicilio (delivery), es ESTRICTAMENTE OBLIGATORIO pedir y tener la DIRECCIÓN EXACTA de entrega antes de mostrar el resumen.\n' +
    '- ESTÁ TERMINANTEMENTE PROHIBIDO poner frases provisionales o sustitutas como "Dirección a domicilio (por favor confírmanos...)", "a domicilio" o "pendiente" en la línea de Entrega del resumen.\n' +
    '- Si el cliente no ha proporcionado una dirección física exacta con referencias claras, NO MUESTRES EL RESUMEN; pídele primero su dirección exacta.';
  if (lastAddress) {
    contextoDireccion += `\n\n## DIRECCIÓN ANTERIOR\nLa última dirección de entrega de este cliente fue: "${lastAddress}".\nCuando pida delivery, ofrece: "¿Te lo enviamos a ${lastAddress} como la última vez, o a otra dirección?"\nSi confirma, usa esa dirección. Si da una nueva, usa la nueva.`;
  }

  return PROMPT_TEMPLATE
    .replace(/{{NOMBRE_RESTAURANTE}}/g, config.nombre)
    .replace(/{{MONEDA}}/g, config.moneda)
    .replace(/{{DIRECCION_RESTAURANTE}}/g, config.direccion || 'De rest Mi Rancho 10 vrs al sur, casa naranja, sin rótulo de momento')
    .replace(/{{DEPARTAMENTO_RESTAURANTE}}/g, config.departamento || 'Jinotega')
    .replace('{{MENU}}', menuText)
    .replace('{{CUENTAS_BANCARIAS}}', cuentasBancariasText)
    .replace('{{CONTEXTO_TELEFONO}}', telefonoContexto)
    .replace('{{CONTEXTO_REPARTIDOR}}', '')
    .replace('{{CONTEXTO_CLIENTE}}', contextoCliente)
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

async function processMessage({ message, sessionId, restauranteId, telefono, remoteJid, contactName = null }) {
  if (telefono && isAdminOrOwnerPhone(telefono)) {
    log(`[agentService] Teléfono ${telefono} descartado por pertenecer al administrador/dueño`);
    telefono = null;
  }

  // Throws 'Restaurante no encontrado' if restauranteId is invalid
  const config = await getRestauranteConfig(restauranteId);

  // Rehidratar contexto de pedido activo si la sesión en memoria expiró
  let activeOrder = null;
  const currentOrderId = getLastOrderId(sessionId, remoteJid);
  if (!currentOrderId && (telefono || sessionId)) {
    activeOrder = await findActiveOrderByPhone(telefono, sessionId);
    if (activeOrder) {
      setLastOrderId(sessionId, activeOrder.id);
      if (remoteJid && remoteJid !== sessionId) setLastOrderId(remoteJid, activeOrder.id);
      log(`[agentService] Pedido activo recuperado de PostgreSQL: ${activeOrder.id} (${activeOrder.estado})`);
    }
  } else if (currentOrderId) {
    activeOrder = await findActiveOrderByPhone(telefono, sessionId);
    if (!activeOrder && telefono) {
      // El pedido rastreado ya no está activo (entregado/cancelado externamente) — resetear sesión
      clearSession(sessionId);
      log(`[agentService] Sesión limpiada — pedido ya no está activo (entregado o cancelado)`);
    }
  }

  // Buscar dirección anterior para clientes frecuentes
  const lastAddress = telefono ? await findLastDeliveryAddress(telefono) : null;

  // Capture history BEFORE addMessage to avoid duplication when spreading (soporta fallback por remoteJid para @lid)
  const history = getSession(sessionId, remoteJid);
  const vecesPreguntadoNombre = contarPreguntasNombre(history);

  const systemPrompt = await buildSystemPrompt(restauranteId, telefono, activeOrder, lastAddress, contactName, vecesPreguntadoNombre);

  // Add user message to history
  addMessage(sessionId, { role: 'user', content: message });

  log(`[agentService] Procesando mensaje de ${telefono || sessionId} (historial=${history.length}): "${message.substring(0, 70)}"`);

  let assistantMessage = await chatCompletion({
    systemPrompt,
    messages: sanitizeMessages([...history, { role: 'user', content: message }]),
    tools: true,
  });

  const hasToolCalls = Array.isArray(assistantMessage.tool_calls) && assistantMessage.tool_calls.length > 0;
  log(`[agentService] Respuesta AI para ${sessionId}: toolCalls=${hasToolCalls ? assistantMessage.tool_calls.map(tc => tc.function.name).join(', ') : 'NINGUNA'} | texto="${(assistantMessage.content || '').substring(0, 80)}"`);

  // --- INTERCEPTOR DE MISSED TOOL CALL EN CONFIRMACIÓN ---
  // Si el usuario confirmó el resumen pero el LLM devolvió solo texto sin tool_calls.
  // REGLA CRÍTICA ANTI-DUPLICADOS: Si ya existe un pedido activo en cocina (activeOrder o currentOrderId),
  // NUNCA ejecutar el interceptor para evitar duplicar pedidos ante mensajes de cortesía o dudas ("ok", "gracias", etc.)
  const hasActiveOrder = Boolean(activeOrder || getLastOrderId(sessionId, remoteJid));

  if (!hasToolCalls && !hasActiveOrder) {
    const lastAssistantMsg = [...history].reverse().find(m => m.role === 'assistant');
    const isSummaryPending = lastAssistantMsg && (
      lastAssistantMsg.content?.includes('Resumen de tu pedido') ||
      lastAssistantMsg.content?.includes('¿Está todo correcto?') ||
      lastAssistantMsg.content?.includes('Envía un "ok"') ||
      lastAssistantMsg.content?.includes('Envía un ok')
    ) && !lastAssistantMsg.content?.includes('¡Pedido recibido!') && !lastAssistantMsg.content?.includes('orden fue enviada al chef');

    const isUserConfirming = /^(ok|okay|okey|si|sí|dale|va|confirmo|confirmado|listo|correcto|todo bien|procede|adelante|simon|simón|va pues|porfa|bueno|perfecto|así es|exacto|sale|manda|enviar|todo correcto)/i.test(message.trim().toLowerCase());
    const isAiFalselyConfirming = isSummaryPending && assistantMessage.content && /pedido.*(recibido|confirmado|enviado|registrado)|orden.*(recibida|enviada|registrada)|avisamos al chef/i.test(assistantMessage.content);

    if ((isSummaryPending && isUserConfirming) || isAiFalselyConfirming) {
      log(`[agentService] ⚠️ INTERCEPTOR: Cliente confirmó resumen pero el LLM respondió con texto sin invocar guardar_pedido. Forzando llamada a guardar_pedido...`);
      const forcedPrompt = `${systemPrompt}\n\n[INSTRUCCIÓN CRÍTICA DE SISTEMA]: El cliente acaba de confirmar su pedido diciendo: "${message}". Es OBLIGATORIO que invoques la herramienta guardar_pedido AHORA MISMO con los datos del pedido resumido anteriormente${contactName ? ` (Nombre del cliente: "${contactName}")` : ''}. NO respondas con texto plano sin invocar guardar_pedido.`;
      try {
        const forcedMessage = await chatCompletion({
          systemPrompt: forcedPrompt,
          messages: sanitizeMessages([...history, { role: 'user', content: message }]),
          tools: true,
        });
        if (forcedMessage.tool_calls && forcedMessage.tool_calls.length > 0) {
          log(`[agentService] ✅ Interceptor exitoso: Se obtuvo tool call ${forcedMessage.tool_calls[0].function.name}`);
          assistantMessage = forcedMessage;
        } else {
          log(`[agentService] ⚠️ Reintento no produjo tool call. Respuesta texto: "${(forcedMessage.content || '').substring(0, 80)}"`);
        }
      } catch (retryErr) {
        log(`[agentService] Error en reintento forzado de tool call: ${retryErr.message}`);
      }
    }
  }

  // Handle function calls
  if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
    const toolCall = assistantMessage.tool_calls[0];

    // --- guardar_pedido ---
    if (toolCall.function.name === 'guardar_pedido') {
      let toolResult;
      let savedOrder = null;
      let esNuevo = false;
      let clienteFinal = '';
      let orderArgs = {};

      log(`[PEDIDO] >>> Iniciando guardar_pedido con args: ${toolCall.function.arguments}`);

      try {
        orderArgs = JSON.parse(toolCall.function.arguments);
        const prevOrderId = getLastOrderId(sessionId, remoteJid);
        let rawTelefono = orderArgs.telefono || (!isAdminOrOwnerPhone(telefono) ? telefono : null);
        if (rawTelefono && isAdminOrOwnerPhone(rawTelefono)) {
          log(`[PEDIDO] ⚠️ Teléfono ${rawTelefono} rechazado por ser número de administrador/dueño`);
          rawTelefono = null;
        }
        const telefonoFinal = cleanPhoneNumber(rawTelefono);

        // Si el cliente no especificó nombre o el modelo devolvió un nombre genérico ("Cliente Urbano", "amigo"),
        // usar contactName saneado (sin emojis) si está disponible como respaldo
        clienteFinal = cleanContactName(orderArgs.cliente) || (orderArgs.cliente || '').trim();
        const esGenerico = !clienteFinal || /^(cliente(\s*urbano)?|amigo|usuario|anonimo)$/i.test(clienteFinal);
        const cleanContact = cleanContactName(contactName);
        if (esGenerico && cleanContact) {
          clienteFinal = cleanContact;
        } else if (!clienteFinal || esGenerico) {
          clienteFinal = 'Cliente';
        }

        if (orderArgs.tipo_entrega === 'delivery' && isPlaceholderAddress(orderArgs.direccion)) {
          log(`[PEDIDO] ❌ guardar_pedido rechazado: Dirección de delivery es provisional o placeholder ("${orderArgs.direccion}")`);
          throw new Error('Dirección de delivery inválida: se requiere una dirección exacta y no un texto provisional');
        }

        savedOrder = await saveOrder({
          ...orderArgs,
          cliente: clienteFinal,
          telefono: telefonoFinal,
          restauranteId,
          sessionId,
          moneda: config.moneda,
          jid: remoteJid, // JID real para notificaciones WhatsApp
        });

        esNuevo = !savedOrder.esDuplicado && (!prevOrderId || prevOrderId !== savedOrder.id);
        setLastOrderId(sessionId, savedOrder.id);
        log(`[PEDIDO] ✅ Pedido guardado exitosamente id=${savedOrder.id} telefono=${telefonoFinal} esNuevo=${esNuevo} total=${savedOrder.total}`);
        toolResult = JSON.stringify({ exito: true, pedidoId: savedOrder.id, esNuevo });
      } catch (err) {
        log(`[PEDIDO] ❌ ERROR al guardar pedido en PostgreSQL: ${err.message}`);
        log(`[PEDIDO] Stack: ${err.stack}`);
        toolResult = JSON.stringify({ error: err.message });
      }

      addMessage(sessionId, assistantMessage);
      addMessage(sessionId, { role: 'tool', tool_call_id: toolCall.id, content: toolResult });
      // Respond to any extra tool_calls the model may have emitted (defensive)
      for (const extraCall of assistantMessage.tool_calls.slice(1)) {
        addMessage(sessionId, { role: 'tool', tool_call_id: extraCall.id, content: JSON.stringify({ error: 'Solo se procesa una herramienta a la vez.' }) });
      }

      // Si el pedido no se pudo guardar (savedOrder es null), NO enviar confirmación de éxito falsa
      if (!savedOrder) {
        log(`[PEDIDO] 🚨 CRÍTICO: savedOrder es null tras fallo. No se enviará confirmación falsa.`);
        const orderArgs = JSON.parse(toolCall.function.arguments || '{}');
        const rawNombre = (orderArgs.cliente || '').trim();
        const nombre = (rawNombre && !/^(cliente(\s*urbano)?|amigo|usuario|anonimo)$/i.test(rawNombre))
          ? rawNombre
          : (contactName ? String(contactName).trim() : 'amigo');
        let errorReply;
        try {
          const errorHistory = sanitizeMessages(getSession(sessionId));
          const errorMessage = await chatCompletion({ systemPrompt, messages: errorHistory, tools: false });
          errorReply = errorMessage.content;
        } catch (_) {
          errorReply = `Disculpa ${nombre}, tuvimos un inconveniente registrando tu orden en el sistema. ¿Podrías confirmarnos de nuevo para procesarlo de inmediato? 🙏`;
        }
        addMessage(sessionId, { role: 'assistant', content: errorReply });
        return { reply: errorReply, order: null };
      }

      // Pedido ya existía — el cliente confirmó de nuevo. No enviar otra "¡Pedido recibido!".
      if (!esNuevo) {
        log(`[PEDIDO] Pedido no es nuevo (id=${savedOrder.id}). No se duplica notificación.`);
        const rawNombre = (savedOrder.cliente || '').trim();
        const nombreCliente = (rawNombre && !/^(cliente(\s*urbano)?|amigo|usuario|anonimo)$/i.test(rawNombre))
          ? rawNombre
          : (contactName ? String(contactName).trim() : 'amigo');
        const reminderReply = `Tu orden ya fue enviada al chef y está en preparación. 🍔 En cuanto esté lista te avisaremos. ¡Gracias por tu paciencia, ${nombreCliente}!`;
        addMessage(sessionId, { role: 'assistant', content: reminderReply });
        return { reply: reminderReply, order: savedOrder };
      }

      let confirmReply = null;
      try {
        const confirmHistory = sanitizeMessages(getSession(sessionId));
        const confirmMessage = await chatCompletion({ systemPrompt, messages: confirmHistory, tools: false });
        confirmReply = confirmMessage.content;
      } catch (err) {
        log(`[agentService] Fallback en confirmación de pedido: ${err.message}`);
        if (orderArgs.metodo_pago === 'transferencia') {
          const cuentas = await getCuentasBancariasText(restauranteId);
          confirmReply = `✅ *¡Pedido recibido!* Para completarlo, por favor envíanos el comprobante de pago por este chat 📸.\n\n🏦 *Datos para transferencia:*\n${cuentas}`;
        } else {
          confirmReply = '✅ *¡Pedido recibido!* 🍔';
        }
      }

      // Si el método de pago es efectivo (delivery o retiro), asegurar que la confirmación sea estrictamente
      // concisa ("✅ *¡Pedido recibido!* 🍔") evitando textos largos redundantes con la confirmación posterior de cocina.
      if (orderArgs.metodo_pago === 'efectivo') {
        confirmReply = '✅ *¡Pedido recibido!* 🍔';
      }

      // Limpieza defensiva de "Cliente Urbano" en la respuesta final de confirmación
      if (confirmReply && /cliente\s*urbano/i.test(confirmReply)) {
        const nombreReemplazo = (clienteFinal && !/^(cliente(\s*urbano)?|amigo|usuario|anonimo)$/i.test(clienteFinal))
          ? clienteFinal
          : (contactName && !/^(cliente(\s*urbano)?|amigo|usuario|anonimo)$/i.test(String(contactName).trim()) ? String(contactName).trim() : '');
        confirmReply = confirmReply
          .replace(/,\s*Cliente\s*Urbano!/gi, nombreReemplazo ? `, ${nombreReemplazo}!` : '!')
          .replace(/,\s*Cliente\s*Urbano/gi, nombreReemplazo ? `, ${nombreReemplazo}` : '')
          .replace(/Cliente\s*Urbano/gi, nombreReemplazo || '');
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

  // Interceptor defensivo: si el modelo generó un resumen de delivery con dirección provisional/placeholder,
  // cancelamos ese resumen y solicitamos de inmediato la dirección exacta antes de mostrar el resumen.
  if (contieneResumenConDireccionPlaceholder(assistantMessage.content)) {
    log(`[agentService] ⚠️ INTERCEPTOR: La IA generó un resumen de delivery con dirección provisional/placeholder ("${(assistantMessage.content || '').slice(0, 100)}..."). Reemplazando por solicitud de dirección exacta.`);
    let addressPromptReply;
    if (vecesPreguntadoNombre === 0) {
      addressPromptReply = '¡Perfecto! Ya anoté tu pedido a domicilio 🛵. ¿A qué dirección exacta te lo enviamos y a qué nombre dejamos la orden? 📍';
    } else {
      addressPromptReply = '¡Perfecto! Ya anoté tu pedido a domicilio 🛵. ¿A qué dirección exacta te lo enviamos? 📍';
    }
    assistantMessage.content = addressPromptReply;
  }

  // Interceptor defensivo contra preguntas circulares redundantes: si el tipo de entrega ya se definió
  // en la conversación (delivery o retiro) y el modelo vuelve a preguntar si quiere a domicilio o retiro,
  // reemplazamos la pregunta redundante por el siguiente paso lógico (ordenar productos o pago).
  const tipoEntregaPrevio = haDefinidoTipoEntregaEnHistorial([...history, { role: 'user', content: message }]);
  if (tipoEntregaPrevio && REDUNDANT_DELIVERY_QUESTION_REGEX.test(assistantMessage.content)) {
    log(`[agentService] ⚠️ INTERCEPTOR: La IA preguntó redundantemente "¿a domicilio o retiro?" cuando ya estaba definido como "${tipoEntregaPrevio}". Corrigiendo respuesta.`);
    assistantMessage.content = sanearPreguntaRedundanteEntrega(assistantMessage.content, tipoEntregaPrevio);
  }

  // Normal response — no function call
  addMessage(sessionId, { role: 'assistant', content: assistantMessage.content });
  return { reply: assistantMessage.content, order: null };
}

module.exports = { processMessage };
