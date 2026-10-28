import React, { useState, useEffect } from 'react';
import { Clock, Save, CheckCircle2, Sparkles, PowerOff, Power } from 'lucide-react';
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

  const todosDesactivados = DIAS.length > 0 && DIAS.every(({ key }) => {
    const config = horario[key];
    return config && config.abre === false;
  });

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

  const handleDesactivarTodos = () => {
    setHorario((prev: any) => {
      const next: any = { ...prev };
      DIAS.forEach(({ key }) => {
        next[key] = { ...(next[key] || {}), abre: false };
      });
      return next;
    });
    setSavedSuccess(false);
  };

  const handleActivarTodos = () => {
    setHorario((prev: any) => {
      const next: any = { ...prev };
      DIAS.forEach(({ key }) => {
        next[key] = { ...(next[key] || {}), abre: true };
      });
      return next;
    });
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

        <div className="flex items-center gap-2">
          {todosDesactivados ? (
            <button
              onClick={handleActivarTodos}
              type="button"
              className="px-3.5 py-2.5 rounded-xl border border-emerald-500/30 bg-emerald-950/40 text-emerald-300 hover:bg-emerald-900/60 font-semibold text-xs flex items-center gap-1.5 transition-all"
              title="Restaurar atención en todos los días"
            >
              <Power className="w-3.5 h-3.5" />
              <span>Activar Todos</span>
            </button>
          ) : (
            <button
              onClick={handleDesactivarTodos}
              type="button"
              className="px-3.5 py-2.5 rounded-xl border border-amber-500/30 bg-amber-950/40 text-amber-300 hover:bg-amber-900/60 font-semibold text-xs flex items-center gap-1.5 transition-all"
              title="Desactivar todos los días para activar Modo Dev 24/7 del bot"
            >
              <PowerOff className="w-3.5 h-3.5" />
              <span>Modo Dev (24/7)</span>
            </button>
          )}

          <button
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 active:scale-95 text-white font-bold text-xs shadow-lg shadow-orange-500/25 flex items-center justify-center gap-2 disabled:opacity-50 transition-all"
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
      </div>

      {/* Banner de Modo Dev / Test 24/7 */}
      {todosDesactivados && (
        <div className="mb-6 p-4 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-200 flex items-start gap-3 shadow-lg shadow-amber-500/5 animate-fadeIn">
          <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 shrink-0 mt-0.5">
            <Sparkles className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <div className="font-bold text-sm text-white flex items-center gap-2">
              <span>🛠️ Modo Dev / Test 24/7 Activado</span>
              <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 font-mono font-bold">
                BOT SIEMPRE ACTIVO
              </span>
            </div>
            <p className="text-xs text-amber-200/90 mt-1">
              Todos los días de la semana están desactivados. En este modo, el bot <strong>ignora los horarios y atenderá siempre (24/7 sin restricciones)</strong> por WhatsApp para pruebas.
            </p>
          </div>
        </div>
      )}


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
