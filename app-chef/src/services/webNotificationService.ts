import { Pedido } from './api';

let titleInterval: any = null;
const ORIGINAL_TITLE = 'Urbano Chef — Panel de Operaciones';

export const webNotifications = {
  isSupported(): boolean {
    return typeof window !== 'undefined' && 'Notification' in window;
  },

  getPermission(): NotificationPermission | 'unsupported' {
    if (!this.isSupported()) return 'unsupported';
    return Notification.permission;
  },

  async requestPermission(): Promise<boolean> {
    if (!this.isSupported()) return false;
    try {
      const res = await Notification.requestPermission();
      return res === 'granted';
    } catch (e) {
      console.warn('[WebNotifications] Error solicitando permiso:', e);
      return false;
    }
  },

  notifyNewOrder(pedido: Pedido) {
    // 1. Vibración háptica en celulares Android
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate([300, 150, 300, 150, 400]);
      } catch (e) {
        // Ignorar si el navegador bloquea vibración sin interacción
      }
    }

    // 2. Notificación visual nativa del sistema operativo (escritorio / celular)
    if (this.isSupported() && Notification.permission === 'granted') {
      try {
        const resumenProductos = (pedido.productos || [])
          .map((p) => `${p.cantidad}× ${p.nombre}`)
          .slice(0, 3)
          .join(', ');

        const notif = new Notification(`🍔 ¡Nuevo Pedido #${pedido.id.slice(-6).toUpperCase()}!`, {
          body: `${pedido.cliente || 'Cliente'} — C$${pedido.total} (${pedido.tipo_entrega === 'delivery' ? 'Delivery 🛵' : 'Retiro 🏪'})\n${resumenProductos}`,
          icon: '/favicon.ico',
          badge: '/favicon.ico',
          tag: `pedido-${pedido.id}`,
        });

        notif.onclick = () => {
          if (typeof window !== 'undefined') {
            window.focus();
          }
          notif.close();
        };
      } catch (e) {
        console.warn('[WebNotifications] Error lanzando notificación nativa:', e);
      }
    }

    // 3. Parpadeo de pestaña si la app está en segundo plano o minimizada
    if (typeof document !== 'undefined' && document.hidden) {
      this.startTitleFlash(`🔔 ¡NUEVO PEDIDO! (C$${pedido.total})`);
    }
  },

  notifySystem(title: string, body: string) {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate([200, 100, 200]);
      } catch (_) {}
    }

    if (this.isSupported() && Notification.permission === 'granted') {
      try {
        const notif = new Notification(title, {
          body,
          icon: '/favicon.ico',
          badge: '/favicon.ico',
          tag: 'system-restart',
        });
        notif.onclick = () => {
          if (typeof window !== 'undefined') window.focus();
          notif.close();
        };
      } catch (e) {
        console.warn('[WebNotifications] Error lanzando notificación de sistema:', e);
      }
    }

    if (typeof document !== 'undefined' && document.hidden) {
      this.startTitleFlash(`⚡ ${title}`);
    }
  },

  startTitleFlash(alertText: string) {
    if (titleInterval) clearInterval(titleInterval);
    let toggle = false;

    titleInterval = setInterval(() => {
      document.title = toggle ? alertText : ORIGINAL_TITLE;
      toggle = !toggle;
    }, 1000);

    const stopFlash = () => {
      if (titleInterval) {
        clearInterval(titleInterval);
        titleInterval = null;
      }
      document.title = ORIGINAL_TITLE;
      window.removeEventListener('focus', stopFlash);
      document.removeEventListener('visibilitychange', stopFlash);
    };

    window.addEventListener('focus', stopFlash);
    document.addEventListener('visibilitychange', stopFlash);
  },
};
