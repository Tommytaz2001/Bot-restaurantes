import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Modal, TextInput, Alert, ActivityIndicator, Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import {
  getCategorias, addCategoria, updateCategoriaNombre, updateCategoriaOrden,
  deleteCategoria, addItem, updateItem, deleteItem, toggleDisponible,
  type MenuCategoria, type MenuItem, type Proteina,
} from '../../src/services/menuAdminService';
import { getProteinasBloqueadas, setProteinasBloqueadas as saveProteinasBloqueadas, estaItemBloqueadoPorProteina, type Proteina as ProteinaType } from '../../src/services/proteinasService';

// ─── Modals ──────────────────────────────────────────────────────────────────

function CategoriaModal({
  visible, inicial, onClose, onSave,
}: {
  visible: boolean;
  inicial: string;
  onClose: () => void;
  onSave: (nombre: string) => void;
}) {
  const [nombre, setNombre] = useState(inicial);
  useEffect(() => { if (visible) setNombre(inicial); }, [visible, inicial]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modalBox}>
          <Text style={styles.modalTitle}>{inicial ? 'Editar categoría' : 'Nueva categoría'}</Text>
          <TextInput
            style={styles.input}
            placeholder="Nombre de la categoría"
            placeholderTextColor="#555"
            value={nombre}
            onChangeText={setNombre}
            autoFocus
          />
          <View style={styles.modalBtns}>
            <TouchableOpacity style={styles.btnCancel} onPress={onClose}>
              <Text style={styles.btnCancelText}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btnPrimary, !nombre.trim() && styles.btnDisabled]}
              onPress={() => nombre.trim() && onSave(nombre.trim())}
            >
              <Text style={styles.btnPrimaryText}>Guardar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const EMPTY_ITEM: Omit<MenuItem, 'disponible'> = {
  nombre: '', precio: 0, descripcion: '', opciones: [], proteina: undefined,
};

const PROTEINAS: Proteina[] = ['pollo', 'cerdo', 'birria', 'mixto'];
const PROTEINA_LABELS: Record<Proteina, string> = {
  pollo: 'Pollo',
  cerdo: 'Cerdo',
  birria: 'Birria',
  mixto: 'Mixto',
};

function ProductoModal({
  visible, inicial, onClose, onSave,
}: {
  visible: boolean;
  inicial: Omit<MenuItem, 'disponible'> | null;
  onClose: () => void;
  onSave: (item: Omit<MenuItem, 'disponible'>) => void;
}) {
  const [form, setForm] = useState<Omit<MenuItem, 'disponible'>>(EMPTY_ITEM);
  const [opcionesRaw, setOpcionesRaw] = useState('');

  useEffect(() => {
    if (visible) {
      const base = inicial ?? EMPTY_ITEM;
      setForm(base);
      setOpcionesRaw((base.opciones ?? []).join(', '));
    }
  }, [visible, inicial]);

  const precioNum = Number(form.precio);
  const valid = form.nombre.trim().length > 0 && !isNaN(precioNum) && precioNum >= 0;

  function handleSave() {
    if (!valid) return;
    const opciones = opcionesRaw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    onSave({ ...form, precio: precioNum, opciones });
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <ScrollView contentContainerStyle={styles.modalScroll}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>{inicial ? 'Editar producto' : 'Nuevo producto'}</Text>

            <Text style={styles.label}>Nombre *</Text>
            <TextInput
              style={styles.input}
              placeholder="Ej: Hamburguesa Clásica"
              placeholderTextColor="#555"
              value={form.nombre}
              onChangeText={(v) => setForm((f) => ({ ...f, nombre: v }))}
              autoFocus
            />

            <Text style={styles.label}>Precio (C$) *</Text>
            <TextInput
              style={styles.input}
              placeholder="Ej: 160"
              placeholderTextColor="#555"
              value={form.precio === 0 && !inicial ? '' : String(form.precio)}
              onChangeText={(v) => setForm((f) => ({ ...f, precio: v as any }))}
              keyboardType="numeric"
            />

            <Text style={styles.label}>Descripción</Text>
            <TextInput
              style={[styles.input, styles.inputMulti]}
              placeholder="Ej: Carne de res, lechuga, tomate..."
              placeholderTextColor="#555"
              value={form.descripcion}
              onChangeText={(v) => setForm((f) => ({ ...f, descripcion: v }))}
              multiline
              numberOfLines={2}
            />

            <Text style={styles.label}>Opciones (separadas por coma)</Text>
            <TextInput
              style={styles.input}
              placeholder="Ej: sin cebolla, extra queso"
              placeholderTextColor="#555"
              value={opcionesRaw}
              onChangeText={setOpcionesRaw}
            />

            <Text style={styles.label}>Proteína asociada</Text>
            <View style={styles.proteinChips}>
              {[undefined, ...PROTEINAS].map((p) => (
                <TouchableOpacity
                  key={p ?? 'ninguna'}
                  style={[styles.chip, form.proteina === p && styles.chipActive]}
                  onPress={() => setForm((f) => ({ ...f, proteina: p }))}
                >
                  <Text style={[styles.chipText, form.proteina === p && styles.chipTextActive]}>
                    {p ? PROTEINA_LABELS[p] : 'Ninguna'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.btnCancel} onPress={onClose}>
                <Text style={styles.btnCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btnPrimary, !valid && styles.btnDisabled]}
                onPress={handleSave}
              >
                <Text style={styles.btnPrimaryText}>Guardar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

// ─── Proteínas Modal ─────────────────────────────────────────────────────────

function ProteinasModal({
  visible, onClose, onSave, bloqueadas, saving,
}: {
  visible: boolean;
  bloqueadas: ProteinaType[];
  onClose: () => void;
  onSave: (bloqueadas: ProteinaType[]) => void;
  saving: boolean;
}) {
  const [tempBloqueadas, setTempBloqueadas] = useState<ProteinaType[]>(bloqueadas);

  useEffect(() => {
    if (visible) setTempBloqueadas(bloqueadas);
  }, [visible, bloqueadas]);

  function toggleProteina(p: ProteinaType) {
    setTempBloqueadas((b) =>
      b.includes(p) ? b.filter((x) => x !== p) : [...b, p],
    );
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modalBox}>
          <Text style={styles.modalTitle}>Gestionar Proteínas</Text>
          <Text style={styles.hintText}>Deshabilitá proteínas agotadas. Los platillos se ocultarán automáticamente.</Text>

          <View style={styles.proteinGroup}>
            {(['pollo', 'cerdo', 'birria'] as ProteinaType[]).map((p) => (
              <View key={p} style={styles.proteinRow}>
                <Text style={styles.proteinLabel}>{PROTEINA_LABELS[p]}</Text>
                <Switch
                  value={tempBloqueadas.includes(p)}
                  onValueChange={() => toggleProteina(p)}
                  trackColor={{ false: '#2a2a2a', true: '#EF4444' }}
                  thumbColor={tempBloqueadas.includes(p) ? '#8B0000' : '#555'}
                />
              </View>
            ))}
          </View>

          <View style={styles.modalBtns}>
            <TouchableOpacity style={styles.btnCancel} onPress={onClose}>
              <Text style={styles.btnCancelText}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btnPrimary, saving && styles.btnDisabled]}
              disabled={saving}
              onPress={() => {
                onSave(tempBloqueadas);
                onClose();
              }}
            >
              <Text style={styles.btnPrimaryText}>Guardar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function MenuScreen() {
  const [categorias, setCategorias] = useState<MenuCategoria[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [proteinasBloqueadas, setProteinasBloqueadas] = useState<ProteinaType[]>([]);

  // Categoria modal state
  const [catModal, setCatModal] = useState(false);
  const [editingCat, setEditingCat] = useState<MenuCategoria | null>(null);

  // Producto modal state
  const [prodModal, setProdModal] = useState(false);
  const [editingProd, setEditingProd] = useState<{ cat: MenuCategoria; idx: number | null } | null>(null);

  // Proteínas modal state
  const [proteinModal, setProteinModal] = useState(false);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getCategorias();
      setCategorias(data);
    } catch (err: any) {
      console.error('[MenuScreen] cargar falló:', err?.message ?? err);
      Alert.alert('Error', 'No se pudo cargar el menú.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    cargar();
    getProteinasBloqueadas()
      .then(setProteinasBloqueadas)
      .catch((err) => console.error('[MenuScreen] proteinas falló:', err?.message));
  }, [cargar]);

  function toggleExpand(id: string) {
    setExpanded((e) => ({ ...e, [id]: !e[id] }));
  }

  // ── Proteínas actions ────────────────────────────────────────────────────────

  async function handleSaveProteinas(bloqueadas: ProteinaType[]) {
    setSaving(true);
    try {
      await saveProteinasBloqueadas(bloqueadas);
      setProteinasBloqueadas(bloqueadas); // UI recalcula estaItemBloqueadoPorProteina automáticamente
    } catch {
      Alert.alert('Error', 'No se pudo guardar las proteínas.');
    } finally {
      setSaving(false);
    }
  }

  // ── Category actions ──────────────────────────────────────────────────────

  function openNewCat() {
    setEditingCat(null);
    setCatModal(true);
  }

  function openEditCat(cat: MenuCategoria) {
    setEditingCat(cat);
    setCatModal(true);
  }

  async function handleSaveCat(nombre: string) {
    setSaving(true);
    try {
      if (editingCat) {
        await updateCategoriaNombre(editingCat.id, nombre);
      } else {
        const maxOrden = categorias.reduce((m, c) => Math.max(m, c.orden ?? 0), 0);
        await addCategoria(nombre, maxOrden + 1);
      }
      setCatModal(false);
      await cargar();
    } catch {
      Alert.alert('Error', 'No se pudo guardar la categoría.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteCat(cat: MenuCategoria) {
    Alert.alert(
      'Eliminar categoría',
      `¿Eliminar "${cat.nombre}" y todos sus productos?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar', style: 'destructive',
          onPress: async () => {
            setSaving(true);
            try {
              await deleteCategoria(cat.id);
              await cargar();
            } catch {
              Alert.alert('Error', 'No se pudo eliminar la categoría.');
            } finally {
              setSaving(false);
            }
          },
        },
      ],
    );
  }

  async function handleMoverCategoria(cat: MenuCategoria, direction: 'up' | 'down') {
    const idx = categorias.findIndex((c) => c.id === cat.id);
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= categorias.length) return;

    const other = categorias[swapIdx];
    setSaving(true);
    try {
      await updateCategoriaOrden(cat.id, other.orden);
      await updateCategoriaOrden(other.id, cat.orden);
      await cargar();
    } catch {
      Alert.alert('Error', 'No se pudo reordenar.');
    } finally {
      setSaving(false);
    }
  }

  // ── Product actions ───────────────────────────────────────────────────────

  function openNewProd(cat: MenuCategoria) {
    setEditingProd({ cat, idx: null });
    setProdModal(true);
  }

  function openEditProd(cat: MenuCategoria, idx: number) {
    setEditingProd({ cat, idx });
    setProdModal(true);
  }

  async function handleSaveProd(item: Omit<MenuItem, 'disponible'>) {
    if (!editingProd) return;
    const { cat, idx } = editingProd;
    setSaving(true);
    try {
      if (idx === null) {
        await addItem(cat.id, item);
      } else {
        await updateItem(cat.id, idx, { ...item, disponible: cat.items[idx].disponible ?? true });
      }
      setProdModal(false);
      await cargar();
    } catch {
      Alert.alert('Error', 'No se pudo guardar el producto.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteProd(cat: MenuCategoria, idx: number) {
    Alert.alert(
      'Eliminar producto',
      `¿Eliminar "${cat.items[idx].nombre}"?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar', style: 'destructive',
          onPress: async () => {
            setSaving(true);
            try {
              await deleteItem(cat.id, idx);
              await cargar();
            } catch {
              Alert.alert('Error', 'No se pudo eliminar el producto.');
            } finally {
              setSaving(false);
            }
          },
        },
      ],
    );
  }

  async function handleToggleDisponible(cat: MenuCategoria, idx: number) {
    const oldDisponible = cat.items[idx].disponible ?? true;
    const newDisponible = !oldDisponible;

    // Optimistic update — UI flips instantly
    setCategorias(prev => prev.map(c =>
      c.id !== cat.id ? c : {
        ...c,
        items: c.items.map((item, i) =>
          i !== idx ? item : { ...item, disponible: newDisponible }
        ),
      }
    ));

    try {
      await toggleDisponible(cat.id, idx);
    } catch (error: any) {
      // Revert on failure
      setCategorias(prev => prev.map(c =>
        c.id !== cat.id ? c : {
          ...c,
          items: c.items.map((item, i) =>
            i !== idx ? item : { ...item, disponible: oldDisponible }
          ),
        }
      ));
      Alert.alert('Error', `No se pudo actualizar: ${error?.message || 'Error desconocido'}`);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const prodInicial = editingProd?.idx !== null && editingProd?.idx !== undefined
    ? editingProd.cat.items[editingProd.idx]
    : null;

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Menú</Text>
        <View style={styles.headerBtns}>
          <TouchableOpacity style={styles.proteinBtn} onPress={() => setProteinModal(true)} disabled={saving}>
            <Text style={styles.proteinBtnText}>🥩 Proteínas</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.addCatBtn} onPress={openNewCat} disabled={saving}>
            <Text style={styles.addCatBtnText}>+ Categoría</Text>
          </TouchableOpacity>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator color="#F59E0B" style={{ marginTop: 48 }} />
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {categorias.length === 0 && (
            <Text style={styles.empty}>No hay categorías todavía.{'\n'}Toca "+ Categoría" para empezar.</Text>
          )}

          {categorias.map((cat, catIdx) => {
            const isOpen = !!expanded[cat.id];
            return (
              <View key={cat.id} style={styles.catCard}>
                {/* Category header row */}
                <View style={styles.catHeader}>
                  <View style={styles.catOrderBtns}>
                    <TouchableOpacity
                      onPress={() => handleMoverCategoria(cat, 'up')}
                      disabled={catIdx === 0 || saving}
                      style={[styles.orderBtn, catIdx === 0 && styles.orderBtnDisabled]}
                    >
                      <Text style={styles.orderBtnText}>▲</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleMoverCategoria(cat, 'down')}
                      disabled={catIdx === categorias.length - 1 || saving}
                      style={[styles.orderBtn, catIdx === categorias.length - 1 && styles.orderBtnDisabled]}
                    >
                      <Text style={styles.orderBtnText}>▼</Text>
                    </TouchableOpacity>
                  </View>

                  <TouchableOpacity style={styles.catNameWrap} onPress={() => toggleExpand(cat.id)}>
                    <Text style={styles.catName}>{cat.nombre}</Text>
                    <Text style={styles.catCount}>
                      {cat.items.length} {cat.items.length === 1 ? 'producto' : 'productos'}
                    </Text>
                  </TouchableOpacity>

                  <View style={styles.catActions}>
                    <TouchableOpacity onPress={() => openEditCat(cat)} style={styles.iconBtn}>
                      <Text style={styles.iconBtnText}>✏️</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => handleDeleteCat(cat)} style={styles.iconBtn}>
                      <Text style={styles.iconBtnText}>🗑️</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => toggleExpand(cat.id)} style={styles.iconBtn}>
                      <Text style={styles.iconBtnText}>{isOpen ? '▲' : '▼'}</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Product list */}
                {isOpen && (
                  <View style={styles.itemsWrap}>
                    {cat.items.map((item, itemIdx) => {
                      const disponible = item.disponible ?? true;
                      const bloqueadoPorProteina = estaItemBloqueadoPorProteina(item.proteina, proteinasBloqueadas);
                      const deshabilitado = !disponible || bloqueadoPorProteina;
                      return (
                        <View key={itemIdx} style={styles.itemRow}>
                          <View style={styles.itemInfo}>
                            <Text style={[styles.itemNombre, deshabilitado && styles.itemAgotado]}>
                              {item.nombre}
                            </Text>
                            <Text style={styles.itemPrecio}>C${item.precio}</Text>
                            {deshabilitado && (
                              <Text style={styles.agotadoBadge}>AGOTADO</Text>
                            )}
                          </View>
                          <View style={styles.itemActions}>
                            <Switch
                              value={disponible && !bloqueadoPorProteina}
                              onValueChange={() => handleToggleDisponible(cat, itemIdx)}
                              trackColor={{ false: '#3A1A1A', true: '#14532D' }}
                              thumbColor={deshabilitado ? '#EF4444' : '#22C55E'}
                              disabled={saving || bloqueadoPorProteina}
                            />
                            <TouchableOpacity onPress={() => openEditProd(cat, itemIdx)} style={styles.iconBtn}>
                              <Text style={styles.iconBtnText}>✏️</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => handleDeleteProd(cat, itemIdx)} style={styles.iconBtn}>
                              <Text style={styles.iconBtnText}>🗑️</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      );
                    })}

                    <TouchableOpacity style={styles.addItemBtn} onPress={() => openNewProd(cat)}>
                      <Text style={styles.addItemBtnText}>+ Agregar producto</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          })}
        </ScrollView>
      )}

      {saving && (
        <View style={styles.savingOverlay}>
          <ActivityIndicator color="#F59E0B" />
        </View>
      )}

      {/* Modals */}
      <CategoriaModal
        visible={catModal}
        inicial={editingCat?.nombre ?? ''}
        onClose={() => setCatModal(false)}
        onSave={handleSaveCat}
      />
      <ProductoModal
        visible={prodModal}
        inicial={prodInicial ? { nombre: prodInicial.nombre, precio: prodInicial.precio, descripcion: prodInicial.descripcion, opciones: prodInicial.opciones ?? [], proteina: prodInicial.proteina } : null}
        onClose={() => setProdModal(false)}
        onSave={handleSaveProd}
      />
      <ProteinasModal
        visible={proteinModal}
        bloqueadas={proteinasBloqueadas}
        onClose={() => setProteinModal(false)}
        onSave={handleSaveProteinas}
        saving={saving}
      />
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#111111',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1E1E1E',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  headerBtns: {
    flexDirection: 'row',
    gap: 8,
  },
  proteinBtn: {
    backgroundColor: '#8B4513',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  proteinBtnText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 13,
  },
  addCatBtn: {
    backgroundColor: '#F59E0B',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  addCatBtnText: {
    color: '#111111',
    fontWeight: '700',
    fontSize: 13,
  },
  list: {
    padding: 12,
    gap: 10,
  },
  empty: {
    color: '#555',
    textAlign: 'center',
    marginTop: 48,
    lineHeight: 24,
    fontSize: 15,
  },
  // Category card
  catCard: {
    backgroundColor: '#181818',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#252525',
    overflow: 'hidden',
  },
  catHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 12,
    gap: 8,
  },
  catOrderBtns: {
    gap: 2,
  },
  orderBtn: {
    padding: 3,
  },
  orderBtnDisabled: {
    opacity: 0.2,
  },
  orderBtnText: {
    color: '#888',
    fontSize: 10,
  },
  catNameWrap: {
    flex: 1,
  },
  catName: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  catCount: {
    color: '#666',
    fontSize: 12,
    marginTop: 1,
  },
  catActions: {
    flexDirection: 'row',
    gap: 4,
  },
  iconBtn: {
    padding: 6,
  },
  iconBtnText: {
    fontSize: 16,
  },
  // Items
  itemsWrap: {
    borderTopWidth: 1,
    borderTopColor: '#252525',
    paddingBottom: 4,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#1E1E1E',
    gap: 8,
  },
  itemInfo: {
    flex: 1,
  },
  itemNombre: {
    color: '#E5E5E5',
    fontSize: 14,
    fontWeight: '600',
  },
  itemAgotado: {
    color: '#666',
    textDecorationLine: 'line-through',
  },
  itemPrecio: {
    color: '#F59E0B',
    fontSize: 13,
    marginTop: 1,
  },
  agotadoBadge: {
    color: '#EF4444',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginTop: 2,
  },
  itemActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  addItemBtn: {
    marginHorizontal: 12,
    marginTop: 8,
    marginBottom: 4,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderStyle: 'dashed',
    alignItems: 'center',
  },
  addItemBtnText: {
    color: '#F59E0B',
    fontSize: 13,
    fontWeight: '600',
  },
  // Saving overlay
  savingOverlay: {
    position: 'absolute',
    bottom: 80,
    alignSelf: 'center',
    backgroundColor: '#1E1E1E',
    borderRadius: 20,
    padding: 10,
    paddingHorizontal: 18,
  },
  // Modal
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    padding: 20,
  },
  modalScroll: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  modalBox: {
    backgroundColor: '#1A1A1A',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  modalTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 16,
  },
  label: {
    color: '#888',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.5,
    marginBottom: 4,
    marginTop: 10,
  },
  input: {
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#FFFFFF',
    fontSize: 15,
  },
  inputMulti: {
    minHeight: 60,
    textAlignVertical: 'top',
  },
  modalBtns: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 20,
  },
  btnCancel: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#333',
  },
  btnCancelText: {
    color: '#888',
    fontWeight: '600',
  },
  btnPrimary: {
    backgroundColor: '#F59E0B',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  btnDisabled: {
    opacity: 0.4,
  },
  btnPrimaryText: {
    color: '#111',
    fontWeight: '700',
  },
  // Proteínas modal styles
  hintText: {
    color: '#666',
    fontSize: 13,
    marginBottom: 16,
    lineHeight: 18,
  },
  proteinGroup: {
    gap: 12,
    marginBottom: 20,
  },
  proteinRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#111',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  proteinLabel: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  // Proteína chips
  proteinChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    backgroundColor: '#111',
  },
  chipActive: {
    backgroundColor: '#F59E0B',
    borderColor: '#F59E0B',
  },
  chipText: {
    color: '#888',
    fontSize: 13,
    fontWeight: '600',
  },
  chipTextActive: {
    color: '#111',
  },
});
