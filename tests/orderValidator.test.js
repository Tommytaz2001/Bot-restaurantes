const { validateOrder } = require('../src/orders/orderValidator');

const validOrder = {
  cliente: 'Juan Pérez',
  telefono: '+50512345678',
  direccion: 'Barrio Linda Vista, casa 5',
  productos: [{ nombre: 'Clásica', cantidad: 1, precio_unitario: 160 }],
  total: 160,
  metodo_pago: 'efectivo',
  tipo_entrega: 'delivery',
};

describe('orderValidator', () => {
  test('acepta pedido válido con efectivo', () => {
    expect(() => validateOrder(validOrder)).not.toThrow();
  });

  test('acepta pedido válido con transferencia', () => {
    const order = { ...validOrder, metodo_pago: 'transferencia' };
    expect(() => validateOrder(order)).not.toThrow();
  });

  test('acepta producto con opcion opcional', () => {
    const order = {
      ...validOrder,
      productos: [{ nombre: 'Premium', cantidad: 1, precio_unitario: 200, opcion: 'BBQ' }],
      total: 200,
    };
    expect(() => validateOrder(order)).not.toThrow();
  });

  test('lanza error si falta cliente', () => {
    const { cliente, ...order } = validOrder;
    expect(() => validateOrder(order)).toThrow('cliente');
  });

  test('lanza error si falta telefono', () => {
    const { telefono, ...order } = validOrder;
    expect(() => validateOrder(order)).toThrow('telefono');
  });

  test('lanza error si falta direccion', () => {
    const { direccion, ...order } = validOrder;
    expect(() => validateOrder(order)).toThrow('direccion');
  });

  test('lanza error si productos está vacío', () => {
    const order = { ...validOrder, productos: [] };
    expect(() => validateOrder(order)).toThrow('productos');
  });

  test('lanza error si metodo_pago es inválido', () => {
    const order = { ...validOrder, metodo_pago: 'bitcoin' };
    expect(() => validateOrder(order)).toThrow('metodo_pago');
  });

  test('lanza error si total es 0 o negativo', () => {
    const order = { ...validOrder, total: 0 };
    expect(() => validateOrder(order)).toThrow('total');
  });

  test('lanza error si producto no tiene precio_unitario', () => {
    const order = {
      ...validOrder,
      productos: [{ nombre: 'Clásica', cantidad: 1 }],
    };
    expect(() => validateOrder(order)).toThrow('precio_unitario');
  });

  test('lanza error si falta tipo_entrega', () => {
    const order = { ...validOrder, tipo_entrega: undefined };
    expect(() => validateOrder(order)).toThrow('tipo_entrega');
  });

  test('lanza error si tipo_entrega es inválido', () => {
    const order = { ...validOrder, tipo_entrega: 'express' };
    expect(() => validateOrder(order)).toThrow('tipo_entrega');
  });

  test('acepta tipo_entrega delivery', () => {
    const order = { ...validOrder, tipo_entrega: 'delivery' };
    expect(() => validateOrder(order)).not.toThrow();
  });

  test('acepta tipo_entrega retiro', () => {
    const order = { ...validOrder, tipo_entrega: 'retiro' };
    expect(() => validateOrder(order)).not.toThrow();
  });
});
