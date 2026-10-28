jest.mock('../src/services/menuService', () => ({
  getRestauranteConfig: jest.fn().mockResolvedValue({
    nombre: 'Urbano Fast Food',
    moneda: 'C$',
    direccion: 'De rest Mi Rancho 10 vrs al sur, casa naranja',
    departamento: 'Jinotega',
  }),
  formatMenuForPrompt: jest.fn().mockResolvedValue('Hamburguesa Clásica: C$150\nBurrito Pollo: C$120'),
  getCuentasBancariasText: jest.fn().mockResolvedValue('BAC Córdobas: 371618588'),
}));

jest.mock('../src/orders/orderService', () => ({
  saveOrder: jest.fn(),
  solicitarCambioPedido: jest.fn(),
  cancelarPedido: jest.fn(),
  consultarEstadoPedido: jest.fn(),
  estadoLegible: jest.fn(e => e),
  findActiveOrderByPhone: jest.fn().mockResolvedValue(null),
  findLastDeliveryAddress: jest.fn().mockResolvedValue(null),
}));

jest.mock('../src/services/openaiService', () => ({
  chatCompletion: jest.fn(),
}));

const { processMessage } = require('../src/agent/agentService');
const { chatCompletion } = require('../src/services/openaiService');
const { saveOrder } = require('../src/orders/orderService');
const { addMessage, clearSession } = require('../src/agent/sessionStore');

describe('agentService - Confirmation and Error Handling', () => {
  const sessionId = 'test-confirm-session-1';
  const restauranteId = 'urbano';

  beforeEach(() => {
    jest.clearAllMocks();
    clearSession(sessionId);
  });

  test('guarda el pedido exitosamente cuando el LLM emite guardar_pedido', async () => {
    const mockOrder = {
      id: 'order-123',
      cliente: 'Carlos',
      total: 190,
      estado: 'pendiente',
    };
    saveOrder.mockResolvedValueOnce(mockOrder);

    chatCompletion
      .mockResolvedValueOnce({
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            id: 'call_1',
            type: 'function',
            function: {
              name: 'guardar_pedido',
              arguments: JSON.stringify({
                cliente: 'Carlos',
                tipo_entrega: 'delivery',
                direccion: 'Barrio Central',
                metodo_pago: 'efectivo',
                productos: [{ nombre: 'Clásica', cantidad: 1, precio_unitario: 150 }],
              }),
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        role: 'assistant',
        content: '✅ ¡Pedido recibido! Tu orden fue enviada al chef.',
      });

    const result = await processMessage({
      message: 'ok',
      sessionId,
      restauranteId,
      telefono: '88888888',
    });

    expect(saveOrder).toHaveBeenCalledTimes(1);
    expect(result.order).toEqual(mockOrder);
    expect(result.reply).toContain('¡Pedido recibido!');
  });

  test('no envía confirmación falsa si saveOrder falla en PostgreSQL', async () => {
    saveOrder.mockRejectedValueOnce(new Error('Conexión rechazada a PostgreSQL'));

    chatCompletion.mockResolvedValueOnce({
      role: 'assistant',
      content: null,
      tool_calls: [
        {
          id: 'call_1',
          type: 'function',
          function: {
            name: 'guardar_pedido',
            arguments: JSON.stringify({
              cliente: 'Carlos',
              tipo_entrega: 'delivery',
              direccion: 'Barrio Central',
              metodo_pago: 'efectivo',
              productos: [{ nombre: 'Clásica', cantidad: 1, precio_unitario: 150 }],
            }),
          },
        },
      ],
    });

    const result = await processMessage({
      message: 'ok',
      sessionId,
      restauranteId,
      telefono: '88888888',
    });

    expect(saveOrder).toHaveBeenCalledTimes(1);
    expect(result.order).toBeNull();
    // No debe contener mensaje de éxito falso
    expect(result.reply).not.toContain('✅ *¡Pedido recibido!* Tu orden fue enviada al chef');
    expect(result.reply).toContain('inconveniente');
  });

  test('interceptor detecta respuesta de texto cuando se esperaba confirmación y fuerza tool_call', async () => {
    // Simulamos que el mensaje anterior fue el resumen
    addMessage(sessionId, {
      role: 'assistant',
      content: '📋 *Resumen de tu pedido:*\n• Clásica x1 — 150 C$\n💰 *Total:* 190 C$\n\n¿Está todo correcto? Envía un "ok" para confirmar que todo esté bien. ✅',
    });

    const mockOrder = { id: 'order-interceptor-1', cliente: 'Juan', total: 190 };
    saveOrder.mockResolvedValueOnce(mockOrder);

    chatCompletion
      // Primer llamado: el LLM devuelve solo texto (el bug reportado)
      .mockResolvedValueOnce({
        role: 'assistant',
        content: '¡Perfecto Juan! Tu pedido de 1 hamburguesa clásica ha sido recibido y enviado al chef.',
        tool_calls: null,
      })
      // Segundo llamado (forzado por el interceptor): ahora sí emite el tool_call
      .mockResolvedValueOnce({
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            id: 'call_interceptor',
            type: 'function',
            function: {
              name: 'guardar_pedido',
              arguments: JSON.stringify({
                cliente: 'Juan',
                tipo_entrega: 'delivery',
                direccion: 'Barrio Central',
                metodo_pago: 'efectivo',
                productos: [{ nombre: 'Clásica', cantidad: 1, precio_unitario: 150 }],
              }),
            },
          },
        ],
      })
      // Tercer llamado: confirmación final tras guardar el pedido
      .mockResolvedValueOnce({
        role: 'assistant',
        content: '✅ *¡Pedido recibido!* Tu orden fue enviada al chef.',
      });

    const result = await processMessage({
      message: 'ok',
      sessionId,
      restauranteId,
      telefono: '88888888',
    });

    // Se debió forzar el tool call y guardar la orden
    expect(saveOrder).toHaveBeenCalledTimes(1);
    expect(result.order).toEqual(mockOrder);
    expect(result.reply).toContain('¡Pedido recibido!');
  });

  test('pasa prompt con reglas de desambiguación de combos y papas extras (Caso E)', async () => {
    chatCompletion.mockResolvedValueOnce({
      role: 'assistant',
      content: '¿Te gustaría en Combo (que incluye papas fritas y gaseosa) o el Burrito Mixto con Papas extras? 🍟',
      tool_calls: null,
    });

    const result = await processMessage({
      message: 'Un burrito mixto con papas',
      sessionId,
      restauranteId,
      telefono: '88888888',
    });

    expect(chatCompletion).toHaveBeenCalledTimes(1);
    const callArgs = chatCompletion.mock.calls[0][0];
    expect(callArgs.systemPrompt).toContain('Caso E');
    expect(callArgs.systemPrompt).toContain('Burrito Mixto en Combo');
    expect(callArgs.systemPrompt).toContain('Papas extras');
    expect(result.reply).toContain('Combo');
  });

  test('incluye protocolo "¿Quizás quisiste decir...?" y guía de desambiguación para todo el menú en systemPrompt', async () => {
    chatCompletion.mockResolvedValueOnce({
      role: 'assistant',
      content: '¿Quizás quisiste decir alguna de estas opciones? 🍔\n• Double Cheeseburguer (C$240)\n• Nivel 100 (C$290)',
      tool_calls: null,
    });

    const result = await processMessage({
      message: 'dame la de dos carnes',
      sessionId,
      restauranteId,
      telefono: '88888888',
    });

    expect(chatCompletion).toHaveBeenCalledTimes(1);
    const callArgs = chatCompletion.mock.calls[0][0];
    expect(callArgs.systemPrompt).toContain('PROTOCOLO OBLIGATORIO: "¿Quizás quisiste decir...?"');
    expect(callArgs.systemPrompt).toContain('¿Quizás quisiste decir alguna de estas opciones?');
    expect(callArgs.systemPrompt).toContain('Double Cheeseburguer');
    expect(callArgs.systemPrompt).toContain('salchipapas');
    expect(callArgs.systemPrompt).toContain('Big Mac');
    expect(result.reply).toContain('¿Quizás quisiste decir');
    expect(result.reply).toContain('Double Cheeseburguer');
  });
});

