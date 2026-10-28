import React, { useState, useEffect } from 'react';
import { 
  ShieldAlert, 
  UserX, 
  Bike, 
  Plus, 
  Trash2, 
  Search, 
  AlertCircle, 
  CheckCircle2, 
  PhoneCall, 
  Info,
  Sparkles
} from 'lucide-react';
import { 
  fetchBlacklist, 
  addBlacklistNumber, 
  deleteBlacklistNumber, 
  BlacklistItem 
} from '../services/api';

const QUICK_TAGS = ['Repartidor', 'Mandados', 'Delivery', 'Personal', 'Bloqueado'];

export const BlacklistPage: React.FC = () => {
  const [items, setItems] = useState<BlacklistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  
  // Form state
  const [telefono, setTelefono] = useState('');
  const [nombre, setNombre] = useState('');
  const [motivo, setMotivo] = useState('Repartidor');
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await fetchBlacklist();
      setItems(data);
    } catch (e: any) {
      console.error('[BlacklistPage] Error cargando:', e);
      setErrorMsg(e.message || 'Error al cargar lista negra');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    const cleanTel = telefono.trim();
    if (!cleanTel) {
      setErrorMsg('Por favor ingresa un número de teléfono');
      return;
    }

    setSaving(true);
    try {
      const newItem = await addBlacklistNumber({
        telefono: cleanTel,
        nombre: nombre.trim() || 'Repartidor',
        motivo: motivo.trim() || 'Repartidor',
      });

      // Actualizar lista local
      setItems((prev) => {
        const withoutOld = prev.filter((i) => i.id !== newItem.id);
        return [newItem, ...withoutOld];
      });

      setTelefono('');
      setNombre('');
      setMotivo('Repartidor');
      setSuccessMsg(`✅ Número ${cleanTel} agregado a la lista negra con éxito`);
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Error al guardar número');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, phone: string) => {
    if (!confirm(`¿Eliminar ${phone} de la lista negra? El bot volverá a responderle.`)) return;

    try {
      await deleteBlacklistNumber(id);
      setItems((prev) => prev.filter((item) => item.id !== id));
      setSuccessMsg(`Número ${phone} removido de la lista negra`);
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      alert(err.message || 'Error al eliminar número');
    }
  };

  const filtered = items.filter((item) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      item.telefono.toLowerCase().includes(q) ||
      item.telefono_clean.toLowerCase().includes(q) ||
      (item.nombre && item.nombre.toLowerCase().includes(q)) ||
      (item.motivo && item.motivo.toLowerCase().includes(q))
    );
  });

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 sm:px-6">
      {/* Encabezado */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400 shadow-lg shadow-rose-500/10">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h1 className="brand-font font-bold text-2xl text-white flex items-center gap-2">
                Lista Negra / Repartidores
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-rose-500/10 text-rose-300 border border-rose-500/20 font-sans font-semibold">
                  Silencio Bot
                </span>
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">
                Los números registrados aquí <strong className="text-rose-300">no recibirán respuestas del bot</strong>, evitando confusiones con repartidores de mandados o terceros.
              </p>
            </div>
          </div>
        </div>

        {/* Contador */}
        <div className="glass-panel px-4 py-2.5 rounded-2xl flex items-center gap-3 border border-rose-500/30 bg-rose-950/20 shrink-0">
          <UserX className="w-4 h-4 text-rose-400" />
          <span className="text-xs text-rose-300 font-semibold">Números bloqueados:</span>
          <span className="text-lg font-black text-white font-mono">{items.length}</span>
        </div>
      </div>

      {/* Alertas de Feedback */}
      {errorMsg && (
        <div className="mb-5 p-3.5 rounded-xl bg-rose-950/60 border border-rose-500/40 text-rose-200 text-xs flex items-center gap-2.5 animate-fadeIn">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}
      {successMsg && (
        <div className="mb-5 p-3.5 rounded-xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-200 text-xs flex items-center gap-2.5 animate-fadeIn">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Formulario para Registrar Número */}
      <div className="glass-panel rounded-2xl p-5 mb-8 border border-slate-800 bg-slate-900/60 shadow-xl">
        <div className="flex items-center gap-2 pb-3 mb-4 border-b border-slate-800">
          <Plus className="w-4 h-4 text-orange-400" />
          <h2 className="text-sm font-bold text-white tracking-wide">
            Registrar Nuevo Repartidor / Número Bloqueado
          </h2>
        </div>

        <form onSubmit={handleAdd} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Input Teléfono */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Número de Celular <span className="text-rose-400">*</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={telefono}
                  onChange={(e) => setTelefono(e.target.value)}
                  placeholder="+505 8888 8888 o 88888888"
                  className="w-full pl-9 pr-3 py-2.5 bg-slate-950/80 border border-slate-700/80 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-orange-500 font-mono"
                  required
                />
                <PhoneCall className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                Acepta con código internacional (+505, +593) o número local de 8 dígitos.
              </p>
            </div>

            {/* Input Nombre / Identificador */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Nombre / Identificador
              </label>
              <input
                type="text"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Ej: Repartidor Carlos, Mandados Express"
                className="w-full px-3 py-2.5 bg-slate-950/80 border border-slate-700/80 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-orange-500"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                Para identificar de quién es el contacto en la cocina.
              </p>
            </div>

            {/* Input Motivo / Categoría */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Motivo / Etiqueta
              </label>
              <input
                type="text"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Repartidor, Mandados..."
                className="w-full px-3 py-2.5 bg-slate-950/80 border border-slate-700/80 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-orange-500"
              />
              {/* Quick tags */}
              <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                {QUICK_TAGS.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => setMotivo(tag)}
                    className={`text-[10px] px-2 py-0.5 rounded-lg border transition-all ${
                      motivo === tag
                        ? 'bg-orange-500/20 border-orange-500/40 text-orange-300 font-bold'
                        : 'bg-slate-800/80 border-slate-700 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end pt-2">
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 active:scale-95 text-white font-bold text-xs shadow-lg shadow-orange-500/20 flex items-center gap-2 transition-all disabled:opacity-50"
            >
              <Plus className="w-4 h-4" />
              <span>{saving ? 'Guardando...' : 'Agregar a Lista Negra'}</span>
            </button>
          </div>
        </form>
      </div>

      {/* Barra de Búsqueda y Filtro */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mb-4">
        <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
          <span>Contactos en Silencio</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 font-normal">
            {filtered.length} encontrados
          </span>
        </h3>

        <div className="relative sm:w-72">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por número o nombre..."
            className="w-full pl-9 pr-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-orange-500"
          />
        </div>
      </div>

      {/* Lista de Números */}
      {loading ? (
        <div className="py-16 text-center text-slate-500 text-xs flex flex-col items-center justify-center gap-2">
          <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
          <span>Cargando lista negra...</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="glass-panel rounded-2xl p-10 border border-slate-800 text-center bg-slate-900/40">
          <div className="w-12 h-12 rounded-2xl bg-slate-800/80 border border-slate-700/60 flex items-center justify-center text-slate-400 mx-auto mb-3">
            <Bike className="w-6 h-6" />
          </div>
          <h4 className="text-sm font-bold text-white mb-1">
            {search ? 'Sin coincidencias' : 'No hay números en la lista negra'}
          </h4>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            {search
              ? 'No se encontraron números o nombres que coincidan con tu búsqueda.'
              : 'Agrega los números de celular de tus repartidores o mandados para que el bot no les conteste y así no interfiera con sus entregas.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((item) => {
            const isRepartidor = item.motivo?.toLowerCase().includes('repartidor') || item.motivo?.toLowerCase().includes('delivery') || item.motivo?.toLowerCase().includes('mandado');
            return (
              <div
                key={item.id}
                className="glass-panel rounded-2xl p-4 border border-slate-800/80 bg-slate-900/60 text-slate-200 text-xs flex flex-col justify-between hover:border-slate-700 transition-all group"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 pb-2.5 border-b border-slate-800">
                    <div className="flex items-center gap-2.5">
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                        isRepartidor 
                          ? 'bg-blue-500/15 border border-blue-500/30 text-blue-400' 
                          : 'bg-rose-500/15 border border-rose-500/30 text-rose-400'
                      }`}>
                        {isRepartidor ? <Bike className="w-4 h-4" /> : <UserX className="w-4 h-4" />}
                      </div>
                      <div>
                        <div className="font-bold text-white text-sm leading-tight">
                          {item.nombre || 'Sin nombre'}
                        </div>
                        <span className={`inline-block mt-0.5 px-2 py-0.5 rounded-md text-[10px] font-semibold border ${
                          isRepartidor
                            ? 'bg-blue-500/10 border-blue-500/20 text-blue-300'
                            : 'bg-rose-500/10 border-rose-500/20 text-rose-300'
                        }`}>
                          {item.motivo || 'Bloqueado'}
                        </span>
                      </div>
                    </div>

                    <button
                      onClick={() => handleDelete(item.id, item.telefono)}
                      title="Eliminar de lista negra"
                      className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-950/40 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="mt-3 space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400 font-medium">Teléfono:</span>
                      <span className="font-mono font-bold text-white tracking-wide">
                        {item.telefono}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-slate-400">
                      <span>Dígitos limpios:</span>
                      <span className="font-mono text-slate-300">{item.telefono_clean}</span>
                    </div>
                  </div>
                </div>

                <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-500">
                  <span>Registrado:</span>
                  <span>{new Date(item.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
