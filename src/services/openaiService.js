const OpenAI = require('openai');

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const GUARDAR_PEDIDO_TOOL = {
  type: 'function',
  function: {
    name: 'guardar_pedido',
    description: 'Guarda el pedido confirmado por el cliente en el sistema. Invoca esta función ÚNICAMENTE cuando el cliente haya confirmado explícitamente el pedido completo.',
    parameters: {
      type: 'object',
      properties: {
        cliente: { type: 'string', description: 'Nombre completo del cliente' },
        telefono: { type: 'string', description: 'Número de teléfono del cliente' },
        direccion: { type: 'string', description: 'Dirección de entrega completa' },
        productos: {
          type: 'array',
          description: 'Lista de productos pedidos',
          items: {
            type: 'object',
            properties: {
              nombre: { type: 'string' },
              cantidad: { type: 'number' },
              precio_unitario: { type: 'number' },
              opcion: { type: 'string', description: 'Opción elegida si el producto la tiene (ej: BBQ, Chipotle dulce)' },
            },
            required: ['nombre', 'cantidad', 'precio_unitario'],
          },
        },
        total: { type: 'number', description: 'Total del pedido en la moneda del restaurante' },
        metodo_pago: { type: 'string', enum: ['transferencia', 'efectivo'], description: 'Método de pago elegido por el cliente' },
      },
      required: ['cliente', 'telefono', 'direccion', 'productos', 'total', 'metodo_pago'],
    },
  },
};

const SOLICITAR_CAMBIO_TOOL = {
  type: 'function',
  function: {
    name: 'solicitar_cambio_pedido',
    description: 'Registra una solicitud de cambio sobre el pedido ya confirmado del cliente. Úsala SOLO cuando el cliente quiera modificar o agregar algo a un pedido que ya fue enviado al chef.',
    parameters: {
      type: 'object',
      properties: {
        descripcion_cambio: {
          type: 'string',
          description: 'Descripción clara del cambio solicitado por el cliente (ej: "Agregar 1 Cheeseburger adicional", "Cambiar dirección a Colonia Los Robles")',
        },
      },
      required: ['descripcion_cambio'],
    },
  },
};

const CANCELAR_PEDIDO_TOOL = {
  type: 'function',
  function: {
    name: 'cancelar_pedido',
    description: 'Cancela el pedido activo del cliente. Solo úsala cuando el cliente pida explícitamente cancelar y el pedido aún no fue confirmado por el chef.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
};

const CONSULTAR_ESTADO_TOOL = {
  type: 'function',
  function: {
    name: 'consultar_estado_pedido',
    description: 'Consulta el estado actual del pedido del cliente en el sistema. Úsala cuando el cliente pregunte por el estado de su pedido, si ya fue confirmado, si ya va en camino, etc.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
};

async function chatCompletion({ systemPrompt, messages, tools = true }) {
  const allTools = tools ? [GUARDAR_PEDIDO_TOOL, SOLICITAR_CAMBIO_TOOL, CANCELAR_PEDIDO_TOOL, CONSULTAR_ESTADO_TOOL] : undefined;
  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    max_tokens: 500,
    temperature: 0.7,
    messages: [{ role: 'system', content: systemPrompt }, ...messages],
    tools: allTools,
    tool_choice: tools ? 'auto' : undefined,
  });

  return response.choices[0].message;
}

module.exports = { chatCompletion, GUARDAR_PEDIDO_TOOL, SOLICITAR_CAMBIO_TOOL, CANCELAR_PEDIDO_TOOL, CONSULTAR_ESTADO_TOOL };
