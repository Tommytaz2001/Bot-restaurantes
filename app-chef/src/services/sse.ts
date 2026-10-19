import { getBackendUrl, getToken, Pedido } from './api';
import { audioAlert } from './audio';
import { webNotifications } from './webNotificationService';

type PedidosCallback = (pedidos: Pedido[]) => void;
type StatusCallback = (connected: boolean) => void;

export function connectPedidosActivosStream(
  onData: PedidosCallback,
  onStatusChange?: StatusCallback
): () => void {
  let es: EventSource | null = null;
  let retryTimeout: any = null;
  let isClosed = false;
  let knownIds = new Set<string>();
  let isFirstLoad = true;

  function connect() {
    if (isClosed) return;

    const token = getToken();
    if (!token) {
      if (onStatusChange) onStatusChange(false);
      return;
    }

    const backend = getBackendUrl();
    const url = `${backend}/pedidos-admin/activos/stream?token=${encodeURIComponent(token)}`;

    console.log('[SSE] Conectando a stream de pedidos en tiempo real...');
    es = new EventSource(url);

    es.onopen = () => {
      console.log('[SSE] Conexión en vivo establecida.');
      if (onStatusChange) onStatusChange(true);
    };

    es.onmessage = (event) => {
      try {
        const pedidos = JSON.parse(event.data) as Pedido[];

        // Detectar si hay un pedido nuevo que no teníamos registrado para sonar la campana y notificar
        if (!isFirstLoad) {
          const newOrders = pedidos.filter(
            (p) => !knownIds.has(p.id) && ['pendiente', 'pendiente_pago'].includes(p.estado)
          );
          if (newOrders.length > 0) {
            console.log(`[SSE] 🔔 ¡${newOrders.length} nuevo(s) pedido(s) recibido(s)! Sonando campana y notificando...`);
            audioAlert.playNewOrderChime();
            newOrders.forEach((p) => webNotifications.notifyNewOrder(p));
          }
        } else {
          isFirstLoad = false;
        }

        knownIds = new Set(pedidos.map((p) => p.id));
        onData(pedidos);
      } catch (err) {
        console.error('[SSE] Error procesando mensaje:', err);
      }
    };

    es.onerror = (err) => {
      console.warn('[SSE] Conexión interrumpida, reintentando en 3s...', err);
      if (onStatusChange) onStatusChange(false);
      if (es) {
        es.close();
        es = null;
      }
      if (!isClosed) {
        retryTimeout = setTimeout(connect, 3000);
      }
    };
  }

  connect();

  return () => {
    isClosed = true;
    if (retryTimeout) clearTimeout(retryTimeout);
    if (es) es.close();
  };
}
