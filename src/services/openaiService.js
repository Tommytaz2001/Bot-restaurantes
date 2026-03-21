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

async function chatCompletion({ systemPrompt, messages, tools = true }) {
  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    max_tokens: 500,
    temperature: 0.7,
    messages: [{ role: 'system', content: systemPrompt }, ...messages],
    tools: tools ? [GUARDAR_PEDIDO_TOOL] : undefined,
    tool_choice: tools ? 'auto' : undefined,
  });

  return response.choices[0].message;
}

module.exports = { chatCompletion, GUARDAR_PEDIDO_TOOL };
