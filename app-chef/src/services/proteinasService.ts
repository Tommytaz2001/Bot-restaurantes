import { db } from './firebaseConfig';
import { doc, getDoc, setDoc } from 'firebase/firestore';

const RESTAURANTE_ID = process.env.EXPO_PUBLIC_RESTAURANTE_ID ?? 'urbano';

export type Proteina = 'pollo' | 'cerdo' | 'birria';

export async function getProteinasBloqueadas(): Promise<Proteina[]> {
  const snap = await getDoc(doc(db, 'restaurantes', RESTAURANTE_ID));
  return (snap.data()?.proteinasBloqueadas ?? []) as Proteina[];
}

export async function setProteinasBloqueadas(bloqueadas: Proteina[]): Promise<void> {
  await setDoc(doc(db, 'restaurantes', RESTAURANTE_ID), { proteinasBloqueadas: bloqueadas }, { merge: true });
}

/** Helper para calcular si un ítem está bloqueado dado el estado actual */
export function estaItemBloqueadoPorProteina(proteina: string | undefined, bloqueadas: Proteina[]): boolean {
  if (!proteina) return false;
  if (bloqueadas.includes(proteina as Proteina)) return true;
  if (proteina === 'mixto' && (bloqueadas.includes('pollo') || bloqueadas.includes('cerdo'))) return true;
  return false;
}
