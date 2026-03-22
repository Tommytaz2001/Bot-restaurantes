import React from 'react';
import { View, Text, FlatList, StyleSheet, SafeAreaView } from 'react-native';
import { usePedidosStore } from '../../src/store/pedidosStore';
import { useHistorial } from '../../src/hooks/usePedidos';
import { EstadoBadge } from '../../src/components/EstadoBadge';
import type { Pedido } from '../../src/services/pedidosService';

function HistorialCard({ pedido }: { pedido: Pedido }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <EstadoBadge estado={pedido.estado} />
        <Text style={styles.total}>{pedido.moneda ?? 'C$'}{pedido.total}</Text>
      </View>
      <Text style={styles.cliente}>{pedido.cliente}</Text>
      <Text style={styles.productos}>
        {pedido.productos.map((p) => `${p.cantidad}× ${p.nombre}`).join(', ')}
      </Text>
    </View>
  );
}

export default function HistorialScreen() {
  useHistorial();
  const historial = usePedidosStore((s) => s.historial);

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Historial</Text>
      {historial.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>Sin pedidos en el historial</Text>
        </View>
      ) : (
        <FlatList
          data={historial}
          keyExtractor={(p) => p.id}
          renderItem={({ item }) => <HistorialCard pedido={item} />}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  title: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '700',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  list: { paddingHorizontal: 20, paddingBottom: 20 },
  card: {
    backgroundColor: '#1c1c1e',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    gap: 6,
    borderWidth: 1,
    borderColor: '#2c2c2e',
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  total: { color: '#FF9F0A', fontWeight: '700', fontSize: 15 },
  cliente: { color: '#fff', fontSize: 15, fontWeight: '600' },
  productos: { color: '#8e8e93', fontSize: 13 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: '#636366', fontSize: 15 },
});
