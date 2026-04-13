import { auth } from './firebaseConfig';
import { authFetch, getAuthToken } from './apiClient';
import { getBackendUrl } from './backendConfig';
import EventSource from 'react-native-sse';

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
  precio_unitario?: number;
}

export interface CambioSolicitado {
  descripcion: string;
  estado: 'pendiente_chef' | 'aprobado' | 'rechazado';
  solicitadoAt: any;
  respondidoAt?: any;
  tipo?: 'modificacion' | 'agregar_productos';
  productos_nuevos?: Producto[];
  total_nuevo?: number;
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
  tiempo_estimado_min?: number;
}

function getTimestampMs(ts: any): number {
  if (!ts) return 0;
  if (typeof ts === 'string') return new Date(ts).getTime();
  return (ts.seconds ?? 0) * 1000;
}

function sortByCreatedAtDesc(pedidos: Pedido[]): Pedido[] {
  return pedidos.sort((a, b) => getTimestampMs(b.createdAt) - getTimestampMs(a.createdAt));
}

// ─── Listeners SSE ────────────────────────────────────────────────────────────

export function suscribirPedidosActivos(
  callback: (pedidos: Pedido[]) => void
): () => void {
  let es: EventSource | null = null;
  let cancelled = false;

  (async () => {
    const [url, token] = await Promise.all([getBackendUrl(), getAuthToken()]);
    if (cancelled) return;
    console.log('[suscribirPedidosActivos] Connecting SSE...');
    es = new EventSource(`${url}/pedidos-admin/activos/stream?token=${token}`);
    es.addEventListener('message', (e: any) => {
      const pedidos = JSON.parse(e.data) as Pedido[];
      console.log(`[suscribirPedidosActivos] snapshot received: ${pedidos.length} docs`);
      callback(sortByCreatedAtDesc(pedidos));
    });
    es.addEventListener('error', (e: any) => {
      console.warn('[SSE activos] error:', e);
    });
  })();

  return () => {
    cancelled = true;
    es?.close();
  };
}

export function suscribirHistorial(
  callback: (pedidos: Pedido[]) => void
): () => void {
  let es: EventSource | null = null;
  let cancelled = false;

  (async () => {
    const [url, token] = await Promise.all([getBackendUrl(), getAuthToken()]);
    if (cancelled) return;
    es = new EventSource(`${url}/pedidos-admin/historial/stream?token=${token}`);
    es.addEventListener('message', (e: any) => {
      const pedidos = JSON.parse(e.data) as Pedido[];
      console.log(`[suscribirHistorial] snapshot received: ${pedidos.length} docs`);
      callback(sortByCreatedAtDesc(pedidos));
    });
    es.addEventListener('error', (e: any) => {
      console.warn('[SSE historial] error:', e);
    });
  })();

  return () => {
    cancelled = true;
    es?.close();
  };
}

export function suscribirPedido(
  id: string,
  callback: (pedido: Pedido) => void
): () => void {
  let es: EventSource | null = null;
  let cancelled = false;

  (async () => {
    const [url, token] = await Promise.all([getBackendUrl(), getAuthToken()]);
    if (cancelled) return;
    es = new EventSource(`${url}/pedidos-admin/${id}/stream?token=${token}`);
    es.addEventListener('message', (e: any) => {
      const pedido = JSON.parse(e.data) as Pedido;
      callback(pedido);
    });
    es.addEventListener('error', (e: any) => {
      console.warn(`[SSE pedido:${id}] error:`, e);
    });
  })();

  return () => {
    cancelled = true;
    es?.close();
  };
}

// ─── Notificar cliente (ya iba al backend, se conserva) ──────────────────────

export type TipoNotificacion = 'confirmado' | 'rechazado' | 'en_camino' | 'entregado' | 'cambio_aprobado' | 'cambio_rechazado';

export async function notificarCliente(id: string, tipo: TipoNotificacion, tiempoEstimadoMin?: number): Promise<void> {
  const t0 = Date.now();
  console.log(`[notificarCliente] START pedido=${id} tipo=${tipo}`);
  try {
    const token = await auth.currentUser?.getIdToken();
    const backendUrl = await getBackendUrl();
    const body: Record<string, any> = { tipo };
    if (tiempoEstimadoMin) body.tiempoEstimadoMin = tiempoEstimadoMin;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    await fetch(`${backendUrl}/orders/${id}/notificar`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));
    console.log(`[notificarCliente] DONE in ${Date.now() - t0}ms`);
  } catch (err) {
    console.warn(`[notificarCliente] FAILED in ${Date.now() - t0}ms:`, err);
  }
}

// ─── Writes de estado (ahora van al backend) ─────────────────────────────────

export async function confirmarPedidoConETA(id: string, tiempoEstimadoMin?: number): Promise<void> {
  console.log(`[📝 WRITE] confirmarPedidoConETA | pedido=${id}`);
  const res = await authFetch(`/pedidos-admin/${id}/confirmar`, {
    method: 'PATCH',
    body: JSON.stringify({ tiempoEstimadoMin }),
  });
  if (!res.ok) throw new Error(`confirmarPedidoConETA failed: ${res.status}`);
}

export const confirmarPedido = (id: string) => confirmarPedidoConETA(id);

export async function marcarEnCamino(id: string): Promise<void> {
  console.log(`[📝 WRITE] marcarEnCamino | pedido=${id}`);
  const res = await authFetch(`/pedidos-admin/${id}/en-camino`, { method: 'PATCH' });
  if (!res.ok) throw new Error(`marcarEnCamino failed: ${res.status}`);
}

export async function marcarEntregado(id: string): Promise<void> {
  console.log(`[📝 WRITE] marcarEntregado | pedido=${id}`);
  const res = await authFetch(`/pedidos-admin/${id}/entregado`, { method: 'PATCH' });
  if (!res.ok) throw new Error(`marcarEntregado failed: ${res.status}`);
}

export async function rechazarPedido(id: string): Promise<void> {
  console.log(`[📝 WRITE] rechazarPedido | pedido=${id}`);
  const res = await authFetch(`/pedidos-admin/${id}/rechazar`, { method: 'PATCH' });
  if (!res.ok) throw new Error(`rechazarPedido failed: ${res.status}`);
}

export async function aprobarCambio(pedidoId: string): Promise<void> {
  console.log(`[📝 WRITE] aprobarCambio | pedido=${pedidoId}`);
  const res = await authFetch(`/pedidos-admin/${pedidoId}/cambio/aprobar`, { method: 'PATCH' });
  if (!res.ok) throw new Error(`aprobarCambio failed: ${res.status}`);
}

export async function rechazarCambio(id: string): Promise<void> {
  console.log(`[📝 WRITE] rechazarCambio | pedido=${id}`);
  const res = await authFetch(`/pedidos-admin/${id}/cambio/rechazar`, { method: 'PATCH' });
  if (!res.ok) throw new Error(`rechazarCambio failed: ${res.status}`);
}

// ─── Historial paginado ────────────────────────────────────────────────────────

export type FiltroHistorial = 'todos' | 'hoy' | 'ayer' | '7dias' | '30dias';

export interface HistorialPage {
  pedidos: Pedido[];
  afterTs: string | null;
  hasMore: boolean;
}

export async function fetchHistorial(options: {
  filtro: FiltroHistorial;
  afterTs?: string | null;
}): Promise<HistorialPage> {
  const { filtro, afterTs } = options;
  const params = new URLSearchParams({ filtro });
  if (afterTs) params.set('afterTs', afterTs);

  console.log(`[fetchHistorial] START filtro=${filtro} afterTs=${afterTs ?? 'null'}`);
  const t0 = Date.now();
  const res = await authFetch(`/pedidos-admin/historial?${params.toString()}`);
  if (!res.ok) throw new Error(`fetchHistorial failed: ${res.status}`);
  const result = await res.json() as HistorialPage;
  console.log(`[fetchHistorial] done in ${Date.now() - t0}ms — ${result.pedidos.length} docs, hasMore=${result.hasMore}`);
  return result;
}
