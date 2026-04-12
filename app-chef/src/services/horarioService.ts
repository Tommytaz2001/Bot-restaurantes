import { db } from './firebaseConfig';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { getBackendUrl } from './backendConfig';

const RESTAURANTE_ID = process.env.EXPO_PUBLIC_RESTAURANTE_ID ?? 'urbano';

export type DiaSemana = 'lunes' | 'martes' | 'miercoles' | 'jueves' | 'viernes' | 'sabado' | 'domingo';

export interface HorarioDia {
  abre: boolean;
  apertura: string; // "HH:MM"
  cierre: string;   // "HH:MM"
}

export type Horario = Record<DiaSemana, HorarioDia>;

export const DIAS: DiaSemana[] = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];

export const DIAS_LABELS: Record<DiaSemana, string> = {
  lunes:     'Lunes',
  martes:    'Martes',
  miercoles: 'Miércoles',
  jueves:    'Jueves',
  viernes:   'Viernes',
  sabado:    'Sábado',
  domingo:   'Domingo',
};

const DEFAULT_HORARIO: Horario = {
  lunes:     { abre: true,  apertura: '10:00', cierre: '22:00' },
  martes:    { abre: true,  apertura: '10:00', cierre: '22:00' },
  miercoles: { abre: true,  apertura: '10:00', cierre: '22:00' },
  jueves:    { abre: true,  apertura: '10:00', cierre: '22:00' },
  viernes:   { abre: true,  apertura: '10:00', cierre: '22:00' },
  sabado:    { abre: true,  apertura: '11:00', cierre: '23:00' },
  domingo:   { abre: false, apertura: '11:00', cierre: '21:00' },
};

export async function getHorario(): Promise<Horario> {
  const t0 = Date.now();
  console.log('[getHorario] START — reading from Firestore...');
  const snap = await getDoc(doc(db, 'restaurantes', RESTAURANTE_ID));
  console.log(`[getHorario] Firestore read done in ${Date.now() - t0}ms`);
  if (!snap.exists()) return { ...DEFAULT_HORARIO };

  const rawHorario = snap.data().horario;
  if (!rawHorario) return { ...DEFAULT_HORARIO };

  // Merge with defaults to ensure all 7 days are present
  const result: Horario = { ...DEFAULT_HORARIO };
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

export async function saveHorario(horario: Horario): Promise<void> {
  const t0 = Date.now();
  console.log('[saveHorario] START — writing to Firestore...');
  await setDoc(doc(db, 'restaurantes', RESTAURANTE_ID), { horario }, { merge: true });
  console.log(`[saveHorario] Firestore write done in ${Date.now() - t0}ms`);
  // Invalida el caché del backend (fire-and-forget con timeout de 3s)
  try {
    const backendUrl = await getBackendUrl();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    fetch(`${backendUrl}/whatsapp/cache/clear`, { method: 'POST', signal: controller.signal })
      .finally(() => clearTimeout(timeout));
  } catch {
    // No crítico — el caché expira solo en 5 minutos
  }
  console.log(`[saveHorario] TOTAL ${Date.now() - t0}ms`);
}
