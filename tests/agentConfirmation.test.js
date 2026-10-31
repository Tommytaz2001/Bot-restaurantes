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
const { addMessage, clearSession, setLastOrderId } = require('../src/agent/sessionStore');

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

  test('retiene y respeta la cantidad cuando el cliente pide "2 hot dog" y luego elige "210"', async () => {
    // Turno 1: el cliente pide "2 hot dog"
    addMessage(sessionId, { role: 'user', content: '2 hot dog' });
    addMessage(sessionId, {
      role: 'assistant',
      content: 'Tenemos estas opciones de hot dogs:\n• Hot Dog Nivel 100: C$150\n• Hot Dog Nivel 100 en Combo: C$210\n• Hot Dog Birridog: C$190\n\n¿Cuál de ellos te gustaría ordenar?',
    });

    chatCompletion.mockResolvedValueOnce({
      role: 'assistant',
      content: '¡Perfecto, 2 Hot Dog Nivel 100 en Combo! 🌭🥤 ¿Quieres que te enviemos el pedido a domicilio 🛵 o prefieres pasar a retirarlo al local 🏪?',
      tool_calls: null,
    });

    const result = await processMessage({
      message: '210',
      sessionId,
      restauranteId,
      telefono: '88888888',
    });

    expect(chatCompletion).toHaveBeenCalledTimes(1);
    const callArgs = chatCompletion.mock.calls[0][0];
    expect(callArgs.systemPrompt).toContain('PERSISTENCIA Y MEMORIA DE CANTIDAD');
    expect(callArgs.systemPrompt).toContain('2 Hot Dog Nivel 100 en Combo');
    expect(callArgs.systemPrompt).toContain('420 C$');
    expect(result.reply).toContain('2 Hot Dog');
  });

  test('reconoce "combo de burrito de pollo (del que vale 220)" como Combo a C$220 y no como C$160', async () => {
    chatCompletion.mockResolvedValueOnce({
      role: 'assistant',
      content: '¡Perfecto, 1 Burrito Pollo en Combo! 🌯🥤 ¿Quieres que te enviemos el pedido a domicilio 🛵 o prefieres pasar a retirarlo al local 🏪?',
      tool_calls: null,
    });

    const result = await processMessage({
      message: 'Me podrían enviar un combo de burrito de pollo de Urbano (del que vale 220)',
      sessionId,
      restauranteId,
      telefono: '88888888',
    });

    expect(chatCompletion).toHaveBeenCalledTimes(1);
    const callArgs = chatCompletion.mock.calls[0][0];
    expect(callArgs.systemPrompt).toContain('REGLA DE PRECIOS Y COMBOS');
    expect(callArgs.systemPrompt).toContain('Burrito Pollo en Combo (C$220)');
    expect(callArgs.systemPrompt).toContain('del que vale 220');
    expect(result.reply).toContain('Combo');
  });

  test('incluye en systemPrompt la regla de tiempo de preparación y corte de dirección en retiro', async () => {
    chatCompletion.mockResolvedValueOnce({
      role: 'assistant',
      content: 'Una vez terminemos de completar tus datos y el pedido se te dará el tiempo aproximado. 🍔 ¿Qué te gustaría ordenar?',
      tool_calls: null,
    });

    const result = await processMessage({
      message: '¿En cuánto tiempo está?',
      sessionId,
      restauranteId,
      telefono: '88888888',
    });

    expect(chatCompletion).toHaveBeenCalledTimes(1);
    const callArgs = chatCompletion.mock.calls[0][0];
    expect(callArgs.systemPrompt).toContain('Una vez terminemos de completar tus datos y el pedido se te dará el tiempo aproximado');
    expect(result.reply).toContain('Una vez terminemos de completar tus datos y el pedido se te dará el tiempo aproximado');
  });

  test('confirmación para pago en efectivo responde de forma estrictamente concisa ("¡Pedido recibido!")', async () => {
    const mockOrder = {
      id: 'order-pickup-1',
      cliente: 'Vincell',
      total: 180,
      estado: 'pendiente',
    };
    saveOrder.mockResolvedValueOnce(mockOrder);

    chatCompletion
      .mockResolvedValueOnce({
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            id: 'call_pickup',
            type: 'function',
            function: {
              name: 'guardar_pedido',
              arguments: JSON.stringify({
                cliente: 'Vincell',
                tipo_entrega: 'retiro',
                direccion: 'Retiro en local',
                metodo_pago: 'efectivo',
                productos: [{ nombre: 'Cheeseburguer', cantidad: 1, precio_unitario: 180 }],
              }),
            },
          },
        ],
      })
      .mockRejectedValueOnce(new Error('Simulated LLM error for fallback'));

    const result = await processMessage({
      message: 'ok',
      sessionId,
      restauranteId,
      telefono: '88888888',
    });

    expect(saveOrder).toHaveBeenCalledTimes(1);
    expect(result.reply).toBe('✅ *¡Pedido recibido!* 🍔');
    expect(result.reply).not.toContain('De rest Mi Rancho');
    expect(result.reply).not.toContain('a nuestro local');
  });

  test('inyecta contactName en systemPrompt y reemplaza nombres genéricos como "Cliente Urbano"', async () => {
    const mockOrder = {
      id: 'order-martin-1',
      cliente: 'Martin Espinoza',
      total: 240,
      estado: 'pendiente',
    };
    saveOrder.mockResolvedValueOnce(mockOrder);

    chatCompletion
      .mockResolvedValueOnce({
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            id: 'call_martin',
            type: 'function',
            function: {
              name: 'guardar_pedido',
              arguments: JSON.stringify({
                cliente: 'Cliente Urbano', // modelo alucina nombre genérico
                tipo_entrega: 'delivery',
                direccion: 'De donde fue el club social cuadra y media al norte',
                metodo_pago: 'efectivo',
                telefono: '86224206',
                productos: [{ nombre: 'Chuletona', cantidad: 1, precio_unitario: 200 }],
              }),
            },
          },
        ],
      })
      .mockRejectedValueOnce(new Error('Simulated LLM error for fallback'));

    const result = await processMessage({
      message: 'ok',
      sessionId: '50586224206',
      restauranteId,
      telefono: '86224206',
      remoteJid: '50586224206@s.whatsapp.net',
      contactName: 'Martin Espinoza',
    });

    expect(chatCompletion).toHaveBeenCalled();
    const firstCallArgs = chatCompletion.mock.calls[0][0];
    expect(firstCallArgs.systemPrompt).toContain('Martin Espinoza');
    expect(firstCallArgs.systemPrompt).toContain('DISTINCIÓN CRÍTICA — DIRECCIÓN DE ENTREGA A DOMICILIO VS UBICACIÓN DEL RESTAURANTE');
    expect(firstCallArgs.systemPrompt).toContain('👤 *Cliente:* [Nombre completo]');

    // saveOrder DEBE haber recibido 'Martin Espinoza' en lugar de 'Cliente Urbano'
    expect(saveOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        cliente: 'Martin Espinoza',
        jid: '50586224206@s.whatsapp.net',
      })
    );

    // El mensaje de confirmación para efectivo es conciso y no contiene Cliente Urbano
    expect(result.reply).toBe('✅ *¡Pedido recibido!* 🍔');
    expect(result.reply).not.toContain('Cliente Urbano');
  });

  test('no duplica pedido ni ejecuta interceptor si el cliente ya tiene una orden activa en cocina y envía cortesía', async () => {
    // Simulamos que el cliente ya tiene un pedido guardado en esta sesión
    setLastOrderId(sessionId, 'order-existente-123');

    // El cliente dice "ok gracias" después de haber ordenado
    chatCompletion.mockResolvedValueOnce({
      role: 'assistant',
      content: '¡Con gusto! Tu orden ya fue recibida y enviada al chef. En cuanto esté lista te avisaremos. 🍔',
      tool_calls: null,
    });

    const result = await processMessage({
      message: 'ok gracias',
      sessionId,
      restauranteId,
      telefono: '89071419',
    });

    // Chat completion solo se debe llamar 1 vez (el interceptor NO debe forzar un segundo llamado con guardar_pedido)
    expect(chatCompletion).toHaveBeenCalledTimes(1);
    expect(saveOrder).not.toHaveBeenCalled();
    expect(result.reply).toContain('Tu orden ya fue recibida');
  });

  test('cuando guardar_pedido devuelve pedido existente (!esNuevo), responde con recordatorio amigable', async () => {
    setLastOrderId(sessionId, 'order-cristian-existente');

    // Simulamos que saveOrder retorna el pedido existente (mismo id o esDuplicado)
    saveOrder.mockResolvedValueOnce({
      id: 'order-cristian-existente',
      cliente: 'Cristian',
      total: 260,
      estado: 'pendiente',
      esDuplicado: true,
    });

    chatCompletion.mockResolvedValueOnce({
      role: 'assistant',
      content: null,
      tool_calls: [
        {
          id: 'call_duplicate',
          type: 'function',
          function: {
            name: 'guardar_pedido',
            arguments: JSON.stringify({
              cliente: 'Cristian',
              tipo_entrega: 'delivery',
              direccion: 'Callejón frente a casa mía',
              metodo_pago: 'efectivo',
              telefono: '89071419',
              productos: [{ nombre: 'Papas Nivel 100', cantidad: 1, precio_unitario: 220 }],
            }),
          },
        },
      ],
    });

    const result = await processMessage({
      message: 'ok',
      sessionId,
      restauranteId,
      telefono: '89071419',
    });

    expect(saveOrder).toHaveBeenCalledTimes(1);
    // Debe responder con mensaje de recordatorio y NO con duplicate confirmation
    expect(result.reply).toContain('Tu orden ya fue enviada al chef y está en preparación');
    expect(result.reply).toContain('Cristian');
  });

  test('rechaza número del administrador/dueño en telefono y evita que se guarde en saveOrder', async () => {
    process.env.NOTIFICAR_DESPLIEGUE_TELEFONO = '50588888888';
    const mockOrder = {
      id: 'order-admin-safe',
      cliente: 'María Angeles',
      total: 240,
      estado: 'pendiente',
    };
    saveOrder.mockResolvedValueOnce(mockOrder);

    chatCompletion
      .mockResolvedValueOnce({
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            id: 'call_admin_phone',
            type: 'function',
            function: {
              name: 'guardar_pedido',
              arguments: JSON.stringify({
                cliente: 'María Angeles',
                tipo_entrega: 'delivery',
                direccion: 'Del tip top 1c al sur',
                metodo_pago: 'efectivo',
                telefono: '50588888888', // El LLM intentó usar el del admin
                productos: [{ nombre: 'Nachos Pollo', cantidad: 1, precio_unitario: 200 }],
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
      sessionId: '229712898017378@lid',
      restauranteId,
      telefono: '50588888888', // El webhook traía el del admin
    });

    expect(saveOrder).toHaveBeenCalledTimes(1);
    // Verificar que saveOrder recibió telefono: null y NUNCA el del admin
    expect(saveOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        telefono: null,
      })
    );
  });

  test('limpia "Cliente Urbano" si el LLM lo incluye en la confirmación', async () => {
    const mockOrder = {
      id: 'order-urbano-clean',
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
            id: 'call_clean_urbano',
            type: 'function',
            function: {
              name: 'guardar_pedido',
              arguments: JSON.stringify({
                cliente: 'Carlos',
                tipo_entrega: 'delivery',
                direccion: 'Barrio Central',
                metodo_pago: 'transferencia',
                productos: [{ nombre: 'Clásica', cantidad: 1, precio_unitario: 150 }],
              }),
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        role: 'assistant',
        content: '✅ *¡Pedido recibido!* Para completarlo, por favor envíanos el comprobante de pago por este chat 📸. ¡Gracias, Cliente Urbano! 🍔',
      });

    const result = await processMessage({
      message: 'ok',
      sessionId,
      restauranteId,
      telefono: '50577771234',
    });

    expect(result.reply).not.toContain('Cliente Urbano');
    expect(result.reply).toContain('Carlos');
  });
});




