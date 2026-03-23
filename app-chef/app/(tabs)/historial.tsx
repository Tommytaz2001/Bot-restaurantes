import React from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { usePedidosStore } from '../../src/store/pedidosStore';
import { useHistorial } from '../../src/hooks/usePedidos';
import { EstadoBadge } from '../../src/components/EstadoBadge';
import { ESTADO_CONFIG } from '../../src/constants/estados';
import type { Pedido } from '../../src/services/pedidosService';

function formatFecha(ts: any): string {
  if (!ts?.toDate) return '';
  const d = ts.toDate();
  return d.toLocaleDateString('es-NI', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function HistorialCard({ pedido }: { pedido: Pedido }) {
  const accentColor = ESTADO_CONFIG[pedido.estado]?.accent ?? '#555555';
  return (
    <View style={styles.card}>
      <View style={[styles.accentLine, { backgroundColor: accentColor }]} />
      <View style={styles.cardBody}>
        <View style={styles.cardTop}>
          <EstadoBadge estado={pedido.estado} />
          <Text style={styles.fecha}>{formatFecha(pedido.createdAt)}</Text>
        </View>
        <View style={styles.cardMid}>
          <Text style={styles.cliente}>{pedido.cliente}</Text>
          <Text style={[styles.total, { color: accentColor }]}>
            {pedido.moneda ?? 'C$'}{pedido.total}
          </Text>
        </View>
        <Text style={styles.productos} numberOfLines={1}>
          {pedido.productos.map((p) => `${p.cantidad}× ${p.nombre}`).join('  ·  ')}
        </Text>
      </View>
    </View>
  );
}

export default function HistorialScreen() {
  useHistorial();
  const historial = usePedidosStore((s) => s.historial);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar style="light" />

      <View style={styles.header}>
        <Text style={styles.headerLabel}>REGISTRO</Text>
        <Text style={styles.title}>Historial</Text>
      </View>

      <View style={styles.headerDivider} />

      {historial.length === 0 ? (
        <View style={styles.empty}>
          <View style={styles.emptyIconWrap}>
            <Text style={styles.emptyIcon}>≡</Text>
          </View>
          <Text style={styles.emptyTitle}>Sin historial</Text>
          <Text style={styles.emptySubtitle}>Los pedidos completados{'\n'}aparecerán aquí</Text>
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
  container: {
    flex: 1,
    backgroundColor: '#0C0C0C',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 16,
    gap: 3,
  },
  headerLabel: {
    color: '#3A3A3A',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 2,
  },
  title: {
    color: '#F0F0F0',
    fontSize: 26,
    fontWeight: '700',
    letterSpacing: 0.3,
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
  card: {
    flexDirection: 'row',
    backgroundColor: '#161616',
    borderRadius: 14,
    marginBottom: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#212121',
  },
  accentLine: {
    width: 3,
  },
  cardBody: {
    flex: 1,
    padding: 14,
    gap: 6,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  fecha: {
    color: '#444444',
    fontSize: 11,
  },
  cardMid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cliente: {
    color: '#E0E0E0',
    fontSize: 15,
    fontWeight: '600',
  },
  total: {
    fontWeight: '700',
    fontSize: 15,
  },
  productos: {
    color: '#555555',
    fontSize: 12,
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
    color: '#3A3A3A',
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
});
