const fs = require('fs');
const path = require('path');
const { chatCompletion } = require('../services/openaiService');
const { getRestauranteConfig, formatMenuForPrompt } = require('../services/menuService');
const { getSession, addMessage } = require('./sessionStore');
const { saveOrder } = require('../orders/orderService');

const PROMPT_TEMPLATE = fs.readFileSync(
  path.join(__dirname, '../../prompts/agent.txt'),
  'utf-8'
);

async function buildSystemPrompt(restauranteId, telefono) {
  const config = await getRestauranteConfig(restauranteId);
  const menuText = await formatMenuForPrompt(restauranteId);
  const telefonoContexto = telefono
    ? `El número de teléfono del cliente es: ${telefono}. No necesitas pedírselo.`
    : 'No tienes el número de teléfono del cliente. Pídelo durante el proceso de pedido.';

  return PROMPT_TEMPLATE
    .replace(/{{NOMBRE_RESTAURANTE}}/g, config.nombre)
    .replace(/{{MONEDA}}/g, config.moneda)
    .replace('{{MENU}}', menuText)
    .replace('{{CONTEXTO_TELEFONO}}', telefonoContexto);
}

async function processMessage({ message, sessionId, restauranteId, telefono }) {
  // Throws 'Restaurante no encontrado' if restauranteId is invalid
  const config = await getRestauranteConfig(restauranteId);

  const systemPrompt = await buildSystemPrompt(restauranteId, telefono);

  // Capture history BEFORE addMessage to avoid duplication when spreading
  const history = getSession(sessionId);

  // Add user message to history
  addMessage(sessionId, { role: 'user', content: message });

  const assistantMessage = await chatCompletion({
    systemPrompt,
    messages: [...history, { role: 'user', content: message }],
    tools: true,
  });

  // Handle function call
  if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
    const toolCall = assistantMessage.tool_calls[0];

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
        });
        toolResult = JSON.stringify({ exito: true, pedidoId: savedOrder.id });
      } catch (err) {
        toolResult = JSON.stringify({ error: err.message });
      }

      // Add assistant message with tool_call to history
      addMessage(sessionId, assistantMessage);
      // Add tool result to history
      addMessage(sessionId, {
        role: 'tool',
        tool_call_id: toolCall.id,
        content: toolResult,
      });

      // Second call to get confirmation reply
      const confirmHistory = getSession(sessionId);
      const confirmMessage = await chatCompletion({
        systemPrompt,
        messages: confirmHistory,
        tools: false,
      });

      addMessage(sessionId, { role: 'assistant', content: confirmMessage.content });

      return { reply: confirmMessage.content, order: savedOrder };
    }
  }

  // Normal response - no function call
  addMessage(sessionId, { role: 'assistant', content: assistantMessage.content });
  return { reply: assistantMessage.content, order: null };
}

module.exports = { processMessage };
