import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Switch, TextInput, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import {
  getHorario, saveHorario,
  type Horario, type DiaSemana,
  DIAS, DIAS_LABELS,
} from '../../src/services/horarioService';

function validarHora(v: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
}

export default function HorariosScreen() {
  const [horario, setHorario] = useState<Horario | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
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

  function setHora(dia: DiaSemana, campo: 'apertura' | 'cierre', valor: string) {
    if (!horario) return;
    setHorario({ ...horario, [dia]: { ...horario[dia], [campo]: valor } });
  }

  async function handleGuardar() {
    if (!horario) return;
    for (const dia of DIAS) {
      const d = horario[dia];
      if (d.abre && (!validarHora(d.apertura) || !validarHora(d.cierre))) {
        Alert.alert('Horario inválido', `Revisá el horario de ${DIAS_LABELS[dia]}.\nUsá formato HH:MM (ej: 10:00)`);
        return;
      }
    }
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
        <ScrollView contentContainerStyle={[styles.list, { paddingBottom: Math.max(32, insets.bottom + 16) }]}>
          <Text style={styles.hint}>
            Configurá los días y horarios de atención. El bot responderá automáticamente fuera del horario.
          </Text>

          {horario && DIAS.map((dia) => {
            const d = horario[dia];
            const aperturaValida = d.apertura.length === 0 || validarHora(d.apertura);
            const cierreValido   = d.cierre.length === 0   || validarHora(d.cierre);

            return (
              <View key={dia} style={[styles.card, !d.abre && styles.cardCerrado]}>
                {/* Header row: día + toggle */}
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

                {/* Time inputs (only when open) */}
                {d.abre && (
                  <View style={styles.horasRow}>
                    <View style={styles.horaItem}>
                      <Text style={styles.horaLabel}>APERTURA</Text>
                      <TextInput
                        style={[styles.horaInput, !aperturaValida && styles.inputError]}
                        value={d.apertura}
                        onChangeText={(v) => setHora(dia, 'apertura', v)}
                        placeholder="10:00"
                        placeholderTextColor="#444"
                        keyboardType="numbers-and-punctuation"
                        maxLength={5}
                        editable={!saving}
                      />
                    </View>

                    <Text style={styles.horaSep}>→</Text>

                    <View style={styles.horaItem}>
                      <Text style={styles.horaLabel}>CIERRE</Text>
                      <TextInput
                        style={[styles.horaInput, !cierreValido && styles.inputError]}
                        value={d.cierre}
                        onChangeText={(v) => setHora(dia, 'cierre', v)}
                        placeholder="22:00"
                        placeholderTextColor="#444"
                        keyboardType="numbers-and-punctuation"
                        maxLength={5}
                        editable={!saving}
                      />
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
    paddingBottom: 32,
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
  horaInput: {
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'center',
  },
  inputError: {
    borderColor: '#EF4444',
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
});
