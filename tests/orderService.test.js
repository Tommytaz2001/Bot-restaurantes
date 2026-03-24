const { saveOrder, getOrder } = require('../src/orders/orderService');

const baseOrder = {
  restauranteId: 'urbano',
  sessionId: 'test-session-' + Date.now(),
  cliente: 'Test Cliente',
  telefono: '+50599999999',
  direccion: 'Test Address 123',
  productos: [{ nombre: 'Clásica', cantidad: 1, precio_unitario: 160, opcion: null }],
  total: 160,
  moneda: 'C$',
  metodo_pago: 'efectivo',
  tipo_entrega: 'delivery',
};

describe('orderService', () => {
  test('guarda pedido efectivo con estado pendiente_pago', async () => {
    const order = await saveOrder(baseOrder);
    expect(order.id).toBeDefined();
    expect(order.estado).toBe('pendiente_pago');
    expect(order.moneda).toBe('C$');
  }, 10000);

  test('guarda pedido transferencia con estado pendiente', async () => {
    const order = await saveOrder({
      ...baseOrder,
      sessionId: 'test-session-transferencia-' + Date.now(),
      metodo_pago: 'transferencia',
    });
    expect(order.estado).toBe('pendiente');
  }, 10000);

  test('retorna pedido existente si ya hay uno activo para el sessionId', async () => {
    const sessionId = 'test-dedup-' + Date.now();
    const first = await saveOrder({ ...baseOrder, sessionId });
    const second = await saveOrder({ ...baseOrder, sessionId });
    expect(first.id).toBe(second.id);
  }, 15000);

  test('getOrder retorna el pedido por id', async () => {
    const sessionId = 'test-get-' + Date.now();
    const saved = await saveOrder({ ...baseOrder, sessionId });
    const fetched = await getOrder(saved.id);
    expect(fetched.id).toBe(saved.id);
    expect(fetched.cliente).toBe('Test Cliente');
  }, 15000);

  test('getOrder retorna null para id inexistente', async () => {
    const result = await getOrder('id-que-no-existe-xyz123');
    expect(result).toBeNull();
  }, 10000);

  test('pedido delivery tiene costo_envio=40 y total=subtotal+40', async () => {
    const order = await saveOrder({
      ...baseOrder,
      sessionId: 'test-delivery-fee-' + Date.now(),
      tipo_entrega: 'delivery',
      productos: [{ nombre: 'Clásica', cantidad: 1, precio_unitario: 160, opcion: null }],
      total: 9999, // backend must overwrite this
    });
    expect(order.costo_envio).toBe(40);
    expect(order.total).toBe(200); // 160 + 40
  }, 10000);

  test('pedido retiro tiene costo_envio=0 y total=solo subtotal', async () => {
    const order = await saveOrder({
      ...baseOrder,
      sessionId: 'test-retiro-fee-' + Date.now(),
      tipo_entrega: 'retiro',
      direccion: 'Retiro en local',
      productos: [{ nombre: 'Clásica', cantidad: 1, precio_unitario: 160, opcion: null }],
      total: 9999, // backend must overwrite this
    });
    expect(order.costo_envio).toBe(0);
    expect(order.total).toBe(160); // 160 + 0
  }, 10000);
});
