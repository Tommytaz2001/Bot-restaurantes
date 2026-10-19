import React from 'react';
import { X, ExternalLink, Download } from 'lucide-react';
import { getBackendUrl } from '../services/api';

interface VoucherModalProps {
  isOpen: boolean;
  onClose: () => void;
  voucherUrl: string | null;
  cliente: string;
}

export const VoucherModal: React.FC<VoucherModalProps> = ({
  isOpen,
  onClose,
  voucherUrl,
  cliente,
}) => {
  if (!isOpen || !voucherUrl) return null;

  const fullUrl = voucherUrl.startsWith('http')
    ? voucherUrl
    : `${getBackendUrl()}${voucherUrl}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="glass-panel w-full max-w-lg rounded-2xl p-5 shadow-2xl border border-slate-700 bg-slate-900 text-slate-100 flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div>
            <h3 className="font-bold text-base text-white">Comprobante de Transferencia</h3>
            <p className="text-xs text-slate-400">Cliente: {cliente}</p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:bg-slate-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-auto my-4 flex items-center justify-center bg-slate-950/60 rounded-xl p-2 border border-slate-800">
          <img
            src={fullUrl}
            alt="Comprobante de pago"
            className="max-h-[60vh] max-w-full object-contain rounded-lg"
          />
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-slate-800 text-sm">
          <a
            href={fullUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 text-xs text-orange-400 hover:underline"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Abrir imagen original
          </a>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-medium text-xs"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
