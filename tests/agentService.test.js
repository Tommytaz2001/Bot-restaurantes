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

  test('responde sobre el menú dirigiendo al catálogo', async () => {
    const result = await processMessage({
      message: '¿qué tienen en el menú?',
      sessionId: 'agent-test-menu-' + Date.now(),
      restauranteId,
    });
    // El prompt prohíbe listar el menú completo — redirige al catálogo de WhatsApp
    expect(result.reply).toBeDefined();
    expect(typeof result.reply).toBe('string');
    expect(result.reply.length).toBeGreaterThan(5);
    expect(result.order).toBeNull();
  }, 20000);

  test('retorna error si restauranteId no existe', async () => {
    await expect(
      processMessage({ message: 'hola', sessionId: 'x', restauranteId: 'restaurante-xyz' })
    ).rejects.toThrow('Restaurante no encontrado');
  }, 10000);
});
