import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  ScrollView, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { fetchHistorial, type FiltroHistorial, type HistorialPage } from '../../src/services/pedidosService';
import { EstadoBadge } from '../../src/components/EstadoBadge';
import { ESTADO_CONFIG } from '../../src/constants/estados';
import type { Pedido } from '../../src/services/pedidosService';

const FILTROS: { key: FiltroHistorial; label: string }[] = [
  { key: 'todos',   label: 'Todos'   },
  { key: 'hoy',    label: 'Hoy'     },
  { key: 'ayer',   label: 'Ayer'    },
  { key: '7dias',  label: '7 días'  },
  { key: '30dias', label: '30 días' },
];

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
  const [filtro, setFiltro]           = useState<FiltroHistorial>('todos');
  const [pedidos, setPedidos]         = useState<Pedido[]>([]);
  const [loading, setLoading]         = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing]   = useState(false);
  const pageRef = useRef<Pick<HistorialPage, 'cursor' | 'hasMore'>>({ cursor: null, hasMore: false });

  const cargarPrimera = useCallback(async (f: FiltroHistorial) => {
    const result = await fetchHistorial({ filtro: f, cursor: null });
    setPedidos(result.pedidos);
    pageRef.current = { cursor: result.cursor, hasMore: result.hasMore };
  }, []);

  // Carga inicial y al cambiar filtro
  useEffect(() => {
    setLoading(true);
    setPedidos([]);
    pageRef.current = { cursor: null, hasMore: false };
    cargarPrimera(filtro).finally(() => setLoading(false));
  }, [filtro]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    setPedidos([]);
    pageRef.current = { cursor: null, hasMore: false };
    await cargarPrimera(filtro);
    setRefreshing(false);
  }, [filtro]);

  const onEndReached = useCallback(async () => {
    if (!pageRef.current.hasMore || loadingMore) return;
    setLoadingMore(true);
    try {
      const result = await fetchHistorial({ filtro, cursor: pageRef.current.cursor });
      setPedidos((prev) => [...prev, ...result.pedidos]);
      pageRef.current = { cursor: result.cursor, hasMore: result.hasMore };
    } catch (err) {
      console.error('[Historial] Error cargando más:', err);
    } finally {
      setLoadingMore(false);
    }
  }, [filtro, loadingMore]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar style="light" />

      <View style={styles.header}>
        <Text style={styles.headerLabel}>REGISTRO</Text>
        <Text style={styles.title}>Historial</Text>
      </View>

      {/* Filtros */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filtrosScroll}
        contentContainerStyle={styles.filtrosContent}
      >
        {FILTROS.map((f) => (
          <TouchableOpacity
            key={f.key}
            style={[styles.chip, filtro === f.key && styles.chipActive]}
            onPress={() => setFiltro(f.key)}
            activeOpacity={0.7}
          >
            <Text style={[styles.chipText, filtro === f.key && styles.chipTextActive]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View style={styles.headerDivider} />

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color="#F59E0B" size="small" />
        </View>
      ) : pedidos.length === 0 ? (
        <View style={styles.empty}>
          <View style={styles.emptyIconWrap}>
            <Text style={styles.emptyIcon}>≡</Text>
          </View>
          <Text style={styles.emptyTitle}>Sin resultados</Text>
          <Text style={styles.emptySubtitle}>
            {filtro === 'todos'
              ? 'Los pedidos completados\naparecerán aquí'
              : 'No hay pedidos en este período'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={pedidos}
          keyExtractor={(p) => p.id}
          renderItem={({ item }) => <HistorialCard pedido={item} />}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.4}
          onRefresh={onRefresh}
          refreshing={refreshing}
          ListFooterComponent={
            loadingMore ? (
              <View style={styles.footerLoader}>
                <ActivityIndicator color="#F59E0B" size="small" />
              </View>
            ) : null
          }
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
    paddingBottom: 12,
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
  filtrosScroll: {
    maxHeight: 44,
  },
  filtrosContent: {
    paddingHorizontal: 16,
    gap: 8,
    alignItems: 'center',
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#161616',
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  chipActive: {
    backgroundColor: '#1A1500',
    borderColor: '#F59E0B',
  },
  chipText: {
    color: '#555555',
    fontSize: 13,
    fontWeight: '500',
  },
  chipTextActive: {
    color: '#F59E0B',
    fontWeight: '700',
  },
  headerDivider: {
    height: 1,
    backgroundColor: '#1A1A1A',
    marginHorizontal: 20,
    marginTop: 10,
    marginBottom: 4,
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 24,
  },
  footerLoader: {
    paddingVertical: 20,
    alignItems: 'center',
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
