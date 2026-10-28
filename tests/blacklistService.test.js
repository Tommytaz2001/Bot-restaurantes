// Mock the database connection before requiring the service
jest.mock('../src/db/connection', () => {
  const inMemoryBlacklist = [];
  return {
    query: jest.fn(async (sql, params) => {
      // Mock CREATE TABLE
      if (sql.includes('CREATE TABLE') || sql.includes('CREATE INDEX')) {
        return { rows: [] };
      }

      // Mock SELECT
      if (sql.includes('SELECT') && sql.includes('lista_negra')) {
        if (params && params.length === 2 && sql.includes('telefono_clean = $2')) {
          const found = inMemoryBlacklist.filter(
            (item) => item.restaurante_id === params[0] && item.telefono_clean === params[1]
          );
          return { rows: found };
        }
        const filtered = params ? inMemoryBlacklist.filter((i) => i.restaurante_id === params[0]) : inMemoryBlacklist;
        return { rows: filtered };
      }

      // Mock INSERT
      if (sql.includes('INSERT INTO lista_negra')) {
        const [restaurante_id, telefono, telefono_clean, nombre, motivo] = params;
        const record = {
          id: 'test-uuid-' + Math.random().toString(36).substring(7),
          restaurante_id,
          telefono,
          telefono_clean,
          nombre,
          motivo,
          created_at: new Date().toISOString(),
        };
        inMemoryBlacklist.push(record);
        return { rows: [record] };
      }

      // Mock DELETE
      if (sql.includes('DELETE FROM lista_negra')) {
        const [id, restaurante_id] = params;
        const idx = inMemoryBlacklist.findIndex(
          (item) => item.id === id && item.restaurante_id === restaurante_id
        );
        if (idx !== -1) inMemoryBlacklist.splice(idx, 1);
        return { rows: [] };
      }

      return { rows: [] };
    }),
  };
});

const {
  cleanDigits,
  isBlacklisted,
  getBlacklist,
  addBlacklist,
  removeBlacklist,
  clearCache,
} = require('../src/services/blacklistService');

describe('blacklistService', () => {
  beforeEach(() => {
    clearCache();
  });

  describe('cleanDigits', () => {
    test('extrae solo dígitos de números y JIDs de WhatsApp', () => {
      expect(cleanDigits('+505 8888 8888')).toBe('50588888888');
      expect(cleanDigits('50588888888@s.whatsapp.net')).toBe('50588888888');
      expect(cleanDigits('+593 99 123 4567')).toBe('593991234567');
      expect(cleanDigits(null)).toBe('');
      expect(cleanDigits(undefined)).toBe('');
    });
  });

  describe('addBlacklist y isBlacklisted', () => {
    test('bloquea números ingresados con formato internacional y detecta mensajes entrantes', async () => {
      await addBlacklist({
        restauranteId: 'urbano',
        telefono: '+505 8888 8888',
        nombre: 'Repartidor Carlos',
        motivo: 'Delivery',
      });

      // Debe detectar con formato limpio
      expect(await isBlacklisted('50588888888', 'urbano')).toBe(true);
      // Debe detectar con JID
      expect(await isBlacklisted('50588888888@s.whatsapp.net', 'urbano')).toBe(true);
      // Debe detectar formato local de 8 dígitos
      expect(await isBlacklisted('88888888', 'urbano')).toBe(true);
    });

    test('bloquea números ingresados sin código de país (8 dígitos) y detecta llamadas con +505', async () => {
      await addBlacklist({
        restauranteId: 'urbano',
        telefono: '87654321',
        nombre: 'Moto Mandados',
        motivo: 'Mandados',
      });

      // El mensaje entrante viene con código internacional de WhatsApp 50587654321
      expect(await isBlacklisted('50587654321@s.whatsapp.net', 'urbano')).toBe(true);
      expect(await isBlacklisted('50587654321', 'urbano')).toBe(true);
      expect(await isBlacklisted('87654321', 'urbano')).toBe(true);
    });

    test('bloquea números internacionales como Ecuador (+593)', async () => {
      await addBlacklist({
        restauranteId: 'urbano',
        telefono: '+593 98 765 4321',
        nombre: 'Repartidor Ecuador',
        motivo: 'Repartidor',
      });

      expect(await isBlacklisted('593987654321@s.whatsapp.net', 'urbano')).toBe(true);
      expect(await isBlacklisted('593987654321', 'urbano')).toBe(true);
    });

    test('NO bloquea a clientes legítimos que no están en la lista', async () => {
      expect(await isBlacklisted('50577777777', 'urbano')).toBe(false);
      expect(await isBlacklisted('50589999999@s.whatsapp.net', 'urbano')).toBe(false);
    });

    test('removeBlacklist desactiva el bloqueo inmediatamente', async () => {
      const item = await addBlacklist({
        restauranteId: 'urbano',
        telefono: '+505 8123 4567',
        nombre: 'Temporal',
        motivo: 'Prueba',
      });

      expect(await isBlacklisted('50581234567', 'urbano')).toBe(true);

      await removeBlacklist(item.id, 'urbano');

      expect(await isBlacklisted('50581234567', 'urbano')).toBe(false);
    });

    test('rechaza teléfonos con menos de 7 dígitos', async () => {
      await expect(
        addBlacklist({ restauranteId: 'urbano', telefono: '12345' })
      ).rejects.toThrow('El número debe tener al menos 7 dígitos');
    });
  });
});
