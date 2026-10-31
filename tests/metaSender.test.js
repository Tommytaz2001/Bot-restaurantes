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
});

