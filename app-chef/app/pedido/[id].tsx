import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, SafeAreaView, Alert, ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../src/services/firebaseConfig';
import {
  confirmarPedido, marcarEnCamino, marcarEntregado,
  rechazarPedido, aprobarCambio, rechazarCambio,
  type Pedido,
} from '../../src/services/pedidosService';
import { EstadoBadge } from '../../src/components/EstadoBadge';

function Boton({
  label, color, onPress, loading,
}: {
  label: string; color: string; onPress: () => void; loading?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.btn, { backgroundColor: color }]}
      onPress={onPress}
      disabled={loading}
      activeOpacity={0.8}
    >
      {loading
        ? <ActivityIndicator color="#000" />
        : <Text style={styles.btnText}>{label}</Text>
      }
    </TouchableOpacity>
  );
}

export default function DetallePedidoScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [accionando, setAccionando] = useState(false);

  useEffect(() => {
    if (!id) return;
    const unsub = onSnapshot(doc(db, 'pedidos', id), (snap) => {
      if (snap.exists()) setPedido({ id: snap.id, ...snap.data() } as Pedido);
    });
    return unsub;
  }, [id]);

  const ejecutar = async (fn: () => Promise<void>, confirmMsg?: string) => {
    if (confirmMsg) {
      Alert.alert('Confirmar', confirmMsg, [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Sí', style: 'destructive', onPress: async () => {
            setAccionando(true);
            try { await fn(); } finally { setAccionando(false); }
          },
        },
      ]);
    } else {
      setAccionando(true);
      try { await fn(); } finally { setAccionando(false); }
    }
  };

  if (!pedido) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator color="#FF9F0A" style={{ marginTop: 40 }} />
      </SafeAreaView>
    );
  }

  const tieneCambio = pedido.cambio_solicitado?.estado === 'pendiente_chef';

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>← Volver</Text>
        </TouchableOpacity>
        <EstadoBadge estado={pedido.estado} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Datos del cliente */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Cliente</Text>
          <Text style={styles.dato}>{pedido.cliente}</Text>
          <Text style={styles.subdato}>📞 {pedido.telefono}</Text>
          <Text style={styles.subdato}>📍 {pedido.direccion}</Text>
        </View>

        {/* Productos */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Productos</Text>
          {pedido.productos.map((p, i) => (
            <View key={i} style={styles.productoRow}>
              <Text style={styles.productoCant}>{p.cantidad}×</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.productoNombre}>{p.nombre}</Text>
                {p.opcion && <Text style={styles.productoOpcion}>{p.opcion}</Text>}
              </View>
            </View>
          ))}
          <View style={styles.divider} />
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValor}>{pedido.moneda ?? 'C$'}{pedido.total}</Text>
          </View>
          <Text style={styles.subdato}>
            {pedido.metodo_pago === 'efectivo' ? '💵 Efectivo' : '📲 Transferencia'}
          </Text>
        </View>

        {/* Cambio solicitado */}
        {tieneCambio && (
          <View style={styles.cambioSection}>
            <Text style={styles.cambioTitle}>⚠️ Cambio solicitado por el cliente</Text>
            <Text style={styles.cambioDesc}>{pedido.cambio_solicitado!.descripcion}</Text>
            <View style={styles.botonesRow}>
              <Boton
                label="✅ Aprobar cambio"
                color="#30D158"
                onPress={() => ejecutar(() => aprobarCambio(pedido.id))}
                loading={accionando}
              />
              <Boton
                label="❌ Rechazar cambio"
                color="#FF453A"
                onPress={() => ejecutar(() => rechazarCambio(pedido.id), '¿Rechazar el cambio solicitado?')}
                loading={accionando}
              />
            </View>
          </View>
        )}

        {/* Acciones por estado */}
        <View style={styles.acciones}>
          {(pedido.estado === 'pendiente' || pedido.estado === 'pendiente_pago') && (
            <View style={styles.botonesRow}>
              <Boton
                label="✅ Confirmar pedido"
                color="#30D158"
                onPress={() => ejecutar(() => confirmarPedido(pedido.id))}
                loading={accionando}
              />
              <Boton
                label="❌ Rechazar pedido"
                color="#FF453A"
                onPress={() => ejecutar(
                  () => rechazarPedido(pedido.id),
                  '¿Rechazar y cancelar este pedido?'
                )}
                loading={accionando}
              />
            </View>
          )}

          {pedido.estado === 'confirmado' && (
            <Boton
              label="🛵 Marcar en camino"
              color="#0A84FF"
              onPress={() => ejecutar(() => marcarEnCamino(pedido.id))}
              loading={accionando}
            />
          )}

          {pedido.estado === 'en_camino' && (
            <Boton
              label="✅ Marcar como entregado"
              color="#30D158"
              onPress={() => ejecutar(() => marcarEntregado(pedido.id))}
              loading={accionando}
            />
          )}

          {(pedido.estado === 'entregado' || pedido.estado === 'cancelado') && (
            <Text style={styles.estadoFinal}>
              {pedido.estado === 'entregado' ? '✅ Pedido entregado' : '❌ Pedido cancelado'}
            </Text>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  backBtn: { paddingVertical: 4 },
  backText: { color: '#FF9F0A', fontSize: 16 },
  content: { paddingHorizontal: 20, paddingBottom: 40, gap: 16 },
  section: {
    backgroundColor: '#1c1c1e',
    borderRadius: 14,
    padding: 16,
    gap: 6,
    borderWidth: 1,
    borderColor: '#2c2c2e',
  },
  sectionTitle: { color: '#636366', fontSize: 13, fontWeight: '600', marginBottom: 4 },
  dato: { color: '#fff', fontSize: 18, fontWeight: '600' },
  subdato: { color: '#8e8e93', fontSize: 14 },
  productoRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', paddingVertical: 4 },
  productoCant: { color: '#FF9F0A', fontSize: 15, fontWeight: '700', width: 28 },
  productoNombre: { color: '#fff', fontSize: 15 },
  productoOpcion: { color: '#8e8e93', fontSize: 13 },
  divider: { height: 1, backgroundColor: '#2c2c2e', marginVertical: 8 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between' },
  totalLabel: { color: '#aeaeb2', fontSize: 15 },
  totalValor: { color: '#FF9F0A', fontWeight: '700', fontSize: 17 },
  cambioSection: {
    backgroundColor: '#3d2800',
    borderRadius: 14,
    padding: 16,
    gap: 10,
    borderWidth: 1,
    borderColor: '#FF9500',
  },
  cambioTitle: { color: '#FF9500', fontWeight: '700', fontSize: 15 },
  cambioDesc: { color: '#ffe5b0', fontSize: 14 },
  acciones: { gap: 10, marginTop: 4 },
  botonesRow: { flexDirection: 'row', gap: 10 },
  btn: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnText: { color: '#000', fontWeight: '700', fontSize: 15 },
  estadoFinal: { color: '#636366', textAlign: 'center', fontSize: 16, paddingVertical: 20 },
});
