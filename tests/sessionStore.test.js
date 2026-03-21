const { getSession, addMessage, clearExpiredSessions, _sessions } = require('../src/agent/sessionStore');

describe('sessionStore', () => {
  beforeEach(() => clearExpiredSessions(true)); // limpiar todo

  test('retorna array vacío para sesión nueva', () => {
    const messages = getSession('nueva-sesion');
    expect(messages).toEqual([]);
  });

  test('agrega mensajes y los devuelve en orden', () => {
    addMessage('s1', { role: 'user', content: 'hola' });
    addMessage('s1', { role: 'assistant', content: 'bienvenido' });
    const messages = getSession('s1');
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe('user');
  });

  test('trunca al llegar a 50 mensajes — nunca supera el límite', () => {
    for (let i = 0; i < 52; i++) {
      addMessage('s2', { role: i % 2 === 0 ? 'user' : 'assistant', content: `msg ${i}` });
    }
    const messages = getSession('s2');
    expect(messages.length).toBe(50);
  });

  test('clearExpiredSessions elimina sesiones con TTL vencido', () => {
    addMessage('vieja', { role: 'user', content: 'test' });
    // Use already-imported _sessions (same module reference, not a new require)
    _sessions.get('vieja').lastActivity = Date.now() - (31 * 60 * 1000);
    clearExpiredSessions();
    expect(getSession('vieja')).toEqual([]);
  });
});
