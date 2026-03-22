import type { EstadoPedido } from '../services/pedidosService';

export const ESTADO_CONFIG: Record<EstadoPedido, { label: string; color: string; bg: string }> = {
  pendiente:      { label: 'Pendiente',      color: '#FF9500', bg: '#3d2800' },
  pendiente_pago: { label: 'Pend. Pago',     color: '#FFD60A', bg: '#2d2700' },
  confirmado:     { label: 'Confirmado',      color: '#30D158', bg: '#0d2e18' },
  en_camino:      { label: 'En camino',       color: '#64D2FF', bg: '#0a2535' },
  entregado:      { label: 'Entregado',       color: '#98989D', bg: '#1c1c1e' },
  cancelado:      { label: 'Cancelado',       color: '#FF453A', bg: '#2d0a09' },
};
