import { useEffect } from 'react';
import { suscribirPedidosActivos, suscribirHistorial } from '../services/pedidosService';
import { usePedidosStore } from '../store/pedidosStore';

export function usePedidosActivos() {
  const setActivos = usePedidosStore((s) => s.setActivos);

  useEffect(() => {
    const unsub = suscribirPedidosActivos(setActivos);
    return unsub;
  }, []);
}

export function useHistorial() {
  const setHistorial = usePedidosStore((s) => s.setHistorial);

  useEffect(() => {
    const unsub = suscribirHistorial(setHistorial);
    return unsub;
  }, []);
}
