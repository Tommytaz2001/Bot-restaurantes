import React, { useState, useEffect } from 'react';
import { AlertCircle, Check, X, Clock } from 'lucide-react';
import { CambioSolicitado } from '../services/api';

interface ChangeApprovalModalProps {
  isOpen: boolean;
  onClose: () => void;
  cambio: CambioSolicitado | null | undefined;
  cliente: string;
  tiempoEstimadoActual?: number | null;
  onApprove: (nuevoTiempoEstimado?: number) => void;
  onReject: () => void;
}

export const ChangeApprovalModal: React.FC<ChangeApprovalModalProps> = ({
  isOpen,
  onClose,
  cambio,
  cliente,
  tiempoEstimadoActual,
  onApprove,
  onReject,
}) => {
  const quickOptions = [15, 20, 25, 30, 45, 60];
  const [selectedMins, setSelectedMins] = useState<number | undefined>(tiempoEstimadoActual || 25);

  useEffect(() => {
    if (isOpen) {
      setSelectedMins(tiempoEstimadoActual || 25);
    }
  }, [isOpen, tiempoEstimadoActual]);

  if (!isOpen || !cambio) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
      <div className="glass-panel w-full max-w-md rounded-2xl p-6 shadow-2xl border border-amber-500/40 bg-slate-900 text-slate-100 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2 text-amber-400">
            <AlertCircle className="w-5 h-5" />
            <h3 className="font-bold text-base text-white">Solicitud de Modificación</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:bg-slate-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="my-4 space-y-3">
          <p className="text-sm text-slate-300">
            El cliente <strong className="text-white">{cliente}</strong> solicitó un cambio en su pedido ya confirmado:
          </p>

          <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-200 text-sm font-medium">
            "{cambio.descripcion}"
          </div>

          {cambio.productos_nuevos && cambio.productos_nuevos.length > 0 && (
            <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/60">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1.5">
                Productos a Añadir:
              </span>
              <ul className="text-sm space-y-1 text-slate-200">
                {cambio.productos_nuevos.map((p, idx) => (
                  <li key={idx} className="flex justify-between">
                    <span>{p.cantidad}x {p.nombre} {p.opcion ? `(${p.opcion})` : ''}</span>
                    <span className="font-semibold text-orange-400">C${p.precio_unitario * p.cantidad}</span>
                  </li>
                ))}
              </ul>
              {cambio.total_nuevo && (
                <div className="mt-2 pt-2 border-t border-slate-700 flex justify-between text-sm font-bold text-white">
                  <span>Nuevo Total:</span>
                  <span className="text-emerald-400">C${cambio.total_nuevo}</span>
                </div>
              )}
            </div>
          )}

          {cambio.datos_entrega && (
            <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/60 text-sm text-slate-200">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                Cambio de Entrega:
              </span>
              <p className="font-semibold capitalize text-orange-400">
                {cambio.datos_entrega.tipo_entrega}
              </p>
              {cambio.datos_entrega.direccion && (
                <p className="text-xs text-slate-400 mt-0.5">
                  Nueva dirección: {cambio.datos_entrega.direccion}
                </p>
              )}
            </div>
          )}

          {/* Selector de nuevo tiempo estimado */}
          <div className="p-3.5 rounded-xl bg-slate-800/60 border border-slate-700/60 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-orange-400 text-xs font-semibold uppercase tracking-wider">
                <Clock className="w-4 h-4" />
                <span>Nuevo Tiempo Estimado (ETA)</span>
              </div>
              {tiempoEstimadoActual ? (
                <span className="text-xs text-slate-400">
                  Actual: <strong className="text-slate-300">{tiempoEstimadoActual} min</strong>
                </span>
              ) : null}
            </div>

            <p className="text-xs text-slate-400">
              Se enviará este nuevo tiempo de espera al cliente por WhatsApp:
            </p>

            <div className="grid grid-cols-3 gap-2">
              {quickOptions.map((mins) => (
                <button
                  type="button"
                  key={mins}
                  onClick={() => setSelectedMins(mins)}
                  className={`py-2 px-1 rounded-lg text-xs font-bold border transition-all ${
                    selectedMins === mins
                      ? 'bg-orange-500 border-orange-400 text-white shadow-md shadow-orange-500/30'
                      : 'bg-slate-900/90 border-slate-700 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  {mins} min
                </button>
              ))}
            </div>

            <div className="flex items-center justify-between pt-1">
              <button
                type="button"
                onClick={() => setSelectedMins(undefined)}
                className={`text-xs px-2 py-1 rounded transition-colors ${
                  selectedMins === undefined
                    ? 'bg-slate-700 text-white font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Sin tiempo
              </button>
              {selectedMins !== undefined && (
                <span className="text-xs text-orange-300 font-semibold">
                  Nuevo ETA: {selectedMins} min
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 pt-3 border-t border-slate-800">
          <button
            onClick={onReject}
            className="flex-1 py-3 rounded-xl border border-rose-500/30 text-rose-300 font-semibold text-sm hover:bg-rose-950/40 flex items-center justify-center gap-1.5"
          >
            <X className="w-4 h-4" />
            Rechazar
          </button>
          <button
            onClick={() => onApprove(selectedMins)}
            className="flex-1 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm shadow-lg shadow-emerald-600/25 flex items-center justify-center gap-1.5"
          >
            <Check className="w-4 h-4" />
            Aprobar {selectedMins ? `(${selectedMins}m)` : ''}
          </button>
        </div>
      </div>
    </div>
  );
};
