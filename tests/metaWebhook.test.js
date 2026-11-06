const { handleWebhook } = require('../src/whatsapp/metaWebhook');
const { _lidToPhone, _phoneToLid } = require('../src/whatsapp/lidResolver');

jest.mock('../src/whatsapp/messageHandler', () => ({
  recibirMensaje: jest.fn().mockResolvedValue(undefined),
  verificarHorario: jest.fn().mockResolvedValue({ abierto: true }),
  enviarMensajeFueraDeHorario: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../src/whatsapp/metaSender', () => ({
  sendWhatsAppMessage: jest.fn().mockResolvedValue({ status: 'SUCCESS' }),
}));

jest.mock('../src/orders/orderService', () => ({
  findPedidoPendientePago: jest.fn().mockResolvedValue(null),
  attachComprobante: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../src/services/blacklistService', () => ({
  isBlacklisted: jest.fn().mockResolvedValue(false),
}));

jest.mock('../src/services/deployNotificationService', () => ({
  notificarDespliegue: jest.fn().mockResolvedValue({ ok: true }),
}));

const { recibirMensaje } = require('../src/whatsapp/messageHandler');

describe('metaWebhook - Procesamiento seguro y soporte @lid', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    _lidToPhone.clear();
    _phoneToLid.clear();
  });

  test('procesa mensaje estándar de WhatsApp sin errores', async () => {
    const req = {
      body: {
        event: 'messages.upsert',
        data: {
          key: {
            id: 'MSG-001',
            remoteJid: '50588888888@s.whatsapp.net',
            fromMe: false,
          },
          pushName: 'Carlos',
          message: {
            conversation: 'Hola, quiero pedir una hamburguesa',
          },
        },
      },
    };
    const res = { sendStatus: jest.fn() };

    await handleWebhook(req, res);

    expect(res.sendStatus).toHaveBeenCalledWith(200);
    expect(recibirMensaje).toHaveBeenCalledTimes(1);
    const args = recibirMensaje.mock.calls[0][0];
    expect(args.telefono).toBe('50588888888');
    expect(args.remoteJid).toBe('50588888888@s.whatsapp.net');
    expect(args.contactName).toBe('Carlos');
    expect(args.texto).toBe('Hola, quiero pedir una hamburguesa');
  });

  test('procesa mensaje @lid con senderPn sin lanzar ReferenceError de getPhoneForLid', async () => {
    const req = {
      body: {
        event: 'messages.upsert',
        data: {
          key: {
            id: 'MSG-LID-001',
            remoteJid: '267692510605433@lid',
            senderPn: '593961699586@s.whatsapp.net',
            fromMe: false,
          },
          pushName: 'Tommy',
          message: {
            conversation: 'Hola bot',
          },
        },
      },
    };
    const res = { sendStatus: jest.fn() };

    await handleWebhook(req, res);

    expect(res.sendStatus).toHaveBeenCalledWith(200);
    expect(recibirMensaje).toHaveBeenCalledTimes(1);
    const args = recibirMensaje.mock.calls[0][0];
    expect(args.telefono).toBe('593961699586');
    // Mapea replyTo a número estándar para evitar caída de socket en Baileys
    expect(args.remoteJid).toBe('593961699586@s.whatsapp.net');
    expect(args.contactName).toBe('Tommy');
    expect(args.texto).toBe('Hola bot');
  });

  test('procesa connection.update con información de estado y motivo sin fallar', async () => {
    const req = {
      body: {
        event: 'connection.update',
        data: {
          state: 'close',
          statusReason: 401,
          lastDisconnect: {
            error: {
              output: { statusCode: 401 },
              message: 'Logged Out',
            },
          },
        },
      },
    };
    const res = { sendStatus: jest.fn() };

    await expect(handleWebhook(req, res)).resolves.not.toThrow();
    expect(res.sendStatus).toHaveBeenCalledWith(200);
  });

  test('captura excepciones dentro de _processMessage sin romper el webhook', async () => {
    recibirMensaje.mockRejectedValueOnce(new Error('Fallo simulado en motor conversacional'));

    const req = {
      body: {
        event: 'messages.upsert',
        data: {
          key: {
            id: 'MSG-ERR-001',
            remoteJid: '50577777777@s.whatsapp.net',
            fromMe: false,
          },
          message: { conversation: 'Test error' },
        },
      },
    };
    const res = { sendStatus: jest.fn() };

    // Debe resolverse normalmente sin lanzar error no capturado
    await expect(handleWebhook(req, res)).resolves.not.toThrow();
    expect(res.sendStatus).toHaveBeenCalledWith(200);
  });
});

