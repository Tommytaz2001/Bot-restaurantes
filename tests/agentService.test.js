const { processMessage } = require('../src/agent/agentService');

describe('agentService', () => {
  const restauranteId = 'urbano';

  test('responde al saludo inicial', async () => {
    const result = await processMessage({
      message: 'hola',
      sessionId: 'agent-test-hola-' + Date.now(),
      restauranteId,
    });
    expect(result.reply).toBeDefined();
    expect(typeof result.reply).toBe('string');
    expect(result.reply.length).toBeGreaterThan(5);
    expect(result.order).toBeNull();
  }, 20000);

  test('menciona el menú cuando se le pide', async () => {
    const result = await processMessage({
      message: '¿qué tienen en el menú?',
      sessionId: 'agent-test-menu-' + Date.now(),
      restauranteId,
    });
    expect(result.reply.toLowerCase()).toMatch(/hamburguesa|clásica|tacos|burrito/i);
    expect(result.order).toBeNull();
  }, 20000);

  test('retorna error si restauranteId no existe', async () => {
    await expect(
      processMessage({ message: 'hola', sessionId: 'x', restauranteId: 'restaurante-xyz' })
    ).rejects.toThrow('Restaurante no encontrado');
  }, 10000);
});
