import { create } from 'zustand';
import type { Pedido } from '../services/pedidosService';

interface PedidosState {
  activos: Pedido[];
  historial: Pedido[];
  setActivos: (pedidos: Pedido[]) => void;
  setHistorial: (pedidos: Pedido[]) => void;
}

export const usePedidosStore = create<PedidosState>((set) => ({
  activos: [],
  historial: [],
  setActivos: (activos) => set({ activos }),
  setHistorial: (historial) => set({ historial }),
}));
