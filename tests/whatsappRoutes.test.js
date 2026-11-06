const express = require('express');
const request = require('supertest');

const whatsappRoutes = require('../src/routes/whatsappRoutes');

describe('whatsappRoutes - Pairing Code & Connection State (Evolution API v2)', () => {
  let app;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    process.env.EVOLUTION_API_URL = 'http://localhost:6543';
    process.env.EVOLUTION_API_KEY = 'test_key';
    process.env.EVOLUTION_INSTANCE = 'bot-restaurantes';

    app = express();
    app.use(express.json());
    app.use('/whatsapp', whatsappRoutes);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test('GET /whatsapp/pairing-code devuelve 400 si falta el parámetro number', async () => {
    const res = await request(app).get('/whatsapp/pairing-code');
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Parámetro "number" requerido');
  });

  test('GET /whatsapp/pairing-code solicita código a Evolution API y lo retorna en formato limpio', async () => {
    globalThis.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        pairingCode: 'ABCD-1234',
        code: 'ABCD-1234',
      }),
    });

    const res = await request(app).get('/whatsapp/pairing-code?number=50586224206');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.pairingCode).toBe('ABCD-1234');

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const calledUrl = globalThis.fetch.mock.calls[0][0];
    expect(calledUrl).toContain('/instance/connect/bot-restaurantes?number=50586224206');
  });

  test('GET /whatsapp/connection-state reporta estado de conexión correctamente', async () => {
    globalThis.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        instance: { state: 'open' },
      }),
    });

    const res = await request(app).get('/whatsapp/connection-state');
    expect(res.status).toBe(200);
    expect(res.body.connected).toBe(true);
    expect(res.body.state).toBe('open');
  });

  test('POST /whatsapp/setup-webhook configura webhook en Evolution API', async () => {
    globalThis.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: 'SUCCESS' }),
    });

    const res = await request(app).post('/whatsapp/setup-webhook');
    expect(res.status).toBe(200);
    expect(res.body.result.ok).toBe(true);
    expect(res.body.webhookUrl).toContain('/whatsapp/webhook');
  });

  test('GET /whatsapp/check-webhook consulta estado en Evolution API', async () => {
    globalThis.fetch = jest.fn().mockResolvedValueOnce({
      status: 200,
      ok: true,
      json: async () => ({ enabled: true, url: 'http://backend:3001/whatsapp/webhook' }),
    });

    const res = await request(app).get('/whatsapp/check-webhook');
    expect(res.status).toBe(200);
    expect(res.body.info.data.enabled).toBe(true);
  });
});

