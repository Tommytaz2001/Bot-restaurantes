import React, { useState, useEffect } from 'react';
import { History, Search, Calendar, CheckCircle2, XCircle, Bike, Store, CreditCard, Banknote, ChevronLeft, ChevronRight, Copy } from 'lucide-react';
import { fetchHistorial, Pedido } from '../services/api';
import { formatDeliveryPhone } from '../utils/phoneUtils';

const ITEMS_PER_PAGE = 9;

export const HistorialPage: React.FC = () => {
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState<'hoy' | 'ayer' | '7dias' | 'todos'>('hoy');
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const loadData = async (f: string) => {
    setLoading(true);
    try {
      const data = await fetchHistorial(f);
      setPedidos(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData(filtro);
  }, [filtro]);

  // Reset pagination when filter or search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [filtro, search]);

  const filtered = pedidos.filter((p) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      p.cliente.toLowerCase().includes(q) ||
      p.telefono?.includes(q) ||
      p.id.toLowerCase().includes(q)
    );
  });

  const totalVentas = filtered
    .filter((p) => p.estado === 'entregado')
    .reduce((sum, p) => sum + p.total, 0);

  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE) || 1;
  const paginatedHistorial = filtered.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6">
      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="brand-font font-bold text-2xl text-white flex items-center gap-2">
            <History className="w-6 h-6 text-orange-400" />
            Historial de Pedidos
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Registro de pedidos completados y cancelados
          </p>
        </div>

        {/* Resumen de ventas */}
        <div className="glass-panel px-4 py-2.5 rounded-2xl flex items-center gap-3 border border-emerald-500/30 bg-emerald-950/20">
          <span className="text-xs text-emerald-400 font-semibold">Total Ventas:</span>
          <span className="text-lg font-black text-white font-mono">C${totalVentas}</span>
          <span className="text-xs text-slate-400">({filtered.filter((p) => p.estado === 'entregado').length} entregados)</span>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          {(['hoy', 'ayer', '7dias', 'todos'] as const).map((key) => (
            <button
              key={key}
              onClick={() => setFiltro(key)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold capitalize transition-all shrink-0 ${
                filtro === key
                  ? 'bg-orange-500 text-white shadow-md shadow-orange-500/25'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {key === '7dias' ? 'Últimos 7 días' : key}
            </button>
          ))}
        </div>

        <div className="relative sm:w-64">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por cliente o ID..."
            className="w-full pl-9 pr-3.5 py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-orange-500"
          />
        </div>
      </div>

      {/* Tabla / Lista */}
      {loading ? (
        <div className="py-20 text-center text-slate-400 text-sm">
          Cargando historial...
        </div>
      ) : filtered.length === 0 ? (
        <div className="glass-panel rounded-3xl p-10 text-center my-6 max-w-sm mx-auto text-slate-400 text-sm">
          No se encontraron pedidos en este período.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {paginatedHistorial.map((p) => {
              const isEntregado = p.estado === 'entregado';
              return (
                <div
                  key={p.id}
                  className="glass-panel rounded-2xl p-4 border border-slate-800/80 bg-slate-900/60 text-slate-200 text-xs flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                      <span className={`px-2 py-0.5 rounded-lg text-xs font-bold flex items-center gap-1 ${
                        isEntregado
                          ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-300'
                          : 'bg-rose-500/15 border border-rose-500/30 text-rose-300'
                      }`}>
                        {isEntregado ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                        <span className="capitalize">{p.estado}</span>
                      </span>

                      <span className="text-slate-400 font-mono text-[11px]">
                        {new Date(p.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} •{' '}
                        {new Date(p.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                      </span>
                    </div>

                    <div className="py-2.5">
                      <div className="flex items-baseline justify-between">
                        <span className="font-bold text-sm text-white">{p.cliente}</span>
                        <span className="font-bold text-sm text-orange-400">C${p.total}</span>
                      </div>

                      <div className="flex items-center gap-2 text-slate-400 text-[11px] mt-1">
                        <span>{p.tipo_entrega === 'delivery' ? '🛵 Delivery' : '🏪 Retiro'}</span>
                        <span>•</span>
                        <span>{p.metodo_pago === 'transferencia' ? '💳 Transferencia' : '💵 Efectivo'}</span>
                      </div>

                      <div className="mt-2.5 pt-2 border-t border-slate-800/60 space-y-1">
                        {p.productos.map((item, idx) => (
                          <div key={idx} className="flex justify-between text-slate-300">
                            <span>
                              <span className="text-orange-400 font-bold mr-1">{item.cantidad}×</span>
                              {item.nombre} {item.opcion ? `(${item.opcion})` : ''}
                            </span>
                            <span className="text-slate-500">C${item.precio_unitario * item.cantidad}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-500 font-mono">
                    {p.tipo_entrega === 'delivery' ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          const costoEnvio = p.costo_envio ?? 40;
                          const subtotal = p.total - costoEnvio;
                          const lineas = [
                            '🛵 *Pedido para delivery*',
                            `👤 *Cliente:* ${p.cliente || 'Cliente'}`,
                            `📞 *Teléfono:* ${formatDeliveryPhone(p.telefono) || 'No especificado'}`,
                            `📍 *Dirección:* ${p.direccion || 'No especificada'}`,
                            '─────────────────────',
                            ...p.productos.map(item => `• ${item.cantidad}× ${item.nombre}${item.opcion ? ` (${item.opcion})` : ''}`),
                            '─────────────────────',
                            `💰 *Subtotal:* C$${subtotal > 0 ? subtotal : p.total}`,
                            `🛵 *Envío:* C$${costoEnvio}`,
                            `💰 *Total:* C$${p.total}`,
                            `💳 *Pago:* ${p.metodo_pago === 'efectivo' ? 'Efectivo' : 'Transferencia'}`,
                          ];
                          if (navigator.clipboard?.writeText) {
                            navigator.clipboard.writeText(lineas.join('\n'));
                            setCopiedId(p.id);
                            setTimeout(() => setCopiedId(null), 2000);
                          }
                        }}
                        className="flex items-center gap-1 text-slate-400 hover:text-orange-400 transition-colors"
                      >
                        <Copy className="w-3 h-3" />
                        <span>{copiedId === p.id ? '¡Copiado!' : 'Copiar delivery'}</span>
                      </button>
                    ) : <span />}
                    <span>ID: #{p.id.slice(-6).toUpperCase()}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Controles de Paginación */}
          {totalPages > 1 && (
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-between gap-4 py-3 border-t border-slate-800">
              <span className="text-xs text-slate-400">
                Mostrando <strong className="text-white">{(currentPage - 1) * ITEMS_PER_PAGE + 1}</strong> - <strong className="text-white">{Math.min(currentPage * ITEMS_PER_PAGE, filtered.length)}</strong> de <strong className="text-white">{filtered.length}</strong> pedidos
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
    </div>
  );
};
