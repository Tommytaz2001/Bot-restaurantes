import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, FlatList, StyleSheet,
  TouchableOpacity, ActivityIndicator,
  Modal, TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { usePedidosStore } from '../../src/store/pedidosStore';
import { usePedidosActivos } from '../../src/hooks/usePedidos';
import { PedidoCard } from '../../src/components/PedidoCard';
import { useAuthStore } from '../../src/store/authStore';
import { getBackendUrl, setBackendUrl } from '../../src/services/backendConfig';

export default function PedidosScreen() {
  usePedidosActivos();
  const pedidos = usePedidosStore((s) => s.activos);
  const logout = useAuthStore((s) => s.logout);

  const [backend, setBackend] = useState('');
  const [botActivo, setBotActivo] = useState<boolean | null>(null);
  const [toggling, setToggling] = useState(false);

  // Modal de configuración de URL
  const [showConfig, setShowConfig] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchStatus = useCallback(async (url: string) => {
    try {
      const res = await fetch(`${url}/whatsapp/status`, { signal: AbortSignal.timeout(5000) });
      const data = await res.json();
      setBotActivo(data.botActivo ?? true);
    } catch (err) {
      console.error('[BotToggle] fetchStatus error:', err);
      setBotActivo(true);
    }
  }, []);

  // Carga URL guardada y estado del bot al iniciar
  useEffect(() => {
    getBackendUrl().then((url) => {
      setBackend(url);
      setUrlInput(url);
      fetchStatus(url);
    });
  }, []);

  const toggleBot = useCallback(async () => {
    if (toggling || botActivo === null || !backend) return;
    setToggling(true);
    try {
      const endpoint = botActivo ? '/whatsapp/pause' : '/whatsapp/resume';
      const res = await fetch(`${backend}${endpoint}`, {
        method: 'POST',
        signal: AbortSignal.timeout(5000),
      });
      const data = await res.json();
      setBotActivo(data.botActivo);
    } catch (err) {
      console.error('[BotToggle] toggle error:', err);
    } finally {
      setToggling(false);
    }
  }, [botActivo, toggling, backend]);

  const saveUrl = useCallback(async () => {
    setSaving(true);
    await setBackendUrl(urlInput);
    setBackend(urlInput.trim().replace(/\/$/, ''));
    await fetchStatus(urlInput.trim().replace(/\/$/, ''));
    setSaving(false);
    setShowConfig(false);
  }, [urlInput]);

  const pendientesCambio = pedidos.filter(
    (p) => p.cambio_solicitado?.estado === 'pendiente_chef'
  ).length;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar style="light" />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerLabel}>PEDIDOS</Text>
          <View style={styles.titleRow}>
            <Text style={styles.title}>Activos</Text>
            {pedidos.length > 0 && (
              <View style={styles.countBadge}>
                <Text style={styles.countText}>{pedidos.length}</Text>
              </View>
            )}
          </View>
          {pendientesCambio > 0 && (
            <View style={styles.alertaRow}>
              <View style={styles.alertaDot} />
              <Text style={styles.alertaText}>
                {pendientesCambio} cambio{pendientesCambio > 1 ? 's' : ''} por revisar
              </Text>
            </View>
          )}
        </View>
        <View style={styles.headerActions}>
          {/* Kill switch — press: toggle, long press: configurar URL */}
          <TouchableOpacity
            onPress={toggleBot}
            onLongPress={() => { setUrlInput(backend); setShowConfig(true); }}
            style={[styles.botToggle, botActivo === false && styles.botTogglePaused]}
            activeOpacity={0.7}
            disabled={toggling}
          >
            {toggling ? (
              <ActivityIndicator size="small" color={botActivo ? '#34D399' : '#EF4444'} />
            ) : (
              <View style={[styles.botDot, botActivo === false && styles.botDotPaused]} />
            )}
            <Text style={[styles.botToggleText, botActivo === false && styles.botToggleTextPaused]}>
              {botActivo === null ? 'Conectando...' : botActivo ? 'Bot activo' : 'Bot pausado'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={logout} style={styles.logoutBtn} activeOpacity={0.7}>
            <Text style={styles.logoutText}>Salir</Text>
          </TouchableOpacity>
        </View>

      {/* Modal de configuración de URL del backend */}
      <Modal visible={showConfig} transparent animationType="fade" onRequestClose={() => setShowConfig(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>URL del backend</Text>
            <Text style={styles.modalSub}>Ingresa la dirección de tu servidor</Text>
            <TextInput
              style={styles.modalInput}
              value={urlInput}
              onChangeText={setUrlInput}
              placeholder="http://192.168.1.16:3001"
              placeholderTextColor="#444"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setShowConfig(false)} style={styles.modalCancel} activeOpacity={0.7}>
                <Text style={styles.modalCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={saveUrl} style={styles.modalSave} activeOpacity={0.7} disabled={saving}>
                {saving
                  ? <ActivityIndicator size="small" color="#0C0C0C" />
                  : <Text style={styles.modalSaveText}>Guardar</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
      </View>

      {/* Divider */}
      <View style={styles.headerDivider} />

      {/* Content */}
      {pedidos.length === 0 ? (
        <View style={styles.empty}>
          <View style={styles.emptyIconWrap}>
            <Text style={styles.emptyIcon}>✓</Text>
          </View>
          <Text style={styles.emptyTitle}>Sin pedidos activos</Text>
          <Text style={styles.emptySubtitle}>
            Los nuevos pedidos aparecerán{'\n'}aquí en tiempo real
          </Text>
          <View style={styles.emptyPulse} />
        </View>
      ) : (
        <FlatList
          data={pedidos}
          keyExtractor={(p) => p.id}
          renderItem={({ item }) => <PedidoCard pedido={item} />}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0C0C0C',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 16,
  },
  headerLeft: {
    gap: 3,
  },
  headerLabel: {
    color: '#3A3A3A',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 2,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  title: {
    color: '#F0F0F0',
    fontSize: 26,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  countBadge: {
    backgroundColor: '#F59E0B',
    borderRadius: 12,
    minWidth: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  countText: {
    color: '#0C0C0C',
    fontWeight: '800',
    fontSize: 13,
  },
  alertaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  alertaDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#F59E0B',
  },
  alertaText: {
    color: '#F59E0B',
    fontSize: 12,
    fontWeight: '600',
  },
  headerActions: {
    alignItems: 'flex-end',
    gap: 8,
    marginTop: 4,
  },
  botToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#0D1F13',
    borderWidth: 1,
    borderColor: '#1A3A22',
  },
  botTogglePaused: {
    backgroundColor: '#1F0D0D',
    borderColor: '#3A1A1A',
  },
  botDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#34D399',
  },
  botDotPaused: {
    backgroundColor: '#EF4444',
  },
  botToggleText: {
    color: '#34D399',
    fontSize: 13,
    fontWeight: '600',
  },
  botToggleTextPaused: {
    color: '#EF4444',
  },
  logoutBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#1A1A1A',
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  logoutText: {
    color: '#555555',
    fontSize: 13,
    fontWeight: '600',
  },
  headerDivider: {
    height: 1,
    backgroundColor: '#1A1A1A',
    marginHorizontal: 20,
    marginBottom: 4,
  },
  list: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 24,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingBottom: 60,
  },
  emptyIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#161616',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyIcon: {
    color: '#34D399',
    fontSize: 28,
    fontWeight: '300',
  },
  emptyTitle: {
    color: '#F0F0F0',
    fontSize: 18,
    fontWeight: '600',
  },
  emptySubtitle: {
    color: '#444444',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
  },
  emptyPulse: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#34D399',
    marginTop: 8,
    opacity: 0.6,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  modalBox: {
    backgroundColor: '#161616',
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    gap: 12,
  },
  modalTitle: {
    color: '#F0F0F0',
    fontSize: 17,
    fontWeight: '700',
  },
  modalSub: {
    color: '#555',
    fontSize: 13,
    marginTop: -6,
  },
  modalInput: {
    backgroundColor: '#0C0C0C',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#F0F0F0',
    fontSize: 14,
    fontFamily: 'monospace',
    marginTop: 4,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  modalCancel: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#1A1A1A',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    alignItems: 'center',
  },
  modalCancelText: {
    color: '#555',
    fontWeight: '600',
    fontSize: 14,
  },
  modalSave: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#F59E0B',
    alignItems: 'center',
  },
  modalSaveText: {
    color: '#0C0C0C',
    fontWeight: '700',
    fontSize: 14,
  },
});
