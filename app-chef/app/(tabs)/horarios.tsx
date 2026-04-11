import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Switch, Alert, ActivityIndicator, Modal,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import {
  getHorario, saveHorario,
  type Horario, type DiaSemana,
  DIAS, DIAS_LABELS,
} from '../../src/services/horarioService';

const HORAS = Array.from({ length: 18 }, (_, i) => i + 6); // 6..23
const MINUTOS = [0, 15, 30, 45];

type TimePicker = {
  dia: DiaSemana;
  campo: 'apertura' | 'cierre';
  hora: number;
  minuto: number;
};

function pad(n: number) { return String(n).padStart(2, '0'); }

function parseHora(s: string): { hora: number; minuto: number } {
  const [h, m] = s.split(':').map(Number);
  return { hora: isNaN(h) ? 10 : h, minuto: isNaN(m) ? 0 : m };
}

export default function HorariosScreen() {
  const [horario, setHorario] = useState<Horario | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [timePicker, setTimePicker] = useState<TimePicker | null>(null);
  const insets = useSafeAreaInsets();

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getHorario();
      setHorario(data);
    } catch {
      Alert.alert('Error', 'No se pudo cargar el horario.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  function toggleAbre(dia: DiaSemana) {
    if (!horario) return;
    setHorario({ ...horario, [dia]: { ...horario[dia], abre: !horario[dia].abre } });
  }

  function openTimePicker(dia: DiaSemana, campo: 'apertura' | 'cierre') {
    if (!horario) return;
    const { hora, minuto } = parseHora(horario[dia][campo]);
    // Snap minuto al más cercano de los 4 opciones
    const minutoCercano = MINUTOS.reduce((prev, curr) =>
      Math.abs(curr - minuto) < Math.abs(prev - minuto) ? curr : prev, 0);
    setTimePicker({ dia, campo, hora, minuto: minutoCercano });
  }

  function applyTime() {
    if (!timePicker || !horario) return;
    const { dia, campo, hora, minuto } = timePicker;
    setHorario({ ...horario, [dia]: { ...horario[dia], [campo]: `${pad(hora)}:${pad(minuto)}` } });
    setTimePicker(null);
  }

  async function handleGuardar() {
    if (!horario) return;
    setSaving(true);
    try {
      await saveHorario(horario);
      Alert.alert('Guardado', 'Horarios actualizados correctamente.');
    } catch {
      Alert.alert('Error', 'No se pudo guardar el horario.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" />

      <View style={styles.header}>
        <Text style={styles.headerTitle}>Horarios</Text>
      </View>

      {loading ? (
        <ActivityIndicator color="#F59E0B" style={{ marginTop: 48 }} />
      ) : (
        <ScrollView contentContainerStyle={[styles.list, { paddingBottom: Math.max(32, insets.bottom + 24) }]}>
          <Text style={styles.hint}>
            Tocá las horas para cambiarlas. El bot responde automáticamente fuera del horario.
          </Text>

          {horario && DIAS.map((dia) => {
            const d = horario[dia];
            return (
              <View key={dia} style={[styles.card, !d.abre && styles.cardCerrado]}>
                <View style={styles.cardHeader}>
                  <Text style={[styles.diaNombre, !d.abre && styles.diaCerrado]}>
                    {DIAS_LABELS[dia]}
                  </Text>
                  <View style={styles.toggleWrap}>
                    <Text style={[styles.toggleLabel, d.abre ? styles.abierto : styles.cerrado]}>
                      {d.abre ? 'Abierto' : 'Cerrado'}
                    </Text>
                    <Switch
                      value={d.abre}
                      onValueChange={() => toggleAbre(dia)}
                      trackColor={{ false: '#3A1A1A', true: '#14532D' }}
                      thumbColor={d.abre ? '#22C55E' : '#EF4444'}
                      disabled={saving}
                    />
                  </View>
                </View>

                {d.abre && (
                  <View style={styles.horasRow}>
                    <View style={styles.horaItem}>
                      <Text style={styles.horaLabel}>APERTURA</Text>
                      <TouchableOpacity
                        style={styles.horaBtn}
                        onPress={() => openTimePicker(dia, 'apertura')}
                        disabled={saving}
                      >
                        <Text style={styles.horaBtnText}>{d.apertura}</Text>
                      </TouchableOpacity>
                    </View>

                    <Text style={styles.horaSep}>→</Text>

                    <View style={styles.horaItem}>
                      <Text style={styles.horaLabel}>CIERRE</Text>
                      <TouchableOpacity
                        style={styles.horaBtn}
                        onPress={() => openTimePicker(dia, 'cierre')}
                        disabled={saving}
                      >
                        <Text style={styles.horaBtnText}>{d.cierre}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </View>
            );
          })}

          <TouchableOpacity
            style={[styles.saveBtn, saving && styles.btnDisabled]}
            onPress={handleGuardar}
            disabled={saving}
          >
            {saving
              ? <ActivityIndicator color="#111" />
              : <Text style={styles.saveBtnText}>Guardar horarios</Text>
            }
          </TouchableOpacity>
        </ScrollView>
      )}

      {/* Time Picker Modal */}
      <Modal visible={timePicker !== null} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { paddingBottom: Math.max(20, insets.bottom + 16) }]}>
            <Text style={styles.modalTitle}>
              {timePicker?.campo === 'apertura' ? 'Hora de apertura' : 'Hora de cierre'}
            </Text>

            <Text style={styles.timeDisplay}>
              {timePicker ? `${pad(timePicker.hora)}:${pad(timePicker.minuto)}` : '--:--'}
            </Text>

            <Text style={styles.pickerLabel}>HORA</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pickerScroll}>
              <View style={styles.pickerRowInner}>
                {HORAS.map(h => (
                  <TouchableOpacity
                    key={h}
                    style={[styles.pickerCell, timePicker?.hora === h && styles.pickerCellActive]}
                    onPress={() => timePicker && setTimePicker({ ...timePicker, hora: h })}
                  >
                    <Text style={[styles.pickerCellText, timePicker?.hora === h && styles.pickerCellTextActive]}>
                      {pad(h)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            <Text style={[styles.pickerLabel, { marginTop: 12 }]}>MINUTOS</Text>
            <View style={styles.minutosRow}>
              {MINUTOS.map(m => (
                <TouchableOpacity
                  key={m}
                  style={[styles.pickerCell, styles.pickerCellWide, timePicker?.minuto === m && styles.pickerCellActive]}
                  onPress={() => timePicker && setTimePicker({ ...timePicker, minuto: m })}
                >
                  <Text style={[styles.pickerCellText, timePicker?.minuto === m && styles.pickerCellTextActive]}>
                    {pad(m)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setTimePicker(null)}>
                <Text style={styles.cancelBtnText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmBtn} onPress={applyTime}>
                <Text style={styles.confirmBtnText}>Confirmar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#111111',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
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
  list: {
    padding: 12,
    gap: 10,
  },
  hint: {
    color: '#555',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 4,
  },
  card: {
    backgroundColor: '#181818',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#252525',
    padding: 14,
    gap: 12,
  },
  cardCerrado: {
    borderColor: '#1E1E1E',
    opacity: 0.65,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  diaNombre: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  diaCerrado: {
    color: '#555',
  },
  toggleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  toggleLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  abierto: {
    color: '#22C55E',
  },
  cerrado: {
    color: '#EF4444',
  },
  horasRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  horaItem: {
    flex: 1,
  },
  horaLabel: {
    fontSize: 10,
    color: '#555',
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: 5,
  },
  horaBtn: {
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  horaBtnText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
  },
  horaSep: {
    color: '#444',
    fontSize: 20,
    marginTop: 16,
  },
  saveBtn: {
    backgroundColor: '#F59E0B',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  btnDisabled: {
    opacity: 0.5,
  },
  saveBtnText: {
    color: '#111',
    fontWeight: '700',
    fontSize: 16,
  },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'flex-end',
  },
  modalBox: {
    backgroundColor: '#181818',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    gap: 8,
  },
  modalTitle: {
    color: '#888',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  timeDisplay: {
    color: '#FFFFFF',
    fontSize: 52,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 4,
    marginBottom: 8,
  },
  pickerLabel: {
    color: '#555',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  pickerScroll: {
    flexGrow: 0,
  },
  pickerRowInner: {
    flexDirection: 'row',
    gap: 6,
    paddingVertical: 2,
  },
  minutosRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 4,
  },
  pickerCell: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#252525',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerCellWide: {
    flex: 1,
    width: undefined,
  },
  pickerCellActive: {
    backgroundColor: '#F59E0B',
  },
  pickerCellText: {
    color: '#777',
    fontSize: 15,
    fontWeight: '600',
  },
  pickerCellTextActive: {
    color: '#111',
    fontWeight: '800',
  },
  modalBtns: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  cancelBtn: {
    flex: 1,
    backgroundColor: '#252525',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  cancelBtnText: {
    color: '#888',
    fontWeight: '700',
    fontSize: 15,
  },
  confirmBtn: {
    flex: 1,
    backgroundColor: '#F59E0B',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  confirmBtnText: {
    color: '#111',
    fontWeight: '700',
    fontSize: 15,
  },
});
