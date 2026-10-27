const { cleanPhoneNumber, deduplicateDigits, extractDigits } = require('../src/utils/phoneUtils');

describe('phoneUtils', () => {
  describe('extractDigits', () => {
    test('extrae solo dígitos de strings con formatos variados', () => {
      expect(extractDigits('+505 5854-4518')).toBe('50558544518');
      expect(extractDigits('(505) 8888 8888')).toBe('50588888888');
      expect(extractDigits(null)).toBe('');
      expect(extractDigits(undefined)).toBe('');
    });
  });

  describe('deduplicateDigits', () => {
    test('resuelve duplicaciones exactas de 16 dígitos (8 + 8)', () => {
      expect(deduplicateDigits('5854451858544518')).toBe('58544518');
      expect(deduplicateDigits('8888777788887777')).toBe('88887777');
    });

    test('resuelve el caso reportado por el usuario (58544518558544518)', () => {
      // 17 dígitos donde 58544518 se repite al inicio y al final
      expect(deduplicateDigits('58544518558544518')).toBe('58544518');
    });

    test('resuelve combinaciones con código de país 505 duplicado', () => {
      expect(deduplicateDigits('5055854451858544518')).toBe('58544518');
      expect(deduplicateDigits('5854451850558544518')).toBe('58544518');
    });

    test('no altera números limpios de 8 dígitos', () => {
      expect(deduplicateDigits('58544518')).toBe('58544518');
      expect(deduplicateDigits('87654321')).toBe('87654321');
      expect(deduplicateDigits('22223333')).toBe('22223333');
    });
  });

  describe('cleanPhoneNumber', () => {
    test('corrige duplicaciones directas e indirectas', () => {
      expect(cleanPhoneNumber('5854451858544518')).toBe('58544518');
      expect(cleanPhoneNumber('58544518558544518')).toBe('58544518');
      expect(cleanPhoneNumber('58544518 / 58544518')).toBe('58544518');
      expect(cleanPhoneNumber('58544518, 58544518')).toBe('58544518');
      expect(cleanPhoneNumber('58544518 58544518')).toBe('58544518');
      expect(cleanPhoneNumber('58544518 y 58544518')).toBe('58544518');
    });

    test('normaliza números de Nicaragua con código 505 a formato local de 8 dígitos', () => {
      expect(cleanPhoneNumber('50558544518')).toBe('58544518');
      expect(cleanPhoneNumber('+505 5854-4518')).toBe('58544518');
      expect(cleanPhoneNumber('+50558544518')).toBe('58544518');
    });

    test('utiliza fallbackPhone si rawPhone está vacío', () => {
      expect(cleanPhoneNumber(null, '50558544518')).toBe('58544518');
      expect(cleanPhoneNumber('', '58544518')).toBe('58544518');
      expect(cleanPhoneNumber(undefined, '+505 8888 1234')).toBe('88881234');
    });

    test('prioriza y desambigua usando fallbackPhone cuando hay repeticiones complejas', () => {
      expect(cleanPhoneNumber('58544518558544518', '50558544518')).toBe('58544518');
      expect(cleanPhoneNumber('5055854451858544518', '50558544518')).toBe('58544518');
    });

    test('preserva números alternativos válidos si el cliente indica otro teléfono distinto al de la sesión', () => {
      // Cliente escribe desde un número pero pide que le entreguen a otro
      expect(cleanPhoneNumber('87654321', '50558544518')).toBe('87654321');
    });

    test('retorna null si ambos parámetros son nulos o vacíos', () => {
      expect(cleanPhoneNumber(null, null)).toBeNull();
      expect(cleanPhoneNumber('', '')).toBeNull();
      expect(cleanPhoneNumber(undefined)).toBeNull();
    });

    test('soporta números internacionales no nicaragüenses conservando formato', () => {
      expect(cleanPhoneNumber('+1 305 555 1234')).toBe('+13055551234');
      expect(cleanPhoneNumber('+506 8765 4321')).toBe('+50687654321');
    });
  });
});
