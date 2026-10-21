import React, { useState, useEffect } from 'react';
import { 
  BookOpen, 
  Check, 
  X, 
  Search, 
  RefreshCw, 
  AlertCircle, 
  AlertTriangle, 
  Plus, 
  Trash2, 
  Edit3, 
  FolderPlus,
  DollarSign,
  Layers
} from 'lucide-react';
import { 
  fetchCategorias, 
  toggleDisponibilidad, 
  fetchProteinasBloqueadas, 
  saveProteinasBloqueadas, 
  createCategoria,
  deleteCategoria,
  createProducto,
  updateProducto,
  deleteProducto,
  MenuCategoriaAdmin,
  MenuItemAdmin
} from '../services/api';

const LISTA_PROTEINAS = [
  { id: 'res', label: 'Res', emoji: '🥩' },
  { id: 'pollo', label: 'Pollo', emoji: '🍗' },
  { id: 'cerdo', label: 'Cerdo / Pastor', emoji: '🐷' },
  { id: 'birria', label: 'Birria', emoji: '🌮' },
];

const PROTEINA_TAGS: Record<string, { label: string; emoji: string }> = {
  res: { label: 'Res', emoji: '🥩' },
  pollo: { label: 'Pollo', emoji: '🍗' },
  cerdo: { label: 'Cerdo', emoji: '🐷' },
  birria: { label: 'Birria', emoji: '🌮' },
  mixto: { label: 'Mixto (Pollo/Cerdo)', emoji: '🍲' },
};

function isItemBlockedByProtein(proteina: string | null | undefined, bloqueadas: string[]): boolean {
  if (!proteina || !bloqueadas || bloqueadas.length === 0) return false;
  const norm = proteina.toLowerCase().trim();
  const list = bloqueadas.map((p) => p.toLowerCase().trim());
  if (list.includes(norm)) return true;
  if (norm === 'mixto' && (list.includes('pollo') || list.includes('cerdo'))) return true;
  return false;
}

export const MenuPage: React.FC = () => {
  const [categorias, setCategorias] = useState<MenuCategoriaAdmin[]>([]);
  const [proteinasBloqueadas, setProteinasBloqueadasState] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [updating, setUpdating] = useState<string | null>(null);
  const [updatingProteina, setUpdatingProteina] = useState<string | null>(null);

  // Estados de Modales
  const [showModalPlatillo, setShowModalPlatillo] = useState(false);
  const [showModalCategoria, setShowModalCategoria] = useState(false);
  const [savingItem, setSavingItem] = useState(false);
  const [savingCat, setSavingCat] = useState(false);

  // Formulario Platillo
  const [editandoItem, setEditandoItem] = useState<{ categoriaId: string; item?: MenuItemAdmin } | null>(null);
  const [formPlatillo, setFormPlatillo] = useState({
    categoriaId: '',
    nombre: '',
    precio: '',
    descripcion: '',
    proteina: '',
    opciones: '',
  });

  // Formulario Categoría
  const [formCategoria, setFormCategoria] = useState({
    nombre: '',
    orden: 0,
  });

  const loadMenu = async () => {
    setLoading(true);
    setError(null);
    try {
      const [cats, blocked] = await Promise.all([
        fetchCategorias(),
        fetchProteinasBloqueadas(),
      ]);
      setCategorias(cats);
      setProteinasBloqueadasState(blocked);
    } catch (e: any) {
      console.error('[MenuPage] Error al cargar categorías o proteínas:', e);
      setError(e.message || 'Error de conexión con el servidor');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMenu();
  }, []);

  const handleToggle = async (catId: string, itemId: string) => {
    setUpdating(itemId);
    try {
      await toggleDisponibilidad(catId, itemId);
      setCategorias((prev) =>
        prev.map((cat) => {
          if (cat.id !== catId) return cat;
          return {
            ...cat,
            items: cat.items.map((it) =>
              it.id === itemId ? { ...it, disponible: !it.disponible } : it
            ),
          };
        })
      );
    } catch (e) {
      console.error(e);
      alert('Error cambiando disponibilidad del platillo');
    } finally {
      setUpdating(null);
    }
  };

  const handleToggleProteina = async (proteinaId: string) => {
    const isCurrentlyBlocked = proteinasBloqueadas.includes(proteinaId);
    const nextBlocked = isCurrentlyBlocked
      ? proteinasBloqueadas.filter((p) => p !== proteinaId)
      : [...proteinasBloqueadas, proteinaId];

    setUpdatingProteina(proteinaId);
    setProteinasBloqueadasState(nextBlocked);

    setCategorias((prev) =>
      prev.map((cat) => ({
        ...cat,
        items: cat.items.map((it) => ({
          ...it,
          bloqueadoPorProteina: isItemBlockedByProtein(it.proteina, nextBlocked),
        })),
      }))
    );

    try {
      await saveProteinasBloqueadas(nextBlocked);
    } catch (e: any) {
      console.error('[MenuPage] Error guardando proteínas:', e);
      setProteinasBloqueadasState(proteinasBloqueadas);
      setCategorias((prev) =>
        prev.map((cat) => ({
          ...cat,
          items: cat.items.map((it) => ({
            ...it,
            bloqueadoPorProteina: isItemBlockedByProtein(it.proteina, proteinasBloqueadas),
          })),
        }))
      );
      alert('Error al guardar el estado de la proteína. Por favor reintenta.');
    } finally {
      setUpdatingProteina(null);
    }
  };

  // Abrir Modal para Nuevo Platillo
  const handleOpenNuevoPlatillo = (defaultCategoriaId?: string) => {
    const targetCat = defaultCategoriaId || (categorias.length > 0 ? categorias[0].id : '');
    setEditandoItem(null);
    setFormPlatillo({
      categoriaId: targetCat,
      nombre: '',
      precio: '',
      descripcion: '',
      proteina: '',
      opciones: '',
    });
    setShowModalPlatillo(true);
  };

  // Abrir Modal para Editar Platillo
  const handleOpenEditarPlatillo = (catId: string, item: MenuItemAdmin) => {
    setEditandoItem({ categoriaId: catId, item });
    setFormPlatillo({
      categoriaId: catId,
      nombre: item.nombre,
      precio: item.precio.toString(),
      descripcion: item.descripcion || '',
      proteina: item.proteina || '',
      opciones: Array.isArray(item.opciones) ? item.opciones.join(', ') : '',
    });
    setShowModalPlatillo(true);
  };

  // Guardar Platillo (Crear o Editar)
  const handleSavePlatillo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formPlatillo.nombre.trim()) {
      alert('Por favor ingresa el nombre del platillo.');
      return;
    }
    const precioNum = parseFloat(formPlatillo.precio);
    if (isNaN(precioNum) || precioNum < 0) {
      alert('Por favor ingresa un precio válido.');
      return;
    }
    if (!formPlatillo.categoriaId) {
      alert('Por favor selecciona una categoría.');
      return;
    }

    const opcionesArray = formPlatillo.opciones
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    setSavingItem(true);
    try {
      if (editandoItem && editandoItem.item) {
        // Actualizar existente
        await updateProducto(editandoItem.categoriaId, editandoItem.item.id, {
          nombre: formPlatillo.nombre.trim(),
          precio: precioNum,
          descripcion: formPlatillo.descripcion.trim(),
          proteina: formPlatillo.proteina ? (formPlatillo.proteina as any) : null,
          opciones: opcionesArray,
          disponible: editandoItem.item.disponible,
        });
      } else {
        // Crear nuevo
        await createProducto(formPlatillo.categoriaId, {
          nombre: formPlatillo.nombre.trim(),
          precio: precioNum,
          descripcion: formPlatillo.descripcion.trim(),
          proteina: formPlatillo.proteina ? (formPlatillo.proteina as any) : null,
          opciones: opcionesArray,
          disponible: true,
        });
      }

      setShowModalPlatillo(false);
      await loadMenu();
    } catch (err: any) {
      console.error('[MenuPage] Error guardando platillo:', err);
      alert(err.message || 'Error guardando platillo');
    } finally {
      setSavingItem(false);
    }
  };

  // Eliminar Platillo
  const handleDeletePlatillo = async (catId: string, itemId: string, nombre: string) => {
    if (!confirm(`¿Estás seguro de eliminar "${nombre}" del menú?`)) return;
    try {
      await deleteProducto(catId, itemId);
      setCategorias((prev) =>
        prev.map((cat) => {
          if (cat.id !== catId) return cat;
          return {
            ...cat,
            items: cat.items.filter((it) => it.id !== itemId),
          };
        })
      );
    } catch (err: any) {
      console.error('[MenuPage] Error eliminando platillo:', err);
      alert(err.message || 'Error eliminando platillo');
    }
  };

  // Guardar Categoría
  const handleSaveCategoria = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formCategoria.nombre.trim()) {
      alert('Por favor ingresa el nombre de la categoría.');
      return;
    }

    setSavingCat(true);
    try {
      await createCategoria(formCategoria.nombre.trim(), formCategoria.orden || categorias.length);
      setShowModalCategoria(false);
      setFormCategoria({ nombre: '', orden: 0 });
      await loadMenu();
    } catch (err: any) {
      console.error('[MenuPage] Error creando categoría:', err);
      alert(err.message || 'Error creando categoría');
    } finally {
      setSavingCat(false);
    }
  };

  // Eliminar Categoría
  const handleDeleteCategoria = async (catId: string, nombre: string, itemCount: number) => {
    const warning = itemCount > 0 
      ? `La categoría "${nombre}" contiene ${itemCount} platillos que también serán eliminados. ¿Deseas continuar?`
      : `¿Eliminar la categoría "${nombre}"?`;
    if (!confirm(warning)) return;

    try {
      await deleteCategoria(catId);
      setCategorias((prev) => prev.filter((cat) => cat.id !== catId));
    } catch (err: any) {
      console.error('[MenuPage] Error eliminando categoría:', err);
      alert(err.message || 'Error eliminando categoría');
    }
  };

  const getDishCountByProtein = (pId: string) => {
    let count = 0;
    for (const cat of categorias) {
      for (const it of cat.items || []) {
        if (it.proteina === pId || (it.proteina === 'mixto' && (pId === 'pollo' || pId === 'cerdo'))) {
          count++;
        }
      }
    }
    return count;
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6">
      {/* Encabezado */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="brand-font font-bold text-2xl text-white flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-orange-400" />
            Gestión de Menú y Productos
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Agrega nuevos platillos, crea categorías, pausa productos o agota proteínas en tiempo real para WhatsApp y Cocina.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 sm:w-56 min-w-[180px]">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar platillo..."
              className="w-full pl-9 pr-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-orange-500"
            />
          </div>

          <button
            onClick={() => setShowModalCategoria(true)}
            className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-all border border-slate-700/60 shadow-sm"
            title="Crear nueva categoría"
          >
            <FolderPlus className="w-3.5 h-3.5 text-orange-400" />
            <span>+ Categoría</span>
          </button>

          <button
            onClick={() => handleOpenNuevoPlatillo()}
            className="px-3.5 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-md shadow-orange-500/20"
            title="Agregar nuevo platillo al menú"
          >
            <Plus className="w-4 h-4" />
            <span>+ Nuevo Platillo</span>
          </button>

          <button
            onClick={loadMenu}
            title="Recargar menú"
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="py-20 text-center text-slate-400 text-sm">
          Cargando menú del restaurante...
        </div>
      ) : error ? (
        <div className="glass-panel rounded-3xl p-8 text-center my-6 max-w-md mx-auto border border-rose-500/30 bg-rose-950/20 text-slate-300">
          <AlertCircle className="w-8 h-8 text-rose-400 mx-auto mb-3" />
          <h3 className="font-bold text-white text-base mb-1">No se pudo cargar el menú</h3>
          <p className="text-xs text-rose-300/80 mb-4">{error}</p>
          <button
            onClick={loadMenu}
            className="px-4 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold transition-all shadow-lg shadow-orange-500/20 inline-flex items-center gap-2"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Reintentar
          </button>
        </div>
      ) : (
        <>
          {/* Panel de Control de Proteínas */}
          <div className="glass-panel rounded-3xl p-5 mb-8 border border-slate-800 bg-slate-900/70">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-amber-500 to-orange-600 flex items-center justify-center text-lg shadow-md shadow-orange-500/20">
                  🥩
                </div>
                <div>
                  <h3 className="font-bold text-white text-sm sm:text-base flex items-center gap-2">
                    Control de Proteínas
                    {proteinasBloqueadas.length > 0 && (
                      <span className="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[11px] font-bold">
                        {proteinasBloqueadas.length} {proteinasBloqueadas.length === 1 ? 'agotada' : 'agotadas'}
                      </span>
                    )}
                  </h3>
                  <p className="text-xs text-slate-400">
                    Al deshabilitar una proteína se apagan todos los platos que la llevan tanto en la app como en el bot de WhatsApp.
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {LISTA_PROTEINAS.map((prot) => {
                const isBlocked = proteinasBloqueadas.includes(prot.id);
                const isBusy = updatingProteina === prot.id;
                const dishCount = getDishCountByProtein(prot.id);

                return (
                  <div
                    key={prot.id}
                    onClick={() => !isBusy && handleToggleProteina(prot.id)}
                    className={`relative p-3.5 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between gap-3 select-none ${
                      isBlocked
                        ? 'border-rose-500/60 bg-rose-950/40 hover:bg-rose-950/60 text-rose-200 shadow-lg shadow-rose-950/50'
                        : 'border-slate-800 bg-slate-950/70 hover:bg-slate-900/90 text-white'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2.5">
                        <span className="text-2xl">{prot.emoji}</span>
                        <div>
                          <h4 className="font-bold text-sm leading-tight text-white">{prot.label}</h4>
                          <span className="text-[11px] text-slate-400 font-medium">
                            {dishCount} platillos
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-800/80">
                      <span
                        className={`text-[11px] font-bold flex items-center gap-1.5 ${
                          isBlocked ? 'text-rose-400' : 'text-emerald-400'
                        }`}
                      >
                        <span
                          className={`w-2 h-2 rounded-full ${
                            isBlocked ? 'bg-rose-500 animate-pulse' : 'bg-emerald-400'
                          }`}
                        ></span>
                        {isBlocked ? 'Agotada' : 'Disponible'}
                      </span>

                      <button
                        type="button"
                        disabled={isBusy}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                          isBlocked
                            ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm shadow-emerald-600/30'
                            : 'bg-rose-950/80 hover:bg-rose-900 text-rose-300 border border-rose-500/50'
                        }`}
                      >
                        {isBlocked ? 'Activar' : 'Agotar'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Listado de Categorías y Platillos */}
          {categorias.length === 0 ? (
            <div className="glass-panel rounded-3xl p-10 text-center my-6 max-w-sm mx-auto text-slate-400 text-sm">
              <p className="mb-4">No hay categorías ni platillos en el menú.</p>
              <button
                onClick={() => setShowModalCategoria(true)}
                className="px-4 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold transition-all"
              >
                + Crear primera categoría
              </button>
            </div>
          ) : (
            <div className="space-y-8">
              {categorias.map((cat) => {
                const items = (cat.items || []).filter((it) => {
                  if (!search.trim()) return true;
                  const query = search.toLowerCase();
                  return (
                    it.nombre.toLowerCase().includes(query) ||
                    (it.proteina && it.proteina.toLowerCase().includes(query)) ||
                    (it.descripcion && it.descripcion.toLowerCase().includes(query))
                  );
                });

                return (
                  <div key={cat.id} className="space-y-3">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                      <div className="flex items-center gap-2">
                        <h3 className="brand-font font-bold text-lg text-white">
                          {cat.nombre}
                        </h3>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700/60 font-medium">
                          {items.length} productos
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => handleOpenNuevoPlatillo(cat.id)}
                          className="px-2.5 py-1 rounded-lg bg-orange-500/15 hover:bg-orange-500/25 text-orange-400 border border-orange-500/30 text-xs font-semibold flex items-center gap-1 transition-all"
                          title={`Agregar platillo a ${cat.nombre}`}
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Agregar</span>
                        </button>

                        <button
                          onClick={() => handleDeleteCategoria(cat.id, cat.nombre, cat.items?.length || 0)}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-950/40 transition-all"
                          title="Eliminar categoría"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {items.length === 0 ? (
                      <div className="p-6 rounded-2xl border border-dashed border-slate-800 text-center text-xs text-slate-500">
                        {search.trim() ? 'No hay platillos que coincidan con la búsqueda.' : 'Esta categoría no tiene platillos aún.'}
                        {!search.trim() && (
                          <button
                            onClick={() => handleOpenNuevoPlatillo(cat.id)}
                            className="block mx-auto mt-2 text-orange-400 hover:underline font-medium"
                          >
                            + Agregar primer platillo
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {items.map((it) => {
                          const isBlockedByProtein = !!it.bloqueadoPorProteina;
                          const isDirectlyAvailable = it.disponible !== false;
                          const isAvailable = isDirectlyAvailable && !isBlockedByProtein;
                          const isBusy = updating === it.id;
                          const protTag = it.proteina ? PROTEINA_TAGS[it.proteina] : null;

                          return (
                            <div
                              key={it.id}
                              className={`glass-panel rounded-2xl p-4 border transition-all flex flex-col justify-between ${
                                isBlockedByProtein
                                  ? 'border-amber-500/40 bg-amber-950/15 opacity-85'
                                  : isAvailable
                                  ? 'border-slate-800 bg-slate-900/60'
                                  : 'border-rose-900/40 bg-rose-950/20 opacity-70'
                              }`}
                            >
                              <div>
                                <div className="flex items-start justify-between gap-3">
                                  <div className="flex-1">
                                    <div className="flex items-baseline justify-between gap-2">
                                      <h4 className="font-bold text-sm text-white">{it.nombre}</h4>
                                      <span className="font-bold text-sm text-orange-400 shrink-0">
                                        C${it.precio}
                                      </span>
                                    </div>

                                    {/* Badge de proteína */}
                                    {protTag && (
                                      <div className="mt-1 flex items-center gap-1">
                                        <span className="px-2 py-0.5 rounded-md bg-slate-800 text-[11px] font-medium text-slate-300 border border-slate-700/60 flex items-center gap-1">
                                          <span>{protTag.emoji}</span>
                                          <span>{protTag.label}</span>
                                        </span>
                                      </div>
                                    )}

                                    {it.descripcion && (
                                      <p className="text-xs text-slate-400 mt-1.5 line-clamp-2 leading-relaxed">
                                        {it.descripcion}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              </div>

                              <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2">
                                {isBlockedByProtein ? (
                                  <span className="text-xs font-bold text-amber-400 flex items-center gap-1.5 truncate">
                                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                                    <span className="truncate">Agotado ({protTag?.label || it.proteina})</span>
                                  </span>
                                ) : (
                                  <span
                                    className={`text-xs font-bold flex items-center gap-1.5 shrink-0 ${
                                      isAvailable ? 'text-emerald-400' : 'text-rose-400'
                                    }`}
                                  >
                                    <span
                                      className={`w-2 h-2 rounded-full ${
                                        isAvailable ? 'bg-emerald-400' : 'bg-rose-400'
                                      }`}
                                    ></span>
                                    {isAvailable ? 'Disponible' : 'Agotado'}
                                  </span>
                                )}

                                <div className="flex items-center gap-1.5">
                                  <button
                                    onClick={() => handleOpenEditarPlatillo(cat.id, it)}
                                    className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-all"
                                    title="Editar platillo"
                                  >
                                    <Edit3 className="w-3.5 h-3.5" />
                                  </button>

                                  <button
                                    onClick={() => handleDeletePlatillo(cat.id, it.id, it.nombre)}
                                    className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-950/40 transition-all"
                                    title="Eliminar platillo"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>

                                  <button
                                    onClick={() => handleToggle(cat.id, it.id)}
                                    disabled={isBusy || isBlockedByProtein}
                                    title={
                                      isBlockedByProtein
                                        ? `Pausado por proteína ${protTag?.label || it.proteina}`
                                        : isAvailable
                                        ? 'Pausar platillo'
                                        : 'Activar platillo'
                                    }
                                    className={`px-2.5 py-1 rounded-xl text-xs font-bold transition-all flex items-center gap-1 ${
                                      isBlockedByProtein
                                        ? 'bg-slate-800/60 border border-slate-700/60 text-slate-500 cursor-not-allowed'
                                        : isAvailable
                                        ? 'bg-rose-950/60 hover:bg-rose-900/80 border border-rose-500/40 text-rose-300'
                                        : 'bg-emerald-950/60 hover:bg-emerald-900/80 border border-emerald-500/40 text-emerald-300'
                                    }`}
                                  >
                                    {isBlockedByProtein ? (
                                      <span>Bloqueado</span>
                                    ) : isAvailable ? (
                                      <>
                                        <X className="w-3 h-3" />
                                        <span>Pausar</span>
                                      </>
                                    ) : (
                                      <>
                                        <Check className="w-3 h-3" />
                                        <span>Activar</span>
                                      </>
                                    )}
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Modal: Crear / Editar Platillo */}
      {showModalPlatillo && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-panel rounded-3xl max-w-md w-full p-6 border border-slate-800 bg-slate-950 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
              <h3 className="brand-font font-bold text-lg text-white flex items-center gap-2">
                <Plus className="w-5 h-5 text-orange-400" />
                {editandoItem ? 'Editar Platillo' : 'Nuevo Platillo'}
              </h3>
              <button
                onClick={() => setShowModalPlatillo(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSavePlatillo} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Categoría *
                </label>
                <select
                  value={formPlatillo.categoriaId}
                  onChange={(e) => setFormPlatillo({ ...formPlatillo, categoriaId: e.target.value })}
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs focus:outline-none focus:border-orange-500"
                >
                  <option value="" disabled>Selecciona una categoría</option>
                  {categorias.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Nombre del Platillo *
                </label>
                <input
                  type="text"
                  value={formPlatillo.nombre}
                  onChange={(e) => setFormPlatillo({ ...formPlatillo, nombre: e.target.value })}
                  placeholder="Ej: Tacos de Res, Hamburguesa Doble"
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white placeholder-slate-500 text-xs focus:outline-none focus:border-orange-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Precio (C$) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formPlatillo.precio}
                    onChange={(e) => setFormPlatillo({ ...formPlatillo, precio: e.target.value })}
                    placeholder="Ej: 190"
                    required
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white placeholder-slate-500 text-xs focus:outline-none focus:border-orange-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Proteína (Opcional)
                  </label>
                  <select
                    value={formPlatillo.proteina}
                    onChange={(e) => setFormPlatillo({ ...formPlatillo, proteina: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs focus:outline-none focus:border-orange-500"
                  >
                    <option value="">Ninguna</option>
                    <option value="res">🥩 Res</option>
                    <option value="pollo">🍗 Pollo</option>
                    <option value="cerdo">🐷 Cerdo / Pastor</option>
                    <option value="birria">🌮 Birria</option>
                    <option value="mixto">🍲 Mixto</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Descripción / Ingredientes (Opcional)
                </label>
                <textarea
                  rows={2}
                  value={formPlatillo.descripcion}
                  onChange={(e) => setFormPlatillo({ ...formPlatillo, descripcion: e.target.value })}
                  placeholder="Detalles de ingredientes o porción..."
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white placeholder-slate-500 text-xs focus:outline-none focus:border-orange-500 resize-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Opciones / Variantes (Opcional, separadas por coma)
                </label>
                <input
                  type="text"
                  value={formPlatillo.opciones}
                  onChange={(e) => setFormPlatillo({ ...formPlatillo, opciones: e.target.value })}
                  placeholder="Ej: Con queso, Sin picante, Salsa extra"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white placeholder-slate-500 text-xs focus:outline-none focus:border-orange-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowModalPlatillo(false)}
                  disabled={savingItem}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingItem}
                  className="px-4 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold shadow-lg shadow-orange-500/20 disabled:opacity-50"
                >
                  {savingItem ? 'Guardando...' : editandoItem ? 'Guardar Cambios' : 'Crear Platillo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Crear Nueva Categoría */}
      {showModalCategoria && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-panel rounded-3xl max-w-sm w-full p-6 border border-slate-800 bg-slate-950 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
              <h3 className="brand-font font-bold text-lg text-white flex items-center gap-2">
                <FolderPlus className="w-5 h-5 text-orange-400" />
                Nueva Categoría
              </h3>
              <button
                onClick={() => setShowModalCategoria(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveCategoria} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Nombre de la Categoría *
                </label>
                <input
                  type="text"
                  value={formCategoria.nombre}
                  onChange={(e) => setFormCategoria({ ...formCategoria, nombre: e.target.value })}
                  placeholder="Ej: Bebidas, Postres, Especiales"
                  required
                  autoFocus
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white placeholder-slate-500 text-xs focus:outline-none focus:border-orange-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowModalCategoria(false)}
                  disabled={savingCat}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingCat}
                  className="px-4 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold shadow-lg shadow-orange-500/20 disabled:opacity-50"
                >
                  {savingCat ? 'Creando...' : 'Crear Categoría'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
