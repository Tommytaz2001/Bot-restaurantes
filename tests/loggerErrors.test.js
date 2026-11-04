const fs = require('fs');
const path = require('path');
const express = require('express');
const request = require('supertest');
const { getErrorLogs, ERROR_LOG_FILE, trimFileIfNeeded } = require('../src/utils/logger');
const logRoutes = require('../src/routes/logRoutes');

describe('Dedicated Error Logging System', () => {
  const originalEnvUser = process.env.LOGS_USER;
  const originalEnvPass = process.env.LOGS_PASSWORD;
  const testDir = path.join(__dirname, '../data');

  beforeAll(() => {
    process.env.LOGS_USER = 'testadmin';
    process.env.LOGS_PASSWORD = 'testpassword';
  });

  afterAll(() => {
    process.env.LOGS_USER = originalEnvUser;
    process.env.LOGS_PASSWORD = originalEnvPass;
  });

  test('console.error guarda los errores de forma persistente en errors.ndjson con stack trace', () => {
    const errorTestMsg = `Error de prueba unitaria - ${Date.now()}`;
    const testErr = new Error('Fallo simulado para registro');

    console.error(errorTestMsg, testErr);

    const errors = getErrorLogs(50);
    const found = errors.find(e => e.msg && e.msg.includes(errorTestMsg));

    expect(found).toBeDefined();
    expect(found.msg).toContain(errorTestMsg);
    expect(found.stack).toBeDefined();
    expect(found.stack).toContain('Fallo simulado para registro');
  });

  test('trimFileIfNeeded no vacía el archivo a cero sino que conserva los bytes más recientes', () => {
    const tempFile = path.join(testDir, `test_trim_${Date.now()}.ndjson`);
    const line = JSON.stringify({ ts: '2026-01-01T00:00:00Z', msg: 'Mensaje de relleno para superar limite' }) + '\n';
    // Crear un archivo de 20 KB
    fs.writeFileSync(tempFile, line.repeat(250), 'utf8');

    const initialStat = fs.statSync(tempFile);
    expect(initialStat.size).toBeGreaterThan(10000);

    // Truncar con un maxBytes de 10000 y keepBytes de 5000
    trimFileIfNeeded(tempFile, 10000, 5000);

    const postStat = fs.statSync(tempFile);
    expect(postStat.size).toBeGreaterThan(0);
    expect(postStat.size).toBeLessThanOrEqual(5000);

    // Limpiar archivo temporal
    try { fs.unlinkSync(tempFile); } catch {}
  });

  describe('Rutas HTTP de errores (/logs/errors)', () => {
    let app;

    beforeEach(() => {
      app = express();
      app.use(express.json());
      app.use(require('cookie-parser')('secret_test'));
      app.use('/logs', logRoutes);
    });

    test('GET /logs/errors/data bloquea acceso sin sesión válida (401)', async () => {
      const res = await request(app).get('/logs/errors/data');
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('No autorizado');
    });

    test('GET /logs/errors/data con auth retorna lista de errores en formato JSON', async () => {
      const res = await request(app).get('/logs/errors/data?auth=testadmin');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    test('GET /logs/errors/download permite descargar archivo de texto con cabecera attachment', async () => {
      const res = await request(app).get('/logs/errors/download?auth=testadmin');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/plain');
      expect(res.headers['content-disposition']).toContain('attachment; filename="errores-bot-restaurantes.txt"');
      expect(typeof res.text).toBe('string');
    });
  });
});
