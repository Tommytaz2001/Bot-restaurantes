const { enviarPushNuevoPedido, enviarPushAlChef } = require('../src/services/pushService');

// Mock connection
jest.mock('../src/db/connection', () => {
  return {
    query: jest.fn(),
  };
});

const { query } = require('../src/db/connection');

describe('Push Notifications Service (Expo & PostgreSQL)', () => {
  let originalFetch;

  beforeEach(() => {
    jest.clearAllMocks();
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test('enviarPushNuevoPedido formatea correctamente comanda y despacha a Expo', async () => {
    query.mockResolvedValueOnce({
      rows: [{ push_tokens: ['ExponentPushToken[mock-chef-device-123]'] }],
    });

    const mockFetch = jest.fn().mockResolvedValueOnce({
      json: async () => ({
        data: [{ status: 'ok', id: 'mock-ticket-1' }],
      }),
    });
    global.fetch = mockFetch;

    const mockPedido = {
      id: 'pedido-12345678-abcd-1234',
      cliente: 'Carlos Urbano',
      total: 350,
      tipo_entrega: 'delivery',
      productos: [
        { nombre: 'Clásica', cantidad: 2 },
        { nombre: 'Coca Cola 355ml', cantidad: 1 },
      ],
    };

    await enviarPushNuevoPedido('urbano', mockPedido);

    expect(query).toHaveBeenCalledWith(
      'SELECT push_tokens FROM restaurantes WHERE id = $1',
      ['urbano']
    );

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe('https://exp.host/--/api/v2/push/send');

    const body = JSON.parse(options.body);
    expect(body).toHaveLength(1);
    expect(body[0].to).toBe('ExponentPushToken[mock-chef-device-123]');
    expect(body[0].title).toBe('🍔 ¡Nuevo Pedido #D-1234!');
    expect(body[0].body).toContain('Carlos Urbano — C$350 (Delivery 🛵)');
    expect(body[0].body).toContain('2× Clásica, 1× Coca Cola 355ml');
    expect(body[0].priority).toBe('high');
    expect(body[0].channelId).toBe('pedidos');
  });

  test('elimina token obsoleto de PostgreSQL cuando Expo reporta DeviceNotRegistered', async () => {
    query.mockResolvedValueOnce({
      rows: [
        {
          push_tokens: [
            'ExponentPushToken[token-valido-1]',
            'ExponentPushToken[token-invalido-2]',
          ],
        },
      ],
    });

    const mockFetch = jest.fn().mockResolvedValueOnce({
      json: async () => ({
        data: [
          { status: 'ok', id: 'ticket-1' },
          { status: 'error', message: 'The recipient device is not registered', details: { error: 'DeviceNotRegistered' } },
        ],
      }),
    });
    global.fetch = mockFetch;

    await enviarPushAlChef('urbano', 'Título Test', 'Cuerpo Test');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    // Debe haber ejecutado un UPDATE para limpiar el token inválido
    expect(query).toHaveBeenCalledTimes(2);
    expect(query).toHaveBeenLastCalledWith(
      expect.stringContaining('UPDATE restaurantes SET push_tokens = $1'),
      [JSON.stringify(['ExponentPushToken[token-valido-1]']), 'urbano']
    );
  });

  test('no lanza error si la consulta a base de datos o Expo falla (failsafe)', async () => {
    query.mockRejectedValueOnce(new Error('Connection timeout'));

    await expect(enviarPushAlChef('urbano', 'Título', 'Cuerpo')).resolves.not.toThrow();
  });
});
