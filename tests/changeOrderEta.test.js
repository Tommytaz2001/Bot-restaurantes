const { orderEvents } = require('../src/services/orderEvents');

jest.mock('../src/db/connection', () => ({
  query: jest.fn().mockResolvedValue({ rows: [] }),
}));

jest.mock('../src/whatsapp/metaSender', () => ({
  sendWhatsAppMessage: jest.fn().mockResolvedValue({ success: true }),
}));

const { query } = require('../src/db/connection');
const { sendWhatsAppMessage } = require('../src/whatsapp/metaSender');
const { iniciarListenerNotificaciones } = require('../src/services/notificacionService');

describe('Notificaciones de cambio de pedido con nuevo tiempo estimado (ETA)', () => {
  beforeAll(() => {
    iniciarListenerNotificaciones();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('notifica al cliente con el nuevo tiempo estimado cuando el cambio es aprobado', async () => {
    const pedidoConCambio = {
      id: 'pedido-123',
      estado: 'confirmado',
      telefono: '50588888888',
      jid: '50588888888@s.whatsapp.net',
      tipo_entrega: 'delivery',
      total: 350,
      tiempo_estimado_min: 40,
      cambio_solicitado: {
        estado: 'aprobado',
        tipo: 'agregar_productos',
        descripcion: 'Agregar 1 Hamburguesa Clásica',
        nuevo_tiempo_estimado: 40,
      },
      productos: [
        { nombre: 'Hamburguesa Doble', cantidad: 1, opcion: null },
        { nombre: 'Hamburguesa Clásica', cantidad: 1, opcion: null },
      ],
      notificaciones_enviadas: { confirmado: true },
    };

    orderEvents.emit('order:updated', { pedido: pedidoConCambio });

    // Wait for async handler
    await new Promise((r) => setTimeout(r, 50));

    expect(sendWhatsAppMessage).toHaveBeenCalledTimes(1);
    const [destino, mensaje] = sendWhatsAppMessage.mock.calls[0];
    expect(destino).toBe('50588888888@s.whatsapp.net');
    expect(mensaje).toContain('Tu solicitud de cambio fue aprobada');
    expect(mensaje).toContain('Hamburguesa Clásica');
    expect(mensaje).toContain('Total: C$350');
    expect(mensaje).toContain('Nuevo tiempo estimado:* 40 minutos');
  });

  test('notifica correctamente cuando se aprueba cambio sin especificar nuevo tiempo estimado', async () => {
    const pedidoSinEta = {
      id: 'pedido-456',
      estado: 'confirmado',
      telefono: '50588888888',
      jid: '50588888888@s.whatsapp.net',
      tipo_entrega: 'delivery',
      total: 200,
      tiempo_estimado_min: null,
      cambio_solicitado: {
        estado: 'aprobado',
        tipo: 'modificacion',
        descripcion: 'Sin cebolla',
      },
      productos: [
        { nombre: 'Hamburguesa Clásica', cantidad: 1, opcion: null },
      ],
      notificaciones_enviadas: { confirmado: true },
    };

    orderEvents.emit('order:updated', { pedido: pedidoSinEta });

    await new Promise((r) => setTimeout(r, 50));

    expect(sendWhatsAppMessage).toHaveBeenCalledTimes(1);
    const [, mensaje] = sendWhatsAppMessage.mock.calls[0];
    expect(mensaje).toContain('Tu solicitud de cambio fue aprobada');
    expect(mensaje).not.toContain('Nuevo tiempo estimado');
  });
});
