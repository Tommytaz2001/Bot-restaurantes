import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { EstadoBadge } from './EstadoBadge';
import type { Pedido } from '../services/pedidosService';

function tiempoRelativo(ts: any): string {
  if (!ts?.toDate) return '';
  const diff = Math.floor((Date.now() - ts.toDate().getTime()) / 60000);
  if (diff < 1) return 'ahora';
  if (diff < 60) return `hace ${diff} min`;
  return `hace ${Math.floor(diff / 60)}h`;
}

export function PedidoCard({ pedido }: { pedido: Pedido }) {
  const router = useRouter();
  const tieneCambio = pedido.cambio_solicitado?.estado === 'pendiente_chef';

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => router.push(`/pedido/${pedido.id}`)}
      activeOpacity={0.75}
    >
      <View style={styles.header}>
        <EstadoBadge estado={pedido.estado} />
        <Text style={styles.tiempo}>{tiempoRelativo(pedido.createdAt)}</Text>
      </View>

      <Text style={styles.cliente}>{pedido.cliente}</Text>
      <Text style={styles.direccion} numberOfLines={1}>{pedido.direccion}</Text>

      <View style={styles.productos}>
        {pedido.productos.slice(0, 2).map((p, i) => (
          <Text key={i} style={styles.producto}>
            {p.cantidad}× {p.nombre}{p.opcion ? ` (${p.opcion})` : ''}
          </Text>
        ))}
        {pedido.productos.length > 2 && (
          <Text style={styles.masProductos}>+{pedido.productos.length - 2} más</Text>
        )}
      </View>

      <View style={styles.footer}>
        <Text style={styles.total}>
          {pedido.moneda ?? 'C$'}{pedido.total}
        </Text>
        <Text style={styles.pago}>
          {pedido.metodo_pago === 'efectivo' ? '💵 Efectivo' : '📲 Transferencia'}
        </Text>
        {tieneCambio && (
          <View style={styles.cambioAlert}>
            <Text style={styles.cambioText}>⚠️ Cambio pendiente</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#1c1c1e',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: '#2c2c2e',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tiempo: { color: '#636366', fontSize: 13 },
  cliente: { color: '#fff', fontSize: 17, fontWeight: '600' },
  direccion: { color: '#8e8e93', fontSize: 13 },
  productos: { gap: 2 },
  producto: { color: '#aeaeb2', fontSize: 14 },
  masProductos: { color: '#636366', fontSize: 13 },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 4,
  },
  total: { color: '#FF9F0A', fontWeight: '700', fontSize: 16 },
  pago: { color: '#8e8e93', fontSize: 13 },
  cambioAlert: {
    marginLeft: 'auto',
    backgroundColor: '#3d2800',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  cambioText: { color: '#FF9500', fontSize: 12, fontWeight: '600' },
});
