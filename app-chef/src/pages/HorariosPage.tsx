import React, { useState, useEffect } from 'react';
import { Clock, Save, CheckCircle2 } from 'lucide-react';
import { fetchHorario, saveHorario } from '../services/api';

const DIAS = [
  { key: 'lunes', label: 'Lunes' },
  { key: 'martes', label: 'Martes' },
  { key: 'miercoles', label: 'Miércoles' },
  { key: 'jueves', label: 'Jueves' },
  { key: 'viernes', label: 'Viernes' },
  { key: 'sabado', label: 'Sábado' },
  { key: 'domingo', label: 'Domingo' },
];

export const HorariosPage: React.FC = () => {
  const [horario, setHorario] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    fetchHorario()
      .then((data) => setHorario(data || {}))
      .catch((e) => console.error(e))
      .finally(() => setLoading(false));
  }, []);

  const handleChange = (dia: string, field: string, value: any) => {
    setHorario((prev: any) => ({
      ...prev,
      [dia]: {
        ...(prev[dia] || {}),
        [field]: value,
      },
    }));
    setSavedSuccess(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveHorario(horario);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 sm:px-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="brand-font font-bold text-2xl text-white flex items-center gap-2">
            <Clock className="w-6 h-6 text-orange-400" />
            Horario de Atención
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Configura los días y horas en que el restaurante y el bot de WhatsApp están recibiendo pedidos.
          </p>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="px-5 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs shadow-lg shadow-orange-500/25 flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {savedSuccess ? (
            <>
              <CheckCircle2 className="w-4 h-4 text-white" />
              <span>¡Guardado!</span>
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              <span>{saving ? 'Guardando...' : 'Guardar Horarios'}</span>
            </>
          )}
        </button>
      </div>

      {loading ? (
        <div className="py-20 text-center text-slate-400 text-sm">
          Cargando configuración de horarios...
        </div>
      ) : (
        <div className="glass-panel rounded-3xl p-6 border border-slate-800 bg-slate-900/60 divide-y divide-slate-800">
          {DIAS.map(({ key, label }) => {
            const config = horario[key] || { abre: true, apertura: '17:00', cierre: '23:00' };
            const isOpen = config.abre !== false;

            return (
              <div key={key} className="py-4 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => handleChange(key, 'abre', !isOpen)}
                    className={`w-12 h-6 rounded-full transition-colors relative p-0.5 ${
                      isOpen ? 'bg-emerald-500' : 'bg-slate-700'
                    }`}
                  >
                    <div
                      className={`w-5 h-5 rounded-full bg-white transition-transform ${
                        isOpen ? 'translate-x-6' : 'translate-x-0'
                      }`}
                    />
                  </button>

                  <div>
                    <span className="font-bold text-sm text-white block">{label}</span>
                    <span className={`text-xs font-semibold ${isOpen ? 'text-emerald-400' : 'text-slate-500'}`}>
                      {isOpen ? 'Abierto' : 'Cerrado'}
                    </span>
                  </div>
                </div>

                {isOpen ? (
                  <div className="flex items-center gap-3">
                    <div>
                      <label className="text-[10px] text-slate-400 font-semibold uppercase block mb-1">
                        Apertura
                      </label>
                      <input
                        type="time"
                        value={config.apertura || '17:00'}
                        onChange={(e) => handleChange(key, 'apertura', e.target.value)}
                        className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white focus:outline-none focus:border-orange-500"
                      />
                    </div>

                    <span className="text-slate-600 mt-4">—</span>

                    <div>
                      <label className="text-[10px] text-slate-400 font-semibold uppercase block mb-1">
                        Cierre
                      </label>
                      <input
                        type="time"
                        value={config.cierre || '23:00'}
                        onChange={(e) => handleChange(key, 'cierre', e.target.value)}
                        className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white focus:outline-none focus:border-orange-500"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-slate-500 italic">
                    El bot avisará que el restaurante está cerrado este día.
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
