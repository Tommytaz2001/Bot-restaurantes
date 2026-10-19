import React, { useState } from 'react';
import { Clock, X, Check } from 'lucide-react';

interface EtaModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (mins?: number) => void;
  pedidoCliente: string;
}

export const EtaModal: React.FC<EtaModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  pedidoCliente,
}) => {
  const [selectedMins, setSelectedMins] = useState<number>(25);

  if (!isOpen) return null;

  const quickOptions = [15, 20, 25, 30, 45, 60];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="glass-panel w-full max-w-sm rounded-2xl p-6 shadow-2xl border border-slate-700 bg-slate-900 text-slate-100">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2 text-orange-400">
            <Clock className="w-5 h-5" />
            <h3 className="font-bold text-lg text-white">Tiempo Estimado (ETA)</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:bg-slate-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="mt-3 text-sm text-slate-300">
          Confirmar comanda de <strong className="text-white">{pedidoCliente}</strong>.
          Se notificará automáticamente al cliente por WhatsApp con este tiempo.
        </p>

        <div className="grid grid-cols-3 gap-2.5 my-5">
          {quickOptions.map((mins) => (
            <button
              key={mins}
              onClick={() => setSelectedMins(mins)}
              className={`py-3 px-2 rounded-xl text-sm font-bold border transition-all ${
                selectedMins === mins
                  ? 'bg-orange-500 border-orange-400 text-white shadow-lg shadow-orange-500/30'
                  : 'bg-slate-800/80 border-slate-700 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {mins} min
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2.5 pt-2">
          <button
            onClick={() => onConfirm(undefined)}
            className="flex-1 py-3 rounded-xl border border-slate-700 text-slate-300 font-semibold text-sm hover:bg-slate-800"
          >
            Sin tiempo
          </button>
          <button
            onClick={() => onConfirm(selectedMins)}
            className="flex-1 py-3 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold text-sm shadow-lg shadow-orange-500/25 flex items-center justify-center gap-1.5"
          >
            <Check className="w-4 h-4" />
            Confirmar ({selectedMins}m)
          </button>
        </div>
      </div>
    </div>
  );
};
