import { db, auth } from './firebaseConfig';
import {
  collection,
  doc,
  updateDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  getDocs,
  Timestamp,
  serverTimestamp,
  type Unsubscribe,
  type QueryDocumentSnapshot,
  type DocumentData,
  type QueryConstraint,
} from 'firebase/firestore';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL ?? '';

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
  tipo_entrega?: 'delivery' | 'retiro';
  costo_envio?: number;
}

const ESTADOS_ACTIVOS: EstadoPedido[] = ['pendiente', 'pendiente_pago', 'confirmado', 'en_camino'];
const RESTAURANTE_ID = process.env.EXPO_PUBLIC_RESTAURANTE_ID ?? 'urbano';

function sortByCreatedAtDesc(pedidos: Pedido[]): Pedido[] {
  return pedidos.sort((a, b) => {
    const at = (a.createdAt as any)?.seconds ?? 0;
    const bt = (b.createdAt as any)?.seconds ?? 0;
    return bt - at;
  });
}

export function suscribirPedidosActivos(
  callback: (pedidos: Pedido[]) => void
): Unsubscribe {
  const q = query(
    collection(db, 'pedidos'),
    where('restauranteId', '==', RESTAURANTE_ID),
    where('estado', 'in', ESTADOS_ACTIVOS),
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const pedidos = sortByCreatedAtDesc(
        snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Pedido))
      );
      callback(pedidos);
    },
    (err) => console.error('[Firestore] suscribirPedidosActivos error:', err.message),
  );
}

export function suscribirHistorial(
  callback: (pedidos: Pedido[]) => void
): Unsubscribe {
  const q = query(
    collection(db, 'pedidos'),
    where('restauranteId', '==', RESTAURANTE_ID),
    where('estado', 'in', ['entregado', 'cancelado']),
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const pedidos = sortByCreatedAtDesc(
        snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Pedido))
      );
      callback(pedidos);
    },
    (err) => console.error('[Firestore] suscribirHistorial error:', err.message),
  );
}

export type TipoNotificacion = 'confirmado' | 'rechazado' | 'en_camino' | 'entregado' | 'cambio_aprobado' | 'cambio_rechazado';

export async function notificarCliente(id: string, tipo: TipoNotificacion): Promise<void> {
  if (!BACKEND_URL) return;
  try {
    const token = await auth.currentUser?.getIdToken();
    await fetch(`${BACKEND_URL}/orders/${id}/notificar`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ tipo }),
    });
  } catch (err) {
    console.warn('[notificarCliente] Error:', err);
  }
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

// ─── Historial paginado ────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

export type FiltroHistorial = 'todos' | 'hoy' | 'ayer' | '7dias' | '30dias';

function getDateRange(filtro: FiltroHistorial): { desde?: Date; hasta?: Date } {
  const now = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

  switch (filtro) {
    case 'hoy':
      return { desde: startOfDay(now) };
    case 'ayer': {
      const ayer = new Date(now);
      ayer.setDate(ayer.getDate() - 1);
      return { desde: startOfDay(ayer), hasta: startOfDay(now) };
    }
    case '7dias': {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      return { desde: startOfDay(d) };
    }
    case '30dias': {
      const d = new Date(now);
      d.setDate(d.getDate() - 30);
      return { desde: startOfDay(d) };
    }
    default:
      return {};
  }
}

export interface HistorialPage {
  pedidos: Pedido[];
  cursor: QueryDocumentSnapshot<DocumentData> | null;
  hasMore: boolean;
}

export async function fetchHistorial(options: {
  filtro: FiltroHistorial;
  cursor?: QueryDocumentSnapshot<DocumentData> | null;
}): Promise<HistorialPage> {
  const { desde, hasta } = getDateRange(options.filtro);

  const constraints: QueryConstraint[] = [
    where('restauranteId', '==', RESTAURANTE_ID),
    where('estado', 'in', ['entregado', 'cancelado']),
    orderBy('createdAt', 'desc'),
  ];

  if (desde) constraints.push(where('createdAt', '>=', Timestamp.fromDate(desde)));
  if (hasta) constraints.push(where('createdAt', '<', Timestamp.fromDate(hasta)));
  if (options.cursor) constraints.push(startAfter(options.cursor));

  constraints.push(limit(PAGE_SIZE + 1));

  const snapshot = await getDocs(query(collection(db, 'pedidos'), ...constraints));
  const hasMore = snapshot.docs.length > PAGE_SIZE;
  const docs = hasMore ? snapshot.docs.slice(0, PAGE_SIZE) : snapshot.docs;

  return {
    pedidos: docs.map((d) => ({ id: d.id, ...d.data() } as Pedido)),
    cursor: docs.length > 0 ? docs[docs.length - 1] : null,
    hasMore,
  };
}
