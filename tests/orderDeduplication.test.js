const { sameOrderProducts, findExistingOrder } = require('../src/orders/orderService');

jest.mock('../src/db/connection', () => ({
  query: jest.fn(),
  pool: { connect: jest.fn() },
}));

const { query } = require('../src/db/connection');

describe('Order Deduplication & Idempotency Rules', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('sameOrderProducts', () => {
    test('retorna true cuando los productos y cantidades son idénticos sin importar el orden', () => {
      const itemsA = [
        { nombre: 'Papas Nivel 100', cantidad: 1 },
        { nombre: 'Gaseosa Coca Cola', cantidad: 2 },
      ];
      const itemsB = [
        { nombre: 'gaseosa coca cola', cantidad: 2 },
        { nombre: 'papas nivel 100 ', cantidad: 1 },
      ];

      expect(sameOrderProducts(itemsA, itemsB)).toBe(true);
    });

    test('retorna false cuando las cantidades o productos difieren', () => {
      const itemsA = [{ nombre: 'Papas Nivel 100', cantidad: 1 }];
      const itemsB = [{ nombre: 'Papas Nivel 100', cantidad: 2 }];
      const itemsC = [{ nombre: 'Hamburguesa Clásica', cantidad: 1 }];

      expect(sameOrderProducts(itemsA, itemsB)).toBe(false);
      expect(sameOrderProducts(itemsA, itemsC)).toBe(false);
    });
  });

  describe('findExistingOrder', () => {
    test('deduplica pedido existente dentro de la ventana de 5 minutos para el mismo cliente', async () => {
      const mockOrderRow = {
        id: 'order-aed1e6',
        restaurante_id: 'urbano',
        cliente: 'Cristian',
        telefono: '89071419',
        session_id: '50589071419',
        tipo_entrega: 'delivery',
        direccion: 'Callejón frente a casa mía',
        total: '260',
        estado: 'pendiente',
        created_at: new Date(Date.now() - 2 * 60 * 1000).toISOString(), // 2 minutos atrás
      };

      const mockItems = [
        { nombre: 'Papas Nivel 100', cantidad: 1, precio_unitario: '220', subtotal: '220' },
      ];

      query
        // 1er query: busca pedido reciente (< 5m)
        .mockResolvedValueOnce({ rows: [mockOrderRow] })
        // 2do query: busca items del pedido encontrado
        .mockResolvedValueOnce({ rows: mockItems });

      const incomingOrder = {
        sessionId: '50589071419',
        telefono: '89071419',
        cliente: 'Cristian',
        total: 260,
        productos: [{ nombre: 'Papas Nivel 100', cantidad: 1, precio_unitario: 220 }],
      };

      const existing = await findExistingOrder(incomingOrder);

      expect(existing).not.toBeNull();
      expect(existing.id).toBe('order-aed1e6');
      expect(existing.cliente).toBe('Cristian');
      expect(existing.total).toBe(260);
    });

    test('deduplica pedido idéntico de hasta 30 minutos si los productos y total coinciden exactamente', async () => {
      const mockOrderRow = {
        id: 'order-aed1e6',
        restaurante_id: 'urbano',
        cliente: 'Cristian',
        telefono: '89071419',
        session_id: '50589071419',
        tipo_entrega: 'delivery',
        direccion: 'Callejón frente a casa mía',
        total: '260',
        estado: 'pendiente',
        created_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(), // 10 minutos atrás
      };

      const mockItems = [
        { nombre: 'Papas Nivel 100', cantidad: 1, precio_unitario: '220', subtotal: '220' },
      ];

      query
        // 1er query (< 5m): no encuentra nada
        .mockResolvedValueOnce({ rows: [] })
        // 2do query (< 30m): encuentra pedido pendiente
        .mockResolvedValueOnce({ rows: [mockOrderRow] })
        // 3er query: items del pedido
        .mockResolvedValueOnce({ rows: mockItems });

      const incomingOrder = {
        sessionId: '50589071419',
        telefono: '89071419',
        cliente: 'Cristian',
        total: 260,
        productos: [{ nombre: 'Papas Nivel 100', cantidad: 1, precio_unitario: 220 }],
      };

      const existing = await findExistingOrder(incomingOrder);

      expect(existing).not.toBeNull();
      expect(existing.id).toBe('order-aed1e6');
    });

    test('permite nuevo pedido si pasaron más de 5 minutos y los productos son distintos', async () => {
      const mockOrderRow = {
        id: 'order-old-1',
        total: '260',
        created_at: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
      };
      const mockOldItems = [
        { nombre: 'Papas Nivel 100', cantidad: 1, precio_unitario: '220' },
      ];

      query
        // 1er query (< 5m): no encuentra nada
        .mockResolvedValueOnce({ rows: [] })
        // 2do query (< 30m): encuentra el pedido viejo
        .mockResolvedValueOnce({ rows: [mockOrderRow] })
        // 3er query: items del pedido viejo
        .mockResolvedValueOnce({ rows: mockOldItems });

      const incomingNewOrder = {
        sessionId: '50589071419',
        telefono: '89071419',
        total: 190,
        productos: [{ nombre: 'Hamburguesa Clásica', cantidad: 1, precio_unitario: 150 }],
      };

      const existing = await findExistingOrder(incomingNewOrder);

      // Dado que los productos son diferentes (Papas vs Hamburguesa), NO debe deduplicar
      expect(existing).toBeNull();
    });
  });
});

