const { query } = require('../db/connection');
const { clearMenuCache } = require('./menuService');

const RESTAURANTE_ID = process.env.RESTAURANTE_ID ?? 'urbano';

const DEFAULT_HORARIO = {
  lunes:     { abre: true,  apertura: '17:00', cierre: '23:00' },
  martes:    { abre: true,  apertura: '17:00', cierre: '23:00' },
  miercoles: { abre: true,  apertura: '17:00', cierre: '23:00' },
  jueves:    { abre: true,  apertura: '17:00', cierre: '23:00' },
  viernes:   { abre: true,  apertura: '17:00', cierre: '23:59' },
  sabado:    { abre: true,  apertura: '17:00', cierre: '23:59' },
  domingo:   { abre: true,  apertura: '17:00', cierre: '23:00' },
};

async function getHorario() {
  const res = await query('SELECT horario FROM restaurantes WHERE id = $1', [RESTAURANTE_ID]);
  if (res.rows.length === 0 || !res.rows[0].horario) {
    return { ...DEFAULT_HORARIO };
  }
  return { ...DEFAULT_HORARIO, ...res.rows[0].horario };
}

async function saveHorario(horario) {
  await query(
    'UPDATE restaurantes SET horario = $1, updated_at = NOW() WHERE id = $2',
    [JSON.stringify(horario), RESTAURANTE_ID]
  );
  clearMenuCache();
}

async function getProteinasBloqueadas() {
  const res = await query('SELECT proteinas_bloqueadas FROM restaurantes WHERE id = $1', [RESTAURANTE_ID]);
  if (res.rows.length === 0 || !res.rows[0].proteinas_bloqueadas) {
    return [];
  }
  return res.rows[0].proteinas_bloqueadas;
}

async function setProteinasBloqueadas(bloqueadas) {
  await query(
    'UPDATE restaurantes SET proteinas_bloqueadas = $1, updated_at = NOW() WHERE id = $2',
    [JSON.stringify(bloqueadas || []), RESTAURANTE_ID]
  );
  clearMenuCache();
}

async function registerPushToken(token) {
  if (!token || typeof token !== 'string') return false;
  try {
    const res = await query('SELECT push_tokens FROM restaurantes WHERE id = $1', [RESTAURANTE_ID]);
    let tokens = [];
    if (res.rows.length > 0 && Array.isArray(res.rows[0].push_tokens)) {
      tokens = res.rows[0].push_tokens;
    }
    if (!tokens.includes(token)) {
      tokens.push(token);
      await query(
        'UPDATE restaurantes SET push_tokens = $1, updated_at = NOW() WHERE id = $2',
        [JSON.stringify(tokens), RESTAURANTE_ID]
      );
      console.log(`[restauranteService] Push token registrado para ${RESTAURANTE_ID}:`, token.substring(0, 30) + '...');
    }
    return true;
  } catch (err) {
    console.warn('[restauranteService] Error registrando push token:', err.message);
    return false;
  }
}

module.exports = {
  getHorario,
  saveHorario,
  getProteinasBloqueadas,
  setProteinasBloqueadas,
  registerPushToken,
};
