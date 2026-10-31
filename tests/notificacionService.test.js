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

describe('notificacionService - Confirmación de cocina y entrega de mensajes', () => {
  beforeAll(() => {
    iniciarListenerNotificaciones();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('envía SMS/WhatsApp de confirmación con ETA cuando el chef confirma en cocina', async () => {
    const pedidoConfirmado = {
      id: 'pedido-martin-1',
      estado: 'confirmado',
      telefono: '86224206',
      jid: '50586224206@s.whatsapp.net',
      tipo_entrega: 'delivery',
      tiempo_estimado_min: 20,
      total: 240,
      notificaciones_enviadas: {},
    };

    orderEvents.emit('order:updated', { pedido: pedidoConfirmado });
    await new Promise((r) => setTimeout(r, 60));

    expect(sendWhatsAppMessage).toHaveBeenCalledTimes(1);
    const [destino, mensaje] = sendWhatsAppMessage.mock.calls[0];
    expect(destino).toBe('50586224206@s.whatsapp.net');
    expect(mensaje).toContain('¡Tu pedido fue confirmado!');
    expect(mensaje).toContain('Tiempo estimado: *20 minutos*');

    // Debe actualizar notificaciones_enviadas en la base de datos
    expect(query).toHaveBeenCalledWith(
      'UPDATE pedidos SET notificaciones_enviadas = $1 WHERE id = $2',
      [JSON.stringify({ confirmado: true }), 'pedido-martin-1']
    );
  });

  test('resuelve destino con prefijo 505 cuando pedido no tiene JID y solo tiene teléfono de 8 dígitos', async () => {
    const pedidoSinJid = {
      id: 'pedido-local-1',
      estado: 'confirmado',
      telefono: '86224206',
      jid: null,
      tipo_entrega: 'delivery',
      tiempo_estimado_min: 25,
      total: 200,
      notificaciones_enviadas: {},
    };

    orderEvents.emit('order:updated', { pedido: pedidoSinJid });
    await new Promise((r) => setTimeout(r, 60));

    expect(sendWhatsAppMessage).toHaveBeenCalledTimes(1);
    const [destino, mensaje] = sendWhatsAppMessage.mock.calls[0];
    expect(destino).toBe('50586224206@s.whatsapp.net');
    expect(mensaje).toContain('Tiempo estimado: *25 minutos*');
  });

  test('no actualiza la BD como enviada si sendWhatsAppMessage falla (permite reintento)', async () => {
    sendWhatsAppMessage.mockRejectedValueOnce(new Error('Network / Evolution API timeout'));

    const pedidoFallo = {
      id: 'pedido-fallo-1',
      estado: 'confirmado',
      telefono: '86224206',
      jid: '50586224206@s.whatsapp.net',
      tipo_entrega: 'delivery',
      tiempo_estimado_min: 15,
      notificaciones_enviadas: {},
    };

    orderEvents.emit('order:updated', { pedido: pedidoFallo });
    await new Promise((r) => setTimeout(r, 60));

    expect(sendWhatsAppMessage).toHaveBeenCalledTimes(1);
    // Dado que el envío falló, NO se debió haber actualizado notificaciones_enviadas en la BD
    expect(query).not.toHaveBeenCalledWith(
      expect.stringContaining('UPDATE pedidos SET notificaciones_enviadas'),
      expect.anything()
    );
  });
});

