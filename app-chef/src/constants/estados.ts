import type { EstadoPedido } from '../services/pedidosService';

export const ESTADO_CONFIG: Record<EstadoPedido, { label: string; color: string; bg: string; accent: string }> = {
  pendiente:      { label: 'Pendiente',    color: '#F59E0B', bg: 'rgba(245,158,11,0.15)',  accent: '#F59E0B' },
  pendiente_pago: { label: 'Pend. Pago',   color: '#FBBF24', bg: 'rgba(251,191,36,0.15)',  accent: '#FBBF24' },
  confirmado:     { label: 'Confirmado',   color: '#34D399', bg: 'rgba(52,211,153,0.15)',  accent: '#34D399' },
  en_camino:      { label: 'En camino',    color: '#60A5FA', bg: 'rgba(96,165,250,0.15)',  accent: '#60A5FA' },
  entregado:      { label: 'Entregado',    color: '#6B7280', bg: 'rgba(107,114,128,0.15)', accent: '#6B7280' },
  cancelado:      { label: 'Cancelado',    color: '#F87171', bg: 'rgba(248,113,113,0.15)', accent: '#F87171' },
};
