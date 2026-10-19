import React, { useState, useEffect } from 'react';
import { 
  Bike, 
  Store, 
  Clock, 
  MapPin, 
  Banknote, 
  CreditCard, 
  Image, 
  AlertTriangle, 
  CheckCircle2, 
  ChevronRight,
  Phone
} from 'lucide-react';
import { Pedido } from '../services/api';

interface OrderCardProps {
  pedido: Pedido;
  onConfirmClick: (pedido: Pedido) => void;
  onEnCaminoClick: (id: string) => void;
  onEntregadoClick: (id: string) => void;
  onRechazarClick: (id: string) => void;
  onViewVoucher: (url: string, cliente: string) => void;
  onViewChange: (pedido: Pedido) => void;
}

export const OrderCard: React.FC<OrderCardProps> = ({
  pedido,
  onConfirmClick,
  onEnCaminoClick,
  onEntregadoClick,
  onRechazarClick,
  onViewVoucher,
  onViewChange,
}) => {
  const [elapsedMinutes, setElapsedMinutes] = useState<number>(0);
  const [checkedItems, setCheckedItems] = useState<Record<number, boolean>>({});

  useEffect(() => {
    const calcElapsed = () => {
      const createdTime = new Date(pedido.createdAt).getTime();
      const now = Date.now();
      const diffMins = Math.max(0, Math.floor((now - createdTime) / 60000));
      setElapsedMinutes(diffMins);
    };

    calcElapsed();
    const timer = setInterval(calcElapsed, 30000);
    return () => clearInterval(timer);
  }, [pedido.createdAt]);

  const toggleCheck = (idx: number) => {
    setCheckedItems((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };

  const isDelivery = pedido.tipo_entrega === 'delivery';
  const hasChangePending = pedido.cambio_solicitado?.estado === 'pendiente_chef';

  // Timer color coding
  const timerBadgeClass = elapsedMinutes > 30
    ? 'bg-rose-500/20 text-rose-300 border-rose-500/40 animate-pulse'
    : elapsedMinutes > 15
    ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
    : 'bg-slate-800 text-slate-300 border-slate-700';

  return (
    <div className={`glass-panel rounded-2xl p-5 flex flex-col justify-between transition-all duration-200 shadow-xl ${
      hasChangePending ? 'ring-2 ring-amber-500/60 bg-amber-950/20' : ''
    } ${pedido.estado === 'pendiente' ? 'border-orange-500/40 bg-orange-950/10' : ''}`}>
      <div>
        {/* Encabezado: Timer, Estado y Tipo de Entrega */}
        <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <span className={`text-xs px-2.5 py-1 rounded-lg border font-bold flex items-center gap-1.5 ${timerBadgeClass}`}>
              <Clock className="w-3.5 h-3.5" />
              <span>{elapsedMinutes}m</span>
            </span>

            <span className="text-xs text-slate-400 font-mono">
              #{pedido.id.slice(-6).toUpperCase()}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            {isDelivery ? (
              <span className="px-2.5 py-1 rounded-lg bg-blue-500/15 border border-blue-500/30 text-blue-400 text-xs font-bold flex items-center gap-1">
                <Bike className="w-3.5 h-3.5" />
                Delivery
              </span>
            ) : (
              <span className="px-2.5 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-bold flex items-center gap-1">
                <Store className="w-3.5 h-3.5" />
                Retiro
              </span>
            )}
          </div>
        </div>

        {/* Cliente y Detalles */}
        <div className="py-3">
          <div className="flex items-center justify-between">
            <h4 className="text-base font-extrabold text-white truncate max-w-[200px]">
              {pedido.cliente || 'Cliente'}
            </h4>
            <span className="text-base font-bold text-orange-400">
              C${pedido.total}
            </span>
          </div>

          {pedido.telefono && (
            <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-0.5">
              <Phone className="w-3 h-3 text-slate-500" />
              <span>{pedido.telefono}</span>
            </div>
          )}

          {isDelivery && pedido.direccion && (
            <div className="flex items-start gap-1.5 text-xs text-slate-300 mt-2 bg-slate-900/60 p-2 rounded-xl border border-slate-800/80">
              <MapPin className="w-3.5 h-3.5 text-orange-400 shrink-0 mt-0.5" />
              <span className="line-clamp-2 leading-relaxed">{pedido.direccion}</span>
            </div>
          )}

          {/* Método de Pago y Comprobante */}
          <div className="flex items-center justify-between mt-2.5 text-xs">
            <div className="flex items-center gap-1 text-slate-400">
              {pedido.metodo_pago === 'transferencia' ? (
                <span className="flex items-center gap-1 text-purple-400 font-medium">
                  <CreditCard className="w-3.5 h-3.5" />
                  Transferencia
                </span>
              ) : (
                <span className="flex items-center gap-1 text-emerald-400 font-medium">
                  <Banknote className="w-3.5 h-3.5" />
                  Efectivo
                </span>
              )}
            </div>

            {pedido.comprobante_url ? (
              <button
                onClick={() => onViewVoucher(pedido.comprobante_url!, pedido.cliente)}
                className="px-2 py-1 rounded-lg bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/40 text-purple-300 font-semibold text-xs flex items-center gap-1"
              >
                <Image className="w-3 h-3" />
                Ver Comprobante
              </button>
            ) : pedido.metodo_pago === 'transferencia' ? (
              <span className="text-amber-400 text-[11px] font-medium">
                Sin comprobante aún
              </span>
            ) : null}
          </div>
        </div>

        {/* Banner de Modificación Solicitada */}
        {hasChangePending && (
          <div
            onClick={() => onViewChange(pedido)}
            className="my-2 p-2.5 rounded-xl bg-amber-500/20 border border-amber-500/50 cursor-pointer hover:bg-amber-500/30 transition-all flex items-center justify-between text-xs text-amber-200"
          >
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <span className="font-bold">¡Cambio solicitado por el cliente!</span>
            </div>
            <ChevronRight className="w-4 h-4 text-amber-400" />
          </div>
        )}

        {/* Lista de Productos con Checkboxes */}
        <div className="my-3 space-y-2 bg-slate-900/40 p-3 rounded-xl border border-slate-800">
          {pedido.productos.map((item, idx) => {
            const isChecked = !!checkedItems[idx];
            return (
              <div
                key={idx}
                onClick={() => toggleCheck(idx)}
                className={`flex items-start gap-2.5 p-1.5 rounded-lg cursor-pointer transition-colors ${
                  isChecked ? 'opacity-40 line-through' : 'hover:bg-slate-800/40'
                }`}
              >
                <div className={`w-4 h-4 mt-0.5 rounded flex items-center justify-center border ${
                  isChecked ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-600'
                }`}>
                  {isChecked && <CheckCircle2 className="w-3 h-3" />}
                </div>

                <div className="flex-1 text-sm">
                  <div className="flex justify-between items-baseline">
                    <span className="font-bold text-white">
                      <span className="text-orange-400 mr-1.5">{item.cantidad}×</span>
                      {item.nombre}
                    </span>
                    <span className="text-xs text-slate-400">
                      C${item.precio_unitario * item.cantidad}
                    </span>
                  </div>

                  {item.opcion && (
                    <span className="inline-block mt-0.5 px-2 py-0.5 rounded-md bg-orange-500/10 border border-orange-500/20 text-orange-300 text-xs font-medium">
                      {item.opcion}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Botones de Acción de Estado */}
      <div className="pt-3 border-t border-slate-800 flex items-center gap-2">
        {pedido.estado === 'pendiente' || pedido.estado === 'pendiente_pago' ? (
          <>
            <button
              onClick={() => onRechazarClick(pedido.id)}
              className="py-2.5 px-3 rounded-xl border border-rose-500/30 text-rose-300 hover:bg-rose-950/40 text-xs font-semibold"
            >
              Rechazar
            </button>
            <button
              onClick={() => onConfirmClick(pedido)}
              className="flex-1 py-2.5 px-4 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs shadow-lg shadow-orange-500/25 flex items-center justify-center gap-1.5"
            >
              <span>Confirmar Pedido</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </>
        ) : pedido.estado === 'confirmado' ? (
          <button
            onClick={() => onEnCaminoClick(pedido.id)}
            className="w-full py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-lg shadow-blue-600/25 flex items-center justify-center gap-2"
          >
            {isDelivery ? (
              <>
                <Bike className="w-4 h-4" />
                <span>Marcar En Camino</span>
              </>
            ) : (
              <>
                <Store className="w-4 h-4" />
                <span>Listo para Retiro</span>
              </>
            )}
          </button>
        ) : pedido.estado === 'en_camino' ? (
          <button
            onClick={() => onEntregadoClick(pedido.id)}
            className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg shadow-emerald-600/25 flex items-center justify-center gap-1.5"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>Marcar Entregado</span>
          </button>
        ) : (
          <div className="w-full text-center text-xs text-slate-500 py-1 capitalize font-medium">
            Estado: {pedido.estado}
          </div>
        )}
      </div>
    </div>
  );
};
