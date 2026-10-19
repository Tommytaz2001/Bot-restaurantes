import React from 'react';
import { AlertCircle, Check, X } from 'lucide-react';
import { CambioSolicitado } from '../services/api';

interface ChangeApprovalModalProps {
  isOpen: boolean;
  onClose: () => void;
  cambio: CambioSolicitado | null | undefined;
  cliente: string;
  onApprove: () => void;
  onReject: () => void;
}

export const ChangeApprovalModal: React.FC<ChangeApprovalModalProps> = ({
  isOpen,
  onClose,
  cambio,
  cliente,
  onApprove,
  onReject,
}) => {
  if (!isOpen || !cambio) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
      <div className="glass-panel w-full max-w-md rounded-2xl p-6 shadow-2xl border border-amber-500/40 bg-slate-900 text-slate-100">
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
            onClick={onApprove}
            className="flex-1 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm shadow-lg shadow-emerald-600/25 flex items-center justify-center gap-1.5"
          >
            <Check className="w-4 h-4" />
            Aprobar Cambio
          </button>
        </div>
      </div>
    </div>
  );
};
