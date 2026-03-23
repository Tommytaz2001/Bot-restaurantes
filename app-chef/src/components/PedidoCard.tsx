import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { EstadoBadge } from './EstadoBadge';
import { ESTADO_CONFIG } from '../constants/estados';
import type { Pedido } from '../services/pedidosService';

function tiempoRelativo(ts: any): string {
  if (!ts?.toDate) return '';
  const diff = Math.floor((Date.now() - ts.toDate().getTime()) / 60000);
  if (diff < 1) return 'ahora';
  if (diff < 60) return `${diff} min`;
  return `${Math.floor(diff / 60)}h ${diff % 60}m`;
}

export function PedidoCard({ pedido }: { pedido: Pedido }) {
  const router = useRouter();
  const tieneCambio = pedido.cambio_solicitado?.estado === 'pendiente_chef';
  const accentColor = ESTADO_CONFIG[pedido.estado]?.accent ?? '#F59E0B';

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => router.push(`/pedido/${pedido.id}`)}
      activeOpacity={0.7}
    >
      {/* Left accent strip */}
      <View style={[styles.accentStrip, { backgroundColor: accentColor }]} />

      <View style={styles.body}>
        {/* Top row */}
        <View style={styles.topRow}>
          <EstadoBadge estado={pedido.estado} />
          <View style={styles.timeWrap}>
            <Text style={styles.timeIcon}>◷</Text>
            <Text style={styles.tiempo}>{tiempoRelativo(pedido.createdAt)}</Text>
          </View>
        </View>

        {/* Client name */}
        <Text style={styles.cliente}>{pedido.cliente}</Text>

        {/* Address */}
        <View style={styles.addressRow}>
          <Text style={styles.addressIcon}>⊙</Text>
          <Text style={styles.direccion} numberOfLines={1}>{pedido.direccion}</Text>
        </View>

        {/* Divider */}
        <View style={styles.divider} />

        {/* Products */}
        <View style={styles.productos}>
          {pedido.productos.slice(0, 2).map((p, i) => (
            <View key={i} style={styles.productoRow}>
              <Text style={[styles.productoCant, { color: accentColor }]}>{p.cantidad}×</Text>
              <Text style={styles.productoNombre}>
                {p.nombre}{p.opcion ? <Text style={styles.opcion}> · {p.opcion}</Text> : null}
              </Text>
            </View>
          ))}
          {pedido.productos.length > 2 && (
            <Text style={styles.masProductos}>+{pedido.productos.length - 2} más</Text>
          )}
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={[styles.total, { color: accentColor }]}>
            {pedido.moneda ?? 'C$'}{pedido.total}
          </Text>
          <View style={styles.pagoChip}>
            <Text style={styles.pagoText}>
              {pedido.metodo_pago === 'efectivo' ? '💵 Efectivo' : '📲 Transferencia'}
            </Text>
          </View>
          {tieneCambio && (
            <View style={styles.cambioAlert}>
              <Text style={styles.cambioText}>⚠ Cambio</Text>
            </View>
          )}
          <Text style={styles.chevron}>›</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    backgroundColor: '#161616',
    borderRadius: 16,
    marginBottom: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#242424',
  },
  accentStrip: {
    width: 3,
    borderTopLeftRadius: 16,
    borderBottomLeftRadius: 16,
  },
  body: {
    flex: 1,
    padding: 14,
    gap: 8,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  timeWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  timeIcon: {
    color: '#4A4A4A',
    fontSize: 12,
  },
  tiempo: {
    color: '#555555',
    fontSize: 12,
  },
  cliente: {
    color: '#F0F0F0',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  addressIcon: {
    color: '#444444',
    fontSize: 11,
  },
  direccion: {
    color: '#6B6B6B',
    fontSize: 13,
    flex: 1,
  },
  divider: {
    height: 1,
    backgroundColor: '#212121',
  },
  productos: {
    gap: 3,
  },
  productoRow: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
  },
  productoCant: {
    fontSize: 13,
    fontWeight: '700',
    width: 22,
  },
  productoNombre: {
    color: '#A0A0A0',
    fontSize: 13,
  },
  opcion: {
    color: '#555555',
    fontSize: 12,
  },
  masProductos: {
    color: '#444444',
    fontSize: 12,
    marginTop: 1,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  total: {
    fontWeight: '800',
    fontSize: 16,
  },
  pagoChip: {
    backgroundColor: '#1F1F1F',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  pagoText: {
    color: '#6B6B6B',
    fontSize: 11,
  },
  cambioAlert: {
    backgroundColor: 'rgba(245,158,11,0.2)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.4)',
  },
  cambioText: {
    color: '#F59E0B',
    fontSize: 11,
    fontWeight: '700',
  },
  chevron: {
    marginLeft: 'auto',
    color: '#333333',
    fontSize: 20,
    lineHeight: 22,
  },
});
