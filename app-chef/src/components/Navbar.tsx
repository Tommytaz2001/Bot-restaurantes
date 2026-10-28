import React from 'react';
import { 
  UtensilsCrossed, 
  History, 
  BookOpen, 
  Clock, 
  Volume2, 
  VolumeX, 
  LogOut, 
  Bot, 
  Settings,
  Wifi,
  WifiOff,
  Bell,
  BellRing,
  ShieldAlert,
} from 'lucide-react';
import { Usuario } from '../services/api';
import { audioAlert } from '../services/audio';
import { webNotifications } from '../services/webNotificationService';

interface NavbarProps {
  user: Usuario | null;
  activeTab: 'pedidos' | 'historial' | 'menu' | 'horarios' | 'blacklist';
  setActiveTab: (tab: 'pedidos' | 'historial' | 'menu' | 'horarios' | 'blacklist') => void;

  pedidosCount: number;
  pendientesCambioCount: number;
  isLive: boolean;
  botActivo: boolean;
  onToggleBot: () => void;
  onOpenConfig: () => void;
  onLogout: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  user,
  activeTab,
  setActiveTab,
  pedidosCount,
  pendientesCambioCount,
  isLive,
  botActivo,
  onToggleBot,
  onOpenConfig,
  onLogout,
}) => {
  const [soundOn, setSoundOn] = React.useState(audioAlert.enabled);
  const [notifPermission, setNotifPermission] = React.useState<NotificationPermission | 'unsupported'>(
    webNotifications.getPermission()
  );

  const toggleSound = () => {
    audioAlert.enabled = !soundOn;
    setSoundOn(!soundOn);
    if (!soundOn) {
      audioAlert.playNewOrderChime();
    }
  };

  const handleToggleNotif = async () => {
    if (!webNotifications.isSupported()) {
      alert('Tu navegador no soporta notificaciones de sistema.');
      return;
    }
    if (notifPermission === 'granted') {
      alert('🔔 Notificaciones del sistema ya están activas. Recibirás avisos incluso con la app fuera.');
      return;
    }
    const granted = await webNotifications.requestPermission();
    setNotifPermission(webNotifications.getPermission());
    if (granted) {
      alert('🔔 ¡Notificaciones activadas! Ahora recibirás alertas en tu celular o pantalla cuando llegue un nuevo pedido.');
    }
  };

  return (
    <header className="glass-nav sticky top-0 z-50 px-4 py-3 sm:px-6">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Logo y Status de Conexión */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 to-orange-600 flex items-center justify-center text-xl shadow-lg shadow-orange-500/20">
              🍔
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="brand-font font-bold tracking-wider text-lg text-white">URBANO CHEF</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-400 border border-orange-500/20 font-medium">
                  KDS Web
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-xs">
                {isLive ? (
                  <span className="flex items-center gap-1 text-emerald-400 font-medium">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                    En tiempo real
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-amber-400">
                    <WifiOff className="w-3 h-3" />
                    Reconectando...
                  </span>
                )}
                <span className="text-slate-600">•</span>
                <span className="text-slate-400 truncate max-w-[120px]">{user?.nombre || user?.email}</span>
              </div>
            </div>
          </div>

          {/* Bot & Sound & Config toggles en móvil */}
          <div className="flex md:hidden items-center gap-1.5">
            <button
              onClick={onToggleBot}
              title={botActivo ? 'Bot activo (click para pausar)' : 'Bot pausado (click para activar)'}
              className={`p-1.5 sm:p-2 rounded-lg border text-xs font-semibold flex items-center gap-1 ${
                botActivo
                  ? 'bg-emerald-950/60 border-emerald-500/30 text-emerald-300'
                  : 'bg-rose-950/60 border-rose-500/30 text-rose-300'
              }`}
            >
              <Bot className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{botActivo ? 'Bot ON' : 'Bot OFF'}</span>
            </button>

            <button
              onClick={toggleSound}
              className="p-1.5 sm:p-2 rounded-lg bg-slate-800/60 border border-slate-700/60 text-slate-300"
              title="Sonido"
            >
              {soundOn ? <Volume2 className="w-3.5 h-3.5 text-emerald-400" /> : <VolumeX className="w-3.5 h-3.5 text-slate-500" />}
            </button>
            <button
              onClick={handleToggleNotif}
              className={`p-1.5 sm:p-2 rounded-lg border text-xs ${
                notifPermission === 'granted'
                  ? 'bg-amber-500/15 border-amber-500/30 text-amber-300'
                  : 'bg-slate-800/60 border-slate-700/60 text-slate-400'
              }`}
              title={notifPermission === 'granted' ? 'Notificaciones de sistema activas' : 'Activar notificaciones de sistema'}
            >
              {notifPermission === 'granted' ? (
                <BellRing className="w-3.5 h-3.5 text-amber-400" />
              ) : (
                <Bell className="w-3.5 h-3.5" />
              )}
            </button>
            <button
              onClick={onOpenConfig}
              className="p-1.5 sm:p-2 rounded-lg bg-slate-800/60 border border-slate-700/60 text-slate-300"
              title="Configurar servidor"
            >
              <Settings className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onLogout}
              className="p-1.5 sm:p-2 rounded-lg bg-slate-800/60 border border-slate-700/60 text-slate-300 hover:text-rose-400"
              title="Cerrar sesión"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Pestañas de Navegación */}
        <nav className="flex items-center justify-start sm:justify-center overflow-x-auto gap-1.5 py-1 scrollbar-none">
          <button
            onClick={() => setActiveTab('pedidos')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-semibold transition-all whitespace-nowrap ${
              activeTab === 'pedidos'
                ? 'bg-orange-500 text-white shadow-md shadow-orange-500/25'
                : 'text-slate-300 hover:bg-slate-800/60'
            }`}
          >
            <UtensilsCrossed className="w-4 h-4" />
            <span>Pedidos Activos</span>
            {pedidosCount > 0 && (
              <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                activeTab === 'pedidos' ? 'bg-white text-orange-600' : 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
              }`}>
                {pedidosCount}
              </span>
            )}
            {pendientesCambioCount > 0 && (
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping"></span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('historial')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-semibold transition-all whitespace-nowrap ${
              activeTab === 'historial'
                ? 'bg-orange-500 text-white shadow-md shadow-orange-500/25'
                : 'text-slate-300 hover:bg-slate-800/60'
            }`}
          >
            <History className="w-4 h-4" />
            <span>Historial</span>
          </button>

          <button
            onClick={() => setActiveTab('menu')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-semibold transition-all whitespace-nowrap ${
              activeTab === 'menu'
                ? 'bg-orange-500 text-white shadow-md shadow-orange-500/25'
                : 'text-slate-300 hover:bg-slate-800/60'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            <span>Menú</span>
          </button>

          <button
            onClick={() => setActiveTab('horarios')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-semibold transition-all whitespace-nowrap ${
              activeTab === 'horarios'
                ? 'bg-orange-500 text-white shadow-md shadow-orange-500/25'
                : 'text-slate-300 hover:bg-slate-800/60'
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>Horarios</span>
          </button>

          <button
            onClick={() => setActiveTab('blacklist')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-semibold transition-all whitespace-nowrap ${
              activeTab === 'blacklist'
                ? 'bg-rose-500 text-white shadow-md shadow-rose-500/25'
                : 'text-slate-300 hover:bg-slate-800/60'
            }`}
          >
            <ShieldAlert className="w-4 h-4" />
            <span>Lista Negra</span>
          </button>
        </nav>


        {/* Acciones de Escritorio */}
        <div className="hidden md:flex items-center gap-2.5">
          {/* Bot WhatsApp switch */}
          <button
            onClick={onToggleBot}
            className={`px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-2 transition-all ${
              botActivo
                ? 'bg-emerald-950/50 border-emerald-500/40 text-emerald-300 hover:bg-emerald-900/60'
                : 'bg-rose-950/50 border-rose-500/40 text-rose-300 hover:bg-rose-900/60'
            }`}
          >
            <Bot className="w-4 h-4" />
            <span>{botActivo ? 'Bot Activo' : 'Bot Pausado'}</span>
          </button>



          {/* Sound Toggle */}
          <button
            onClick={toggleSound}
            title={soundOn ? 'Sonido activado' : 'Sonido silenciado'}
            className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/60 text-slate-300"
          >
            {soundOn ? <Volume2 className="w-4 h-4 text-emerald-400" /> : <VolumeX className="w-4 h-4 text-slate-500" />}
          </button>

          {/* Notificaciones del sistema */}
          <button
            onClick={handleToggleNotif}
            title={notifPermission === 'granted' ? 'Notificaciones de sistema activas' : 'Activar notificaciones de sistema'}
            className={`p-2 rounded-xl border transition-all ${
              notifPermission === 'granted'
                ? 'bg-amber-500/15 border-amber-500/40 text-amber-300 hover:bg-amber-500/25'
                : 'bg-slate-800/80 border-slate-700/60 text-slate-400 hover:text-white'
            }`}
          >
            {notifPermission === 'granted' ? (
              <BellRing className="w-4 h-4 text-amber-400" />
            ) : (
              <Bell className="w-4 h-4" />
            )}
          </button>

          {/* Config URL */}
          <button
            onClick={onOpenConfig}
            title="Configurar servidor"
            className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/60 text-slate-300"
          >
            <Settings className="w-4 h-4" />
          </button>

          {/* Logout */}
          <button
            onClick={onLogout}
            title="Cerrar sesión"
            className="p-2 rounded-xl bg-slate-800/80 hover:bg-rose-950/80 hover:border-rose-500/50 hover:text-rose-400 border border-slate-700/60 text-slate-300"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};
