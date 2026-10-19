import React, { useState, useEffect } from 'react';
import { 
  UtensilsCrossed, 
  Clock, 
  Bike, 
  CheckCircle2, 
  LayoutGrid, 
  Columns3,
  Search,
  Filter,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { Pedido } from '../services/api';
import { OrderCard } from '../components/OrderCard';
import { EtaModal } from '../components/EtaModal';
import { VoucherModal } from '../components/VoucherModal';
import { ChangeApprovalModal } from '../components/ChangeApprovalModal';

interface PedidosPageProps {
  pedidos: Pedido[];
  onConfirmOrder: (id: string, mins?: number) => void;
  onEnCamino: (id: string) => void;
  onEntregado: (id: string) => void;
  onRechazar: (id: string) => void;
  onApproveChange: (id: string) => void;
  onRejectChange: (id: string) => void;
}

export const PedidosPage: React.FC<PedidosPageProps> = ({
  pedidos,
  onConfirmOrder,
  onEnCamino,
  onEntregado,
  onRechazar,
  onApproveChange,
  onRejectChange,
}) => {
  const [filterEstado, setFilterEstado] = useState<'todos' | 'pendientes' | 'confirmados' | 'en_camino'>('todos');
  const [viewMode, setViewMode] = useState<'grid' | 'kanban'>('grid');
  const [search, setSearch] = useState('');

  // Modals state
  const [etaModalPedido, setEtaModalPedido] = useState<Pedido | null>(null);
  const [voucherModal, setVoucherModal] = useState<{ url: string; cliente: string } | null>(null);
  const [changeModalPedido, setChangeModalPedido] = useState<Pedido | null>(null);

  // Filtered orders
  const filtered = pedidos.filter((p) => {
    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      const matchCliente = p.cliente.toLowerCase().includes(q);
      const matchPhone = p.telefono?.includes(q);
      const matchId = p.id.toLowerCase().includes(q);
      if (!matchCliente && !matchPhone && !matchId) return false;
    }

    // Estado filter
    if (filterEstado === 'pendientes') {
      return ['pendiente', 'pendiente_pago'].includes(p.estado);
    }
    if (filterEstado === 'confirmados') {
      return p.estado === 'confirmado';
    }
    if (filterEstado === 'en_camino') {
      return p.estado === 'en_camino';
    }
    return true;
  });

  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 6;

  useEffect(() => {
    setCurrentPage(1);
  }, [filterEstado, search]);

  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE) || 1;
  const paginatedOrders = filtered.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const pendientesCount = pedidos.filter((p) => ['pendiente', 'pendiente_pago'].includes(p.estado)).length;
  const confirmadosCount = pedidos.filter((p) => p.estado === 'confirmado').length;
  const enCaminoCount = pedidos.filter((p) => p.estado === 'en_camino').length;

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6">
      {/* Controles de Barra Superior */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        {/* Filtros rápidos */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          <button
            onClick={() => setFilterEstado('todos')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
              filterEstado === 'todos'
                ? 'bg-slate-200 text-slate-900 shadow'
                : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700'
            }`}
          >
            Todos ({pedidos.length})
          </button>
          <button
            onClick={() => setFilterEstado('pendientes')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              filterEstado === 'pendientes'
                ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/25'
                : 'bg-slate-800/80 text-orange-400 hover:bg-slate-700'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Pendientes ({pendientesCount})</span>
          </button>
          <button
            onClick={() => setFilterEstado('confirmados')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              filterEstado === 'confirmados'
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/25'
                : 'bg-slate-800/80 text-blue-400 hover:bg-slate-700'
            }`}
          >
            <UtensilsCrossed className="w-3.5 h-3.5" />
            <span>En Cocina ({confirmadosCount})</span>
          </button>
          <button
            onClick={() => setFilterEstado('en_camino')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              filterEstado === 'en_camino'
                ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/25'
                : 'bg-slate-800/80 text-emerald-400 hover:bg-slate-700'
            }`}
          >
            <Bike className="w-3.5 h-3.5" />
            <span>En Camino / Listos ({enCaminoCount})</span>
          </button>
        </div>

        {/* Búsqueda y selector de vista */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:w-64">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar cliente, tel, #id..."
              className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-slate-900/80 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-orange-500"
            />
          </div>

          <div className="hidden sm:flex items-center gap-1 p-1 rounded-xl bg-slate-900 border border-slate-800">
            <button
              onClick={() => setViewMode('grid')}
              title="Vista cuadrícula"
              className={`p-1.5 rounded-lg ${viewMode === 'grid' ? 'bg-orange-500 text-white' : 'text-slate-400 hover:text-white'}`}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('kanban')}
              title="Vista columnas (KDS Cocina)"
              className={`p-1.5 rounded-lg ${viewMode === 'kanban' ? 'bg-orange-500 text-white' : 'text-slate-400 hover:text-white'}`}
            >
              <Columns3 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Lista de Pedidos */}
      {filtered.length === 0 ? (
        <div className="glass-panel rounded-3xl p-12 text-center my-8 max-w-md mx-auto border border-slate-800">
          <div className="w-16 h-16 rounded-2xl bg-slate-800/80 flex items-center justify-center text-3xl mx-auto mb-4">
            👨‍🍳
          </div>
          <h3 className="brand-font font-bold text-xl text-white">¡Cocina al día!</h3>
          <p className="text-xs text-slate-400 mt-2">
            No hay pedidos activos con este filtro. En cuanto un cliente confirme por WhatsApp, sonará la campana y aparecerá aquí automáticamente.
          </p>
        </div>
      ) : viewMode === 'kanban' ? (
        /* Vista KDS Columnas (Cocina / Tablet) */
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
          {/* Columna 1: Pendientes */}
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-orange-500/30 text-orange-400">
              <span className="font-bold text-xs uppercase tracking-wider flex items-center gap-1.5">
                <Clock className="w-4 h-4" /> Pendientes
              </span>
              <span className="px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-400 text-xs font-bold">
                {pendientesCount}
              </span>
            </div>
            <div className="space-y-4">
              {filtered
                .filter((p) => ['pendiente', 'pendiente_pago'].includes(p.estado))
                .map((pedido) => (
                  <OrderCard
                    key={pedido.id}
                    pedido={pedido}
                    onConfirmClick={(p) => setEtaModalPedido(p)}
                    onEnCaminoClick={onEnCamino}
                    onEntregadoClick={onEntregado}
                    onRechazarClick={onRechazar}
                    onViewVoucher={(url, cli) => setVoucherModal({ url, cliente: cli })}
                    onViewChange={(p) => setChangeModalPedido(p)}
                  />
                ))}
            </div>
          </div>

          {/* Columna 2: En Preparación */}
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-blue-500/30 text-blue-400">
              <span className="font-bold text-xs uppercase tracking-wider flex items-center gap-1.5">
                <UtensilsCrossed className="w-4 h-4" /> En Preparación
              </span>
              <span className="px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 text-xs font-bold">
                {confirmadosCount}
              </span>
            </div>
            <div className="space-y-4">
              {filtered
                .filter((p) => p.estado === 'confirmado')
                .map((pedido) => (
                  <OrderCard
                    key={pedido.id}
                    pedido={pedido}
                    onConfirmClick={(p) => setEtaModalPedido(p)}
                    onEnCaminoClick={onEnCamino}
                    onEntregadoClick={onEntregado}
                    onRechazarClick={onRechazar}
                    onViewVoucher={(url, cli) => setVoucherModal({ url, cliente: cli })}
                    onViewChange={(p) => setChangeModalPedido(p)}
                  />
                ))}
            </div>
          </div>

          {/* Columna 3: En Camino / Listos */}
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-emerald-500/30 text-emerald-400">
              <span className="font-bold text-xs uppercase tracking-wider flex items-center gap-1.5">
                <Bike className="w-4 h-4" /> En Camino / Retiro
              </span>
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 text-xs font-bold">
                {enCaminoCount}
              </span>
            </div>
            <div className="space-y-4">
              {filtered
                .filter((p) => p.estado === 'en_camino')
                .map((pedido) => (
                  <OrderCard
                    key={pedido.id}
                    pedido={pedido}
                    onConfirmClick={(p) => setEtaModalPedido(p)}
                    onEnCaminoClick={onEnCamino}
                    onEntregadoClick={onEntregado}
                    onRechazarClick={onRechazar}
                    onViewVoucher={(url, cli) => setVoucherModal({ url, cliente: cli })}
                    onViewChange={(p) => setChangeModalPedido(p)}
                  />
                ))}
            </div>
          </div>
        </div>
      ) : (
        /* Vista Cuadrícula Responsiva (Móvil y Escritorio) */
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {paginatedOrders.map((pedido) => (
              <OrderCard
                key={pedido.id}
                pedido={pedido}
                onConfirmClick={(p) => setEtaModalPedido(p)}
                onEnCaminoClick={onEnCamino}
                onEntregadoClick={onEntregado}
                onRechazarClick={onRechazar}
                onViewVoucher={(url, cli) => setVoucherModal({ url, cliente: cli })}
                onViewChange={(p) => setChangeModalPedido(p)}
              />
            ))}
          </div>

          {/* Paginación */}
          {totalPages > 1 && (
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-slate-800/80 pt-5">
              <span className="text-xs text-slate-400 font-medium">
                Mostrando <span className="text-slate-200 font-bold">{(currentPage - 1) * ITEMS_PER_PAGE + 1}</span> a{' '}
                <span className="text-slate-200 font-bold">
                  {Math.min(currentPage * ITEMS_PER_PAGE, filtered.length)}
                </span>{' '}
                de <span className="text-slate-200 font-bold">{filtered.length}</span> pedidos
              </span>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-1.5 rounded-xl border border-slate-700 bg-slate-900 text-xs font-semibold text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-800 flex items-center gap-1"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Anterior</span>
                </button>

                {Array.from({ length: totalPages }).map((_, i) => {
                  const pageNum = i + 1;
                  if (totalPages > 5 && Math.abs(pageNum - currentPage) > 1 && pageNum !== 1 && pageNum !== totalPages) {
                    if (pageNum === 2 || pageNum === totalPages - 1) {
                      return <span key={pageNum} className="text-slate-600 px-1 text-xs">...</span>;
                    }
                    return null;
                  }

                  return (
                    <button
                      key={pageNum}
                      onClick={() => setCurrentPage(pageNum)}
                      className={`w-8 h-8 rounded-xl text-xs font-bold transition-all ${
                        currentPage === pageNum
                          ? 'bg-orange-500 text-white shadow-md shadow-orange-500/25'
                          : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800'
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}

                <button
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="px-3 py-1.5 rounded-xl border border-slate-700 bg-slate-900 text-xs font-semibold text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-800 flex items-center gap-1"
                >
                  <span>Siguiente</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Modales */}
      <EtaModal
        isOpen={!!etaModalPedido}
        onClose={() => setEtaModalPedido(null)}
        onConfirm={(mins) => {
          if (etaModalPedido) {
            onConfirmOrder(etaModalPedido.id, mins);
            setEtaModalPedido(null);
          }
        }}
        pedidoCliente={etaModalPedido?.cliente || ''}
      />

      <VoucherModal
        isOpen={!!voucherModal}
        onClose={() => setVoucherModal(null)}
        voucherUrl={voucherModal?.url || null}
        cliente={voucherModal?.cliente || ''}
      />

      <ChangeApprovalModal
        isOpen={!!changeModalPedido}
        onClose={() => setChangeModalPedido(null)}
        cambio={changeModalPedido?.cambio_solicitado}
        cliente={changeModalPedido?.cliente || ''}
        onApprove={() => {
          if (changeModalPedido) {
            onApproveChange(changeModalPedido.id);
            setChangeModalPedido(null);
          }
        }}
        onReject={() => {
          if (changeModalPedido) {
            onRejectChange(changeModalPedido.id);
            setChangeModalPedido(null);
          }
        }}
      />
    </div>
  );
};
