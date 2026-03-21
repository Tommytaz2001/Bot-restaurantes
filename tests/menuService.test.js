const { getRestauranteConfig, formatMenuForPrompt, clearMenuCache } = require('../src/services/menuService');

describe('menuService', () => {
  beforeEach(() => clearMenuCache());

  test('lanza error si restauranteId no existe en Firestore', async () => {
    await expect(getRestauranteConfig('restaurante-inexistente-xyz'))
      .rejects
      .toThrow('Restaurante no encontrado');
  }, 10000);

  test('carga config del restaurante "urbano" desde Firestore', async () => {
    const config = await getRestauranteConfig('urbano');
    expect(config.nombre).toBe('Urbano');
    expect(config.moneda).toBe('C$');
  }, 10000);

  test('retorna config desde caché en llamada repetida', async () => {
    await getRestauranteConfig('urbano');
    const startTime = Date.now();
    await getRestauranteConfig('urbano');
    expect(Date.now() - startTime).toBeLessThan(100);
  }, 10000);

  test('formatMenuForPrompt retorna texto con nombre de producto y precio', async () => {
    const text = await formatMenuForPrompt('urbano');
    expect(text).toContain('Clásica');
    expect(text).toContain('160');
    expect(text).toContain('C$');
  }, 10000);
});
