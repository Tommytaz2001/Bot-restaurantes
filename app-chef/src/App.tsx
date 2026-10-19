import React, { useState, useEffect, useCallback } from 'react';
import { 
  getUser, 
  removeToken, 
  Pedido, 
  Usuario, 
  fetchBotStatus, 
  toggleBot,
  confirmarPedido,
  marcarEnCamino,
  marcarEntregado,
  rechazarPedido,
  aprobarCambio,
  rechazarCambio
} from './services/api';
import { connectPedidosActivosStream } from './services/sse';
import { Navbar } from './components/Navbar';
import { BackendConfigModal } from './components/BackendConfigModal';
import { LoginPage } from './pages/LoginPage';
import { PedidosPage } from './pages/PedidosPage';
import { HistorialPage } from './pages/HistorialPage';
import { MenuPage } from './pages/MenuPage';
import { HorariosPage } from './pages/HorariosPage';

export const App: React.FC = () => {
  const [user, setUser] = useState<Usuario | null>(() => getUser());
  const [activeTab, setActiveTab] = useState<'pedidos' | 'historial' | 'menu' | 'horarios'>('pedidos');
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [isLive, setIsLive] = useState(false);
  const [botActivo, setBotActivo] = useState(true);
  const [showConfig, setShowConfig] = useState(false);

  // Escuchar logout forzado por 401
  useEffect(() => {
    const handleUnauthorized = () => {
      setUser(null);
      setPedidos([]);
    };
    window.addEventListener('auth:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('auth:unauthorized', handleUnauthorized);
  }, []);

  // Cargar estado inicial del bot
  useEffect(() => {
    if (user) {
      fetchBotStatus()
        .then((data) => setBotActivo(data.botActivo ?? true))
        .catch(() => {});
    }
  }, [user]);

  // Conectar SSE para recibir pedidos en vivo
  useEffect(() => {
    if (!user) return;

    const cleanup = connectPedidosActivosStream(
      (newPedidos) => {
        setPedidos(newPedidos);
      },
      (connected) => {
        setIsLive(connected);
      }
    );

    return cleanup;
  }, [user]);

  // Manejar cambio de bot
  const handleToggleBot = async () => {
    try {
      const next = await toggleBot(botActivo);
      setBotActivo(next);
    } catch (e) {
      console.error('[App] Error cambiando bot:', e);
    }
  };

  const handleLogout = () => {
    removeToken();
    setUser(null);
    setPedidos([]);
  };

  // Acciones sobre pedidos
  const handleConfirmOrder = async (id: string, mins?: number) => {
    try {
      await confirmarPedido(id, mins);
    } catch (e: any) {
      alert(e.message || 'Error confirmando pedido');
    }
  };

  const handleEnCamino = async (id: string) => {
    try {
      await marcarEnCamino(id);
    } catch (e: any) {
      alert(e.message || 'Error marcando en camino');
    }
  };

  const handleEntregado = async (id: string) => {
    try {
      await marcarEntregado(id);
    } catch (e: any) {
      alert(e.message || 'Error marcando entregado');
    }
  };

  const handleRechazar = async (id: string) => {
    if (!confirm('¿Estás seguro de rechazar y cancelar este pedido? Se le avisará al cliente por WhatsApp.')) return;
    try {
      await rechazarPedido(id);
    } catch (e: any) {
      alert(e.message || 'Error rechazando pedido');
    }
  };

  const handleApproveChange = async (id: string) => {
    try {
      await aprobarCambio(id);
    } catch (e: any) {
      alert(e.message || 'Error aprobando cambio');
    }
  };

  const handleRejectChange = async (id: string) => {
    try {
      await rechazarCambio(id);
    } catch (e: any) {
      alert(e.message || 'Error rechazando cambio');
    }
  };

  if (!user) {
    return <LoginPage onLoginSuccess={(u) => setUser(u)} />;
  }

  const pendientesCambioCount = pedidos.filter(
    (p) => p.cambio_solicitado?.estado === 'pendiente_chef'
  ).length;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      <Navbar
        user={user}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        pedidosCount={pedidos.length}
        pendientesCambioCount={pendientesCambioCount}
        isLive={isLive}
        botActivo={botActivo}
        onToggleBot={handleToggleBot}
        onOpenConfig={() => setShowConfig(true)}
        onLogout={handleLogout}
      />

      <main className="flex-1">
        {activeTab === 'pedidos' && (
          <PedidosPage
            pedidos={pedidos}
            onConfirmOrder={handleConfirmOrder}
            onEnCamino={handleEnCamino}
            onEntregado={handleEntregado}
            onRechazar={handleRechazar}
            onApproveChange={handleApproveChange}
            onRejectChange={handleRejectChange}
          />
        )}
        {activeTab === 'historial' && <HistorialPage />}
        {activeTab === 'menu' && <MenuPage />}
        {activeTab === 'horarios' && <HorariosPage />}
      </main>

      <BackendConfigModal isOpen={showConfig} onClose={() => setShowConfig(false)} />
    </div>
  );
};
