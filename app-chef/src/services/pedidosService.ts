import { db } from './firebaseConfig';
import {
  collection,
  doc,
  updateDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  serverTimestamp,
  type Unsubscribe,
} from 'firebase/firestore';

export type EstadoPedido =
  | 'pendiente'
  | 'pendiente_pago'
  | 'confirmado'
  | 'en_camino'
  | 'entregado'
  | 'cancelado';

export interface Producto {
  nombre: string;
  cantidad: number;
  opcion?: string | null;
}

export interface CambioSolicitado {
  descripcion: string;
  estado: 'pendiente_chef' | 'aprobado' | 'rechazado';
  solicitadoAt: any;
  respondidoAt?: any;
}

export interface Pedido {
  id: string;
  cliente: string;
  telefono: string;
  direccion: string;
  productos: Producto[];
  total: number;
  metodo_pago: 'transferencia' | 'efectivo';
  estado: EstadoPedido;
  moneda: string;
  restauranteId: string;
  comprobante_url: string | null;
  createdAt: any;
  cambio_solicitado?: CambioSolicitado;
}

const ESTADOS_ACTIVOS: EstadoPedido[] = ['pendiente', 'pendiente_pago', 'confirmado', 'en_camino'];
const RESTAURANTE_ID = process.env.EXPO_PUBLIC_RESTAURANTE_ID ?? 'urbano';

export function suscribirPedidosActivos(
  callback: (pedidos: Pedido[]) => void
): Unsubscribe {
  const q = query(
    collection(db, 'pedidos'),
    where('restauranteId', '==', RESTAURANTE_ID),
    where('estado', 'in', ESTADOS_ACTIVOS),
    orderBy('createdAt', 'desc')
  );

  return onSnapshot(q, (snapshot) => {
    const pedidos = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Pedido));
    callback(pedidos);
  });
}

export function suscribirHistorial(
  callback: (pedidos: Pedido[]) => void
): Unsubscribe {
  const q = query(
    collection(db, 'pedidos'),
    where('restauranteId', '==', RESTAURANTE_ID),
    where('estado', 'in', ['entregado', 'cancelado']),
    orderBy('createdAt', 'desc')
  );

  return onSnapshot(q, (snapshot) => {
    const pedidos = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Pedido));
    callback(pedidos);
  });
}

async function actualizarEstado(id: string, data: Record<string, any>) {
  await updateDoc(doc(db, 'pedidos', id), data);
}

export const confirmarPedido = (id: string) =>
  actualizarEstado(id, { estado: 'confirmado' });

export const marcarEnCamino = (id: string) =>
  actualizarEstado(id, { estado: 'en_camino' });

export const marcarEntregado = (id: string) =>
  actualizarEstado(id, { estado: 'entregado', entregadoAt: serverTimestamp() });

export const rechazarPedido = (id: string) =>
  actualizarEstado(id, { estado: 'cancelado', canceladoAt: serverTimestamp() });

export const aprobarCambio = (id: string) =>
  actualizarEstado(id, {
    'cambio_solicitado.estado': 'aprobado',
    'cambio_solicitado.respondidoAt': serverTimestamp(),
  });

export const rechazarCambio = (id: string) =>
  actualizarEstado(id, {
    'cambio_solicitado.estado': 'rechazado',
    'cambio_solicitado.respondidoAt': serverTimestamp(),
  });
