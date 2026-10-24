const {
  cacheLidMapping,
  getPhoneForLid,
  getLidForPhone,
  resolveLid,
  _lidToPhone,
  _phoneToLid,
} = require('../src/whatsapp/lidResolver');

describe('lidResolver', () => {
  beforeEach(() => {
    _lidToPhone.clear();
    _phoneToLid.clear();
    process.env.EVOLUTION_API_URL = 'http://localhost:6543';
    process.env.EVOLUTION_API_KEY = 'test_key';
    process.env.EVOLUTION_INSTANCE = 'test_inst';
  });

  test('almacena y recupera mapeos en caché en ambos sentidos', () => {
    cacheLidMapping('229712898017378@lid', '50588888888');

    expect(getPhoneForLid('229712898017378@lid')).toBe('50588888888');
    expect(getPhoneForLid('229712898017378')).toBe('50588888888');
    expect(getLidForPhone('50588888888')).toBe('229712898017378@lid');
  });

  test('resolveLid devuelve valor desde caché inmediatamente', async () => {
    cacheLidMapping('142262755422333@lid', '50577777777');
    const mockFetch = jest.fn();

    const phone = await resolveLid('142262755422333@lid', mockFetch);
    expect(phone).toBe('50577777777');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test('resolveLid resuelve vía endpoint /contact/profile', async () => {
    const mockFetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ number: '50566666666' }),
    });

    const phone = await resolveLid('234823841974299@lid', mockFetch);
    expect(phone).toBe('50566666666');
    expect(getPhoneForLid('234823841974299@lid')).toBe('50566666666');
  });

  test('resolveLid resuelve vía endpoint /chat/findContacts si profile falla', async () => {
    const mockFetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [{ id: '50555555555@s.whatsapp.net', lid: '999888777666555@lid' }],
      });

    const phone = await resolveLid('999888777666555@lid', mockFetch);
    expect(phone).toBe('50555555555');
    expect(getPhoneForLid('999888777666555@lid')).toBe('50555555555');
  });

  test('resolveLid retorna null si no encuentra coincidencias', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
    });

    const phone = await resolveLid('000000000000000@lid', mockFetch);
    expect(phone).toBeNull();
  });
});
