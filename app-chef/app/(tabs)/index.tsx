import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet,
  TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { usePedidosStore } from '../../src/store/pedidosStore';
import { usePedidosActivos } from '../../src/hooks/usePedidos';
import { PedidoCard } from '../../src/components/PedidoCard';
import { useAuthStore } from '../../src/store/authStore';
import { getBackendUrl } from '../../src/services/backendConfig';
import { BackendConfigModal } from '../../src/components/BackendConfigModal';

export default function PedidosScreen() {
  usePedidosActivos();
  const pedidos = usePedidosStore((s) => s.activos);
  const logout = useAuthStore((s) => s.logout);

  const [backend, setBackend] = useState('');
  const [botActivo, setBotActivo] = useState<boolean | null>(null);
  const [toggling, setToggling] = useState(false);
  const [showConfig, setShowConfig] = useState(false);

  const pendientesCambio = pedidos.filter(
    (p) => p.cambio_solicitado?.estado === 'pendiente_chef'
  ).length;

  const fetchStatus = useCallback(async (url: string) => {
    try {
      const res = await fetch(`${url}/whatsapp/status`, { signal: AbortSignal.timeout(5000) });
      const data = await res.json();
      setBotActivo(data.botActivo ?? true);
    } catch (err) {
      console.error('[BotToggle] fetchStatus error:', err);
      setBotActivo(null);
    }
  }, []);

  useEffect(() => {
    getBackendUrl().then((url) => {
      setBackend(url);
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
          {/* Kill switch del bot */}
          <TouchableOpacity
            onPress={toggleBot}
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
              {botActivo === null ? 'Sin conexión' : botActivo ? 'Bot activo' : 'Bot pausado'}
            </Text>
          </TouchableOpacity>

          <View style={styles.secondRow}>
            {/* Tuerca de configuración */}
            <TouchableOpacity onPress={() => setShowConfig(true)} style={styles.gearBtn} activeOpacity={0.7}>
              <Text style={styles.gearIcon}>⚙</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={logout} style={styles.logoutBtn} activeOpacity={0.7}>
              <Text style={styles.logoutText}>Salir</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

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

      <BackendConfigModal
        visible={showConfig}
        onClose={() => setShowConfig(false)}
        onSaved={(url) => { setBackend(url); fetchStatus(url); }}
      />
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
    flex: 1,
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
  secondRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  gearBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#1A1A1A',
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  gearIcon: {
    fontSize: 15,
    color: '#555',
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
});
