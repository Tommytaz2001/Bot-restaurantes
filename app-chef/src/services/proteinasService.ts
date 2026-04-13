import { authFetch } from './apiClient';

export type Proteina = 'pollo' | 'cerdo' | 'birria';

export async function getProteinasBloqueadas(): Promise<Proteina[]> {
  const res = await authFetch('/restaurante/proteinas');
  if (!res.ok) throw new Error(`getProteinasBloqueadas failed: ${res.status}`);
  const json = await res.json();
  return json.proteinasBloqueadas as Proteina[];
}

export async function setProteinasBloqueadas(bloqueadas: Proteina[]): Promise<void> {
  const res = await authFetch('/restaurante/proteinas', {
    method: 'PUT',
    body: JSON.stringify({ proteinasBloqueadas: bloqueadas }),
  });
  if (!res.ok) throw new Error(`setProteinasBloqueadas failed: ${res.status}`);
}

/** Helper para calcular si un ítem está bloqueado dado el estado actual */
export function estaItemBloqueadoPorProteina(proteina: string | undefined, bloqueadas: Proteina[]): boolean {
  if (!proteina) return false;
  if (bloqueadas.includes(proteina as Proteina)) return true;
  if (proteina === 'mixto' && (bloqueadas.includes('pollo') || bloqueadas.includes('cerdo'))) return true;
  return false;
}
