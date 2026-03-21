const request = require('supertest');
const app = require('../index');

const SESSION_ID = 'e2e-test-' + Date.now();
const RESTAURANTE_ID = 'urbano';

function post(message, telefono) {
  return request(app)
    .post('/chat')
    .send({ message, sessionId: SESSION_ID, restauranteId: RESTAURANTE_ID, telefono });
}

describe('E2E: POST /chat y GET /orders/:id', () => {
  test('responde al saludo', async () => {
    const res = await post('hola');
    expect(res.status).toBe(200);
    expect(res.body.reply).toBeDefined();
    expect(res.body.order).toBeNull();
  }, 30000);

  test('retorna 400 si falta restauranteId', async () => {
    const res = await request(app)
      .post('/chat')
      .send({ message: 'hola', sessionId: 'x' });
    expect(res.status).toBe(400);
  });

  test('retorna 404 para restaurante inexistente', async () => {
    const res = await request(app)
      .post('/chat')
      .send({ message: 'hola', sessionId: 'x', restauranteId: 'no-existe' });
    expect(res.status).toBe(404);
  }, 15000);

  test('GET /orders/:id retorna 404 para id inexistente', async () => {
    const res = await request(app).get('/orders/id-que-no-existe-xyz');
    expect(res.status).toBe(404);
  }, 10000);
});
