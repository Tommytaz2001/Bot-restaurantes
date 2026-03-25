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
        tipo_entrega: { type: 'string', enum: ['delivery', 'retiro'], description: 'Tipo de entrega: "delivery" si el cliente pidió envío a domicilio, "retiro" si pasa a retirar al local' },
        direccion: { type: 'string', description: 'Dirección de entrega. Para retiro usa "Retiro en local"' },
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
        costo_envio: {
          type: 'number',
          description: 'Costo de envío. 40 para delivery, 0 para retiro en local.',
        },
        total: {
          type: 'number',
          description: 'Total del pedido incluyendo el costo de envío (subtotal + costo_envio).',
        },
        metodo_pago: { type: 'string', enum: ['transferencia', 'efectivo'], description: 'Método de pago elegido por el cliente' },
      },
      required: ['cliente', 'telefono', 'tipo_entrega', 'direccion', 'productos', 'costo_envio', 'total', 'metodo_pago'],
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
        tipo: {
          type: 'string',
          enum: ['modificacion', 'agregar_productos'],
          description: '"agregar_productos" cuando el cliente quiere añadir nuevos ítems al pedido. "modificacion" para cualquier otro cambio (ingredientes, dirección, etc.).',
        },
        descripcion_cambio: {
          type: 'string',
          description: 'Descripción clara del cambio solicitado (ej: "Agregar 1 Cheeseburger adicional", "Sin cebolla en la hamburguesa").',
        },
        productos_nuevos: {
          type: 'array',
          description: 'Solo para tipo "agregar_productos". Lista de productos a agregar.',
          items: {
            type: 'object',
            properties: {
              nombre: { type: 'string' },
              cantidad: { type: 'number' },
              precio_unitario: { type: 'number' },
              opcion: { type: 'string', description: 'Modificación opcional del producto.' },
            },
            required: ['nombre', 'cantidad', 'precio_unitario'],
          },
        },
      },
      required: ['tipo', 'descripcion_cambio'],
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
