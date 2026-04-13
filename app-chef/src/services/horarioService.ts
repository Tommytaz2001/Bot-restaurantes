import { authFetch } from './apiClient';

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

export async function getHorario(): Promise<Horario> {
  const res = await authFetch('/restaurante/horario');
  if (!res.ok) throw new Error(`getHorario failed: ${res.status}`);
  const json = await res.json();
  return json.horario as Horario;
}

export async function saveHorario(horario: Horario): Promise<void> {
  const res = await authFetch('/restaurante/horario', {
    method: 'PUT',
    body: JSON.stringify({ horario }),
  });
  if (!res.ok) throw new Error(`saveHorario failed: ${res.status}`);
}
