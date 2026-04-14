import { useEffect } from 'react';
import { suscribirPedidosActivos, suscribirHistorial } from '../services/pedidosService';
import { usePedidosStore } from '../store/pedidosStore';
import { useAuthStore } from '../store/authStore';

export function usePedidosActivos() {
  const setActivos = usePedidosStore((s) => s.setActivos);
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    if (!user) return;
    const unsub = suscribirPedidosActivos(setActivos);
    return unsub;
  }, [user]);
}

export function useHistorial() {
  const setHistorial = usePedidosStore((s) => s.setHistorial);
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    if (!user) return;
    const unsub = suscribirHistorial(setHistorial);
    return unsub;
  }, [user]);
}
