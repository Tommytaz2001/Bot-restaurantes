const { db, trackWrite, trackRead } = require('./firebaseService');
const { doc, getDoc, setDoc } = require('firebase/firestore');
const { clearMenuCache } = require('./menuService');

const RESTAURANTE_ID = process.env.RESTAURANTE_ID ?? 'urbano';

const DIAS = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];

const DEFAULT_HORARIO = {
  lunes:     { abre: true,  apertura: '10:00', cierre: '22:00' },
  martes:    { abre: true,  apertura: '10:00', cierre: '22:00' },
  miercoles: { abre: true,  apertura: '10:00', cierre: '22:00' },
  jueves:    { abre: true,  apertura: '10:00', cierre: '22:00' },
  viernes:   { abre: true,  apertura: '10:00', cierre: '22:00' },
  sabado:    { abre: true,  apertura: '11:00', cierre: '23:00' },
  domingo:   { abre: false, apertura: '11:00', cierre: '21:00' },
};

// ─── Horario ──────────────────────────────────────────────────────────────────

async function getHorario() {
  trackRead('restauranteService:getHorario');
  const snap = await getDoc(doc(db, 'restaurantes', RESTAURANTE_ID));
  if (!snap.exists()) return { ...DEFAULT_HORARIO };

  const rawHorario = snap.data().horario;
  if (!rawHorario) return { ...DEFAULT_HORARIO };

  // Merge con defaults para garantizar los 7 días
  const result = { ...DEFAULT_HORARIO };
  for (const dia of DIAS) {
    if (rawHorario[dia]) {
      result[dia] = {
        abre:     rawHorario[dia].abre     ?? true,
        apertura: rawHorario[dia].apertura ?? '10:00',
        cierre:   rawHorario[dia].cierre   ?? '22:00',
      };
    }
  }
  return result;
}

async function saveHorario(horario) {
  trackWrite('restauranteService:saveHorario');
  await setDoc(doc(db, 'restaurantes', RESTAURANTE_ID), { horario }, { merge: true });
  clearMenuCache();
}

// ─── Proteinas ────────────────────────────────────────────────────────────────

async function getProteinasBloqueadas() {
  trackRead('restauranteService:getProteinasBloqueadas');
  const snap = await getDoc(doc(db, 'restaurantes', RESTAURANTE_ID));
  return snap.data()?.proteinasBloqueadas ?? [];
}

async function setProteinasBloqueadas(bloqueadas) {
  trackWrite('restauranteService:setProteinasBloqueadas');
  await setDoc(doc(db, 'restaurantes', RESTAURANTE_ID), { proteinasBloqueadas: bloqueadas }, { merge: true });
  clearMenuCache();
}

// ─── Push token ───────────────────────────────────────────────────────────────

async function registerPushToken(token) {
  trackRead('restauranteService:registerPushToken');
  const snap = await getDoc(doc(db, 'restaurantes', RESTAURANTE_ID));
  if (snap.data()?.push_token === token) return;
  trackWrite('restauranteService:registerPushToken');
  await setDoc(doc(db, 'restaurantes', RESTAURANTE_ID), { push_token: token }, { merge: true });
}

module.exports = {
  getHorario,
  saveHorario,
  getProteinasBloqueadas,
  setProteinasBloqueadas,
  registerPushToken,
};
