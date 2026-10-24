const {
  parsePhoneList,
  notificarDespliegue,
  _setNotificado,
} = require('../src/services/deployNotificationService');

describe('deployNotificationService', () => {
  beforeEach(() => {
    _setNotificado(false);
  });

  describe('parsePhoneList', () => {
    test('retorna array vacío si no hay valor o está vacío', () => {
      expect(parsePhoneList(null)).toEqual([]);
      expect(parsePhoneList(undefined)).toEqual([]);
      expect(parsePhoneList('')).toEqual([]);
      expect(parsePhoneList('   ')).toEqual([]);
    });

    test('parsea un número único limpiando caracteres no numéricos', () => {
      expect(parsePhoneList('+505 8888-8888')).toEqual(['50588888888']);
    });

    test('parsea múltiples números separados por coma', () => {
      const raw = '50588888888, +505 7777-7777, 50566666666';
      expect(parsePhoneList(raw)).toEqual(['50588888888', '50577777777', '50566666666']);
    });

    test('ignora entradas con menos de 8 dígitos', () => {
      expect(parsePhoneList('123, 50588888888, abc')).toEqual(['50588888888']);
    });
  });

  describe('notificarDespliegue', () => {
    test('omite notificación si no hay teléfonos configurados', async () => {
      const res = await notificarDespliegue({ overridePhones: '' });
      expect(res.ok).toBe(false);
      expect(res.reason).toBe('no_phones_configured');
    });

    test('retorna whatsapp_not_ready si WhatsApp no está disponible y force es true', async () => {
      const mockWait = jest.fn().mockResolvedValue(false);
      const res = await notificarDespliegue({
        overridePhones: '50588888888',
        overrideWait: mockWait,
        force: true,
      });
      expect(res.ok).toBe(false);
      expect(res.reason).toBe('whatsapp_not_ready');
    });

    test('envía mensaje a cada número configurado cuando WhatsApp está listo', async () => {
      const mockWait = jest.fn().mockResolvedValue(true);
      const mockSend = jest.fn().mockResolvedValue({ id: 'msg_123' });

      const res = await notificarDespliegue({
        overridePhones: '50588888888, 50577777777',
        overrideWait: mockWait,
        overrideSend: mockSend,
      });

      expect(res.ok).toBe(true);
      expect(res.results).toHaveLength(2);
      expect(res.results[0].phone).toBe('50588888888');
      expect(res.results[1].phone).toBe('50577777777');
      expect(mockSend).toHaveBeenCalledTimes(2);
      expect(mockSend).toHaveBeenCalledWith(
        '50588888888@s.whatsapp.net',
        expect.stringContaining('Servidor en Línea')
      );
    });

    test('maneja error en un número sin abortar los demás', async () => {
      const mockWait = jest.fn().mockResolvedValue(true);
      const mockSend = jest
        .fn()
        .mockRejectedValueOnce(new Error('Evolution error 500'))
        .mockResolvedValueOnce({ id: 'msg_456' });

      const res = await notificarDespliegue({
        overridePhones: '50511111111, 50522222222',
        overrideWait: mockWait,
        overrideSend: mockSend,
      });

      expect(res.ok).toBe(true);
      expect(res.results[0].ok).toBe(false);
      expect(res.results[0].error).toBe('Evolution error 500');
      expect(res.results[1].ok).toBe(true);
    });
  });
});
