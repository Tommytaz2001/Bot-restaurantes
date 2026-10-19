import React, { useState } from 'react';
import { Settings, X, Save } from 'lucide-react';
import { getBackendUrl, setBackendUrl } from '../services/api';

interface BackendConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const BackendConfigModal: React.FC<BackendConfigModalProps> = ({ isOpen, onClose }) => {
  const [url, setUrl] = useState(getBackendUrl());

  if (!isOpen) return null;

  const handleSave = () => {
    setBackendUrl(url.trim());
    onClose();
    window.location.reload();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="glass-panel w-full max-w-sm rounded-2xl p-6 shadow-2xl border border-slate-700 bg-slate-900 text-slate-100">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2 text-orange-400">
            <Settings className="w-5 h-5" />
            <h3 className="font-bold text-base text-white">Configurar Servidor</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:bg-slate-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="my-4">
          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
            URL del Backend
          </label>
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="http://localhost:3001"
            className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-orange-500"
          />
          <p className="text-xs text-slate-500 mt-2">
            Si abres esta app desde tu celular o tablet en la misma red WiFi, escribe la IP de tu PC (ej: <code className="text-orange-400">http://192.168.1.50:3001</code>).
          </p>
        </div>

        <div className="flex items-center gap-2.5 pt-2 border-t border-slate-800">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-slate-700 text-slate-300 font-semibold text-xs hover:bg-slate-800"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            className="flex-1 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs shadow-lg shadow-orange-500/25 flex items-center justify-center gap-1.5"
          >
            <Save className="w-4 h-4" />
            Guardar y Recargar
          </button>
        </div>
      </div>
    </div>
  );
};
