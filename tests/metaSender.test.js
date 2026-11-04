const { sendWhatsAppMessage } = require('../src/whatsapp/metaSender');
const { cacheLidMapping, _lidToPhone, _phoneToLid } = require('../src/whatsapp/lidResolver');

describe('metaSender and LID destination preservation', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    _lidToPhone.clear();
    _phoneToLid.clear();
    process.env.EVOLUTION_API_URL = 'http://localhost:6543';
    process.env.EVOLUTION_API_KEY = 'test_key';
    process.env.EVOLUTION_INSTANCE = 'bot-restaurantes';
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test('preserva el JID con formato @lid al enviar y NO lo muta a @s.whatsapp.net aunque esté en caché', async () => {
    // Simulamos que el @lid está asociado a un teléfono en caché
    cacheLidMapping('229712898017378@lid', '50558544518');

    let capturedBody = null;
    globalThis.fetch = jest.fn().mockImplementation(async (url, opts) => {
      capturedBody = JSON.parse(opts.body);
      return {
        ok: true,
        json: async () => ({ status: 'SUCCESS' }),
      };
    });

    const res = await sendWhatsAppMessage('229712898017378@lid', 'Hola desde el bot');

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(capturedBody).toBeDefined();
    // Destino DEBE ser el @lid exacto para no romper el cifrado E2EE en el cliente
    expect(capturedBody.number).toBe('229712898017378@lid');
    expect(capturedBody.number).not.toContain('@s.whatsapp.net');
    expect(res).toEqual({ status: 'SUCCESS' });
  });

  test('preserva el JID estándar @s.whatsapp.net al enviar', async () => {
    let capturedBody = null;
    globalThis.fetch = jest.fn().mockImplementation(async (url, opts) => {
      capturedBody = JSON.parse(opts.body);
      return {
        ok: true,
        json: async () => ({ status: 'SUCCESS' }),
      };
    });

    await sendWhatsAppMessage('50588888888@s.whatsapp.net', 'Notificación');
    expect(capturedBody.number).toBe('50588888888@s.whatsapp.net');
  });

  test('preserva números telefónicos limpios sin JID', async () => {
    let capturedBody = null;
    globalThis.fetch = jest.fn().mockImplementation(async (url, opts) => {
      capturedBody = JSON.parse(opts.body);
      return {
        ok: true,
        json: async () => ({ status: 'SUCCESS' }),
      };
    });

    await sendWhatsAppMessage('50577777777', 'Mensaje directo');
    expect(capturedBody.number).toBe('50577777777');
  });

  test('antepone prefijo 505 a números de 8 dígitos de Nicaragua', async () => {
    let capturedBody = null;
    globalThis.fetch = jest.fn().mockImplementation(async (url, opts) => {
      capturedBody = JSON.parse(opts.body);
      return {
        ok: true,
        json: async () => ({ status: 'SUCCESS' }),
      };
    });

    await sendWhatsAppMessage('86224206', 'Mensaje a número local');
    expect(capturedBody.number).toBe('50586224206');
  });

  test('limpia prefijo + y caracteres no numéricos en números sin JID', async () => {
    let capturedBody = null;
    globalThis.fetch = jest.fn().mockImplementation(async (url, opts) => {
      capturedBody = JSON.parse(opts.body);
      return {
        ok: true,
        json: async () => ({ status: 'SUCCESS' }),
      };
    });

    await sendWhatsAppMessage('+505 8622-4206', 'Mensaje formateado');
    expect(capturedBody.number).toBe('50586224206');
  });

  test('reintenta ante error transitorio Connection Closed y tiene éxito en el reintento', async () => {
    let callCount = 0;
    const capturedBodies = [];

    globalThis.fetch = jest.fn().mockImplementation(async (url, opts) => {
      callCount++;
      capturedBodies.push(JSON.parse(opts.body));
      if (callCount === 1) {
        return {
          ok: false,
          status: 400,
          json: async () => ({ status: 400, error: 'Bad Request', response: { message: ['Error: Connection Closed'] } }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ status: 'SUCCESS_ON_RETRY' }),
      };
    });

    const res = await sendWhatsAppMessage('50588888888@s.whatsapp.net', 'Mensaje tras reconexión', {
      maxAttempts: 3,
      retryDelays: [10, 20],
    });

    expect(callCount).toBe(2);
    expect(res).toEqual({ status: 'SUCCESS_ON_RETRY' });
    expect(capturedBodies[0].number).toBe('50588888888@s.whatsapp.net');
    expect(capturedBodies[1].number).toBe('50588888888@s.whatsapp.net');
  });

  test('realiza fallback automático a número telefónico si envío a @lid falla con not-acceptable', async () => {
    cacheLidMapping('229712898017378@lid', '50558544518');

    let callCount = 0;
    const destinations = [];

    globalThis.fetch = jest.fn().mockImplementation(async (url, opts) => {
      callCount++;
      const body = JSON.parse(opts.body);
      destinations.push(body.number);

      if (callCount === 1) {
        return {
          ok: false,
          status: 400,
          json: async () => ({ status: 400, error: 'Bad Request', response: { message: ['Error: not-acceptable'] } }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ status: 'SUCCESS_FALLBACK' }),
      };
    });

    const res = await sendWhatsAppMessage('229712898017378@lid', 'Hola cliente', {
      maxAttempts: 3,
      retryDelays: [10, 20],
    });

    expect(callCount).toBe(2);
    expect(destinations[0]).toBe('229712898017378@lid'); // Primero intentó @lid
    expect(destinations[1]).toBe('50558544518@s.whatsapp.net'); // Fallback a número resuelto
    expect(res).toEqual({ status: 'SUCCESS_FALLBACK' });
  });

  test('lanza el error si se agotan todos los reintentos en fallas transitorias', async () => {
    globalThis.fetch = jest.fn().mockImplementation(async () => {
      return {
        ok: false,
        status: 500,
        json: async () => ({ message: 'Internal Server Error' }),
      };
    });

    await expect(sendWhatsAppMessage('50588888888', 'Hola', {
      maxAttempts: 2,
      retryDelays: [10],
    })).rejects.toThrow('Evolution API error 500');

    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });
});

