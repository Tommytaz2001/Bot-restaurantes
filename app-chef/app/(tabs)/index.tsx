import React from 'react';
import {
  View, Text, FlatList, StyleSheet,
  TouchableOpacity, SafeAreaView,
} from 'react-native';
import { usePedidosStore } from '../../src/store/pedidosStore';
import { usePedidosActivos } from '../../src/hooks/usePedidos';
import { PedidoCard } from '../../src/components/PedidoCard';
import { useAuthStore } from '../../src/store/authStore';

export default function PedidosScreen() {
  usePedidosActivos();
  const pedidos = usePedidosStore((s) => s.activos);
  const logout = useAuthStore((s) => s.logout);

  const pendientesCambio = pedidos.filter(
    (p) => p.cambio_solicitado?.estado === 'pendiente_chef'
  ).length;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Pedidos activos</Text>
          {pendientesCambio > 0 && (
            <Text style={styles.alertaCambio}>
              ⚠️ {pendientesCambio} cambio{pendientesCambio > 1 ? 's' : ''} pendiente{pendientesCambio > 1 ? 's' : ''}
            </Text>
          )}
        </View>
        <View style={styles.headerRight}>
          {pedidos.length > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{pedidos.length}</Text>
            </View>
          )}
          <TouchableOpacity onPress={logout}>
            <Text style={styles.logout}>Salir</Text>
          </TouchableOpacity>
        </View>
      </View>

      {pedidos.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyEmoji}>✅</Text>
          <Text style={styles.emptyText}>Sin pedidos activos</Text>
          <Text style={styles.emptySubtext}>Los nuevos pedidos aparecerán aquí en tiempo real</Text>
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
  container: { flex: 1, backgroundColor: '#000' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  title: { color: '#fff', fontSize: 24, fontWeight: '700' },
  alertaCambio: { color: '#FF9500', fontSize: 13, marginTop: 2 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  badge: {
    backgroundColor: '#FF9F0A',
    borderRadius: 12,
    minWidth: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  badgeText: { color: '#000', fontWeight: '700', fontSize: 13 },
  logout: { color: '#636366', fontSize: 15 },
  list: { paddingHorizontal: 20, paddingBottom: 20 },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  emptyEmoji: { fontSize: 52 },
  emptyText: { color: '#fff', fontSize: 20, fontWeight: '600' },
  emptySubtext: { color: '#636366', fontSize: 14, textAlign: 'center', paddingHorizontal: 40 },
});
