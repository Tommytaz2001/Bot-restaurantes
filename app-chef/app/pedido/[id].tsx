import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../src/services/firebaseConfig';
import {
  confirmarPedido, marcarEnCamino, marcarEntregado,
  rechazarPedido, aprobarCambio, rechazarCambio, notificarCliente,
  type Pedido,
} from '../../src/services/pedidosService';
import { EstadoBadge } from '../../src/components/EstadoBadge';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';

function ActionBtn({
  label, color, textColor = '#0C0C0C', onPress, loading, outline = false,
}: {
  label: string; color: string; textColor?: string; onPress: () => void; loading?: boolean; outline?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[
        styles.btn,
        outline
          ? { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: color }
          : { backgroundColor: color },
      ]}
      onPress={onPress}
      disabled={loading}
      activeOpacity={0.8}
    >
      {loading ? (
        <ActivityIndicator color={outline ? color : textColor} size="small" />
      ) : (
        <Text style={[styles.btnText, { color: outline ? color : textColor }]}>{label}</Text>
      )}
    </TouchableOpacity>
  );
}

function InfoRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoIcon}>{icon}</Text>
      <View style={styles.infoContent}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue}>{value}</Text>
      </View>
    </View>
  );
}

export default function DetallePedidoScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [accionando, setAccionando] = useState(false);
  const [copiado, setCopiado] = useState(false);

  const copiarParaDelivery = async () => {
    if (!pedido) return;
    const envio = pedido.costo_envio ?? 0;
    const subtotal = Math.round((pedido.total ?? 0) - envio);
    const moneda = pedido.moneda ?? 'C$';

    const lineas: string[] = [
      '🛵 Pedido para delivery',
      `👤 ${pedido.cliente}`,
      `📞 ${pedido.telefono}`,
      `📍 ${pedido.direccion}`,
      '─────────────────────',
      ...pedido.productos.map((p) =>
        `• ${p.cantidad}× ${p.nombre}${p.opcion ? ` (${p.opcion})` : ''}`
      ),
      '─────────────────────',
      `💰 Subtotal: ${moneda}${subtotal}`,
      `🛵 Envío: ${moneda}${envio}`,
      `💰 Total: ${moneda}${pedido.total}`,
      `💳 ${pedido.metodo_pago === 'efectivo' ? 'Efectivo' : 'Transferencia'}`,
    ];

    await Clipboard.setStringAsync(lineas.join('\n'));
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 1500);
  };

  useEffect(() => {
    if (!id) return;
    const unsub = onSnapshot(doc(db, 'pedidos', id), (snap) => {
      if (snap.exists()) setPedido({ id: snap.id, ...snap.data() } as Pedido);
    });
    return unsub;
  }, [id]);

  const ejecutar = async (fn: () => Promise<void>, confirmMsg?: string) => {
    if (confirmMsg) {
      Alert.alert('Confirmar acción', confirmMsg, [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Confirmar',
          style: 'destructive',
          onPress: async () => {
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
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <StatusBar style="light" />
        <View style={styles.loadingWrap}>
          <ActivityIndicator color="#F59E0B" size="large" />
          <Text style={styles.loadingText}>Cargando pedido...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const tieneCambio = pedido.cambio_solicitado?.estado === 'pendiente_chef';
  const esFinal = pedido.estado === 'entregado' || pedido.estado === 'cancelado';

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar style="light" />

      {/* Top bar */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.7}>
          <Text style={styles.backArrow}>‹</Text>
          <Text style={styles.backText}>Volver</Text>
        </TouchableOpacity>
        <EstadoBadge estado={pedido.estado} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Client section */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>CLIENTE</Text>
          <Text style={styles.clienteName}>{pedido.cliente}</Text>
          <View style={styles.sectionDivider} />
          <InfoRow icon="◎" label="Teléfono" value={pedido.telefono} />
          <InfoRow icon="⊙" label="Dirección" value={pedido.direccion} />
          {pedido.tipo_entrega === 'delivery' && (
            <>
              <View style={styles.sectionDivider} />
              <TouchableOpacity
                style={[styles.copyBtn, copiado && styles.copyBtnCopiado]}
                onPress={copiarParaDelivery}
                activeOpacity={0.7}
              >
                <Text style={[styles.copyBtnText, copiado && styles.copyBtnTextCopiado]}>
                  {copiado ? '¡Copiado! ✓' : '📋 Copiar para delivery'}
                </Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* Products section */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>PRODUCTOS</Text>
          {pedido.productos.map((p, i) => (
            <View key={i} style={styles.productoRow}>
              <View style={styles.cantWrap}>
                <Text style={styles.cant}>{p.cantidad}</Text>
              </View>
              <View style={styles.productoInfo}>
                <Text style={styles.productoNombre}>{p.nombre}</Text>
                {p.opcion ? <Text style={styles.productoOpcion}>{p.opcion}</Text> : null}
              </View>
            </View>
          ))}
          <View style={styles.sectionDivider} />
          {pedido.costo_envio != null && pedido.costo_envio > 0 ? (
            <>
              <View style={styles.subtotalRow}>
                <Text style={styles.subtotalLabel}>Subtotal</Text>
                <Text style={styles.subtotalValor}>
                  {pedido.moneda ?? 'C$'}{Math.round((pedido.total ?? 0) - pedido.costo_envio)}
                </Text>
              </View>
              <View style={styles.envioRow}>
                <Text style={styles.envioLabel}>🛵 Envío</Text>
                <Text style={styles.envioValor}>
                  {pedido.moneda ?? 'C$'}{pedido.costo_envio}
                </Text>
              </View>
              <View style={styles.desgloseDivider} />
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Total</Text>
                <Text style={styles.totalValor}>{pedido.moneda ?? 'C$'}{pedido.total}</Text>
              </View>
            </>
          ) : (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalValor}>{pedido.moneda ?? 'C$'}{pedido.total}</Text>
            </View>
          )}
          <View style={styles.pagoRow}>
            <Text style={styles.pagoText}>
              {pedido.metodo_pago === 'efectivo' ? '💵 Efectivo' : '📲 Transferencia'}
            </Text>
          </View>
        </View>

        {/* Change request section */}
        {tieneCambio && (
          <View style={styles.cambioSection}>
            <View style={styles.cambioHeader}>
              <Text style={styles.cambioWarning}>⚠</Text>
              <Text style={styles.cambioTitle}>Cambio solicitado por el cliente</Text>
            </View>
            <Text style={styles.cambioDesc}>{pedido.cambio_solicitado!.descripcion}</Text>
            <View style={styles.cambioAcciones}>
              <ActionBtn
                label="Aprobar cambio"
                color="#22C55E"
                onPress={() => ejecutar(async () => {
                  await aprobarCambio(pedido.id);
                  notificarCliente(pedido.id, 'cambio_aprobado');
                })}
                loading={accionando}
              />
              <ActionBtn
                label="Rechazar"
                color="#EF4444"
                outline
                textColor="#EF4444"
                onPress={() => ejecutar(
                  async () => {
                    await rechazarCambio(pedido.id);
                    notificarCliente(pedido.id, 'cambio_rechazado');
                  },
                  '¿Rechazar el cambio solicitado?'
                )}
                loading={accionando}
              />
            </View>
          </View>
        )}

        {/* Spacer for bottom actions */}
        <View style={{ height: 20 }} />
      </ScrollView>

      {/* Bottom action bar */}
      {!esFinal && (
        <View style={styles.actionBar}>
          {(pedido.estado === 'pendiente' || pedido.estado === 'pendiente_pago') && (
            <View style={styles.actionRow}>
              <ActionBtn
                label="✓  Confirmar"
                color="#22C55E"
                onPress={() => ejecutar(async () => {
                  await confirmarPedido(pedido.id);
                  notificarCliente(pedido.id, 'confirmado');
                })}
                loading={accionando}
              />
              <ActionBtn
                label="✕  Rechazar"
                color="#EF4444"
                outline
                textColor="#EF4444"
                onPress={() => ejecutar(
                  async () => {
                    await rechazarPedido(pedido.id);
                    notificarCliente(pedido.id, 'rechazado');
                  },
                  '¿Cancelar y rechazar este pedido?'
                )}
                loading={accionando}
              />
            </View>
          )}

          {pedido.estado === 'confirmado' && (
            <ActionBtn
              label="🛵  Marcar en camino"
              color="#3B82F6"
              textColor="#fff"
              onPress={() => ejecutar(async () => {
                await marcarEnCamino(pedido.id);
                notificarCliente(pedido.id, 'en_camino');
              })}
              loading={accionando}
            />
          )}

          {pedido.estado === 'en_camino' && (
            <ActionBtn
              label="✓  Marcar como entregado"
              color="#22C55E"
              onPress={() => ejecutar(async () => {
                await marcarEntregado(pedido.id);
                notificarCliente(pedido.id, 'entregado');
              })}
              loading={accionando}
            />
          )}
        </View>
      )}

      {esFinal && (
        <View style={styles.finalBar}>
          <Text style={styles.finalText}>
            {pedido.estado === 'entregado' ? '✓  Pedido entregado exitosamente' : '✕  Pedido cancelado'}
          </Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0C0C0C',
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  loadingText: {
    color: '#555555',
    fontSize: 14,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A1A',
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingVertical: 4,
    paddingRight: 8,
  },
  backArrow: {
    color: '#F59E0B',
    fontSize: 26,
    lineHeight: 28,
    marginTop: -2,
  },
  backText: {
    color: '#F59E0B',
    fontSize: 15,
    fontWeight: '600',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 12,
  },
  section: {
    backgroundColor: '#161616',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#242424',
    gap: 10,
  },
  sectionLabel: {
    color: '#3A3A3A',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginBottom: 2,
  },
  clienteName: {
    color: '#F0F0F0',
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  sectionDivider: {
    height: 1,
    backgroundColor: '#212121',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  infoIcon: {
    color: '#3A3A3A',
    fontSize: 14,
    marginTop: 2,
    width: 16,
    textAlign: 'center',
  },
  infoContent: {
    flex: 1,
    gap: 1,
  },
  infoLabel: {
    color: '#444444',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  infoValue: {
    color: '#C0C0C0',
    fontSize: 14,
  },
  productoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  cantWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: 'rgba(245,158,11,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cant: {
    color: '#F59E0B',
    fontSize: 13,
    fontWeight: '800',
  },
  productoInfo: {
    flex: 1,
    paddingTop: 4,
    gap: 2,
  },
  productoNombre: {
    color: '#E0E0E0',
    fontSize: 15,
    fontWeight: '500',
  },
  productoOpcion: {
    color: '#555555',
    fontSize: 12,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLabel: {
    color: '#6B6B6B',
    fontSize: 14,
  },
  totalValor: {
    color: '#F59E0B',
    fontWeight: '800',
    fontSize: 20,
  },
  pagoRow: {
    alignItems: 'flex-start',
  },
  pagoText: {
    color: '#555555',
    fontSize: 13,
  },
  cambioSection: {
    backgroundColor: '#18120A',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.3)',
    gap: 12,
  },
  cambioHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cambioWarning: {
    color: '#F59E0B',
    fontSize: 16,
  },
  cambioTitle: {
    color: '#F59E0B',
    fontWeight: '700',
    fontSize: 14,
    flex: 1,
  },
  cambioDesc: {
    color: '#C09060',
    fontSize: 14,
    lineHeight: 20,
  },
  cambioAcciones: {
    flexDirection: 'row',
    gap: 10,
  },
  actionBar: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    borderTopWidth: 1,
    borderTopColor: '#1A1A1A',
    backgroundColor: '#0C0C0C',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  btn: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  btnText: {
    fontWeight: '700',
    fontSize: 14,
    letterSpacing: 0.3,
  },
  finalBar: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#1A1A1A',
    alignItems: 'center',
  },
  finalText: {
    color: '#444444',
    fontSize: 14,
    fontWeight: '600',
  },
  subtotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  subtotalLabel: {
    color: '#6B6B6B',
    fontSize: 14,
  },
  subtotalValor: {
    color: '#6B6B6B',
    fontSize: 15,
  },
  envioRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  envioLabel: {
    color: '#6B6B6B',
    fontSize: 14,
  },
  envioValor: {
    color: '#6B6B6B',
    fontSize: 15,
  },
  desgloseDivider: {
    height: 1,
    backgroundColor: '#212121',
  },
  copyBtn: {
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderRadius: 12,
    paddingVertical: 13,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  copyBtnCopiado: {
    backgroundColor: 'rgba(34,197,94,0.1)',
    borderColor: '#22C55E',
  },
  copyBtnText: {
    color: '#888888',
    fontSize: 14,
    fontWeight: '500',
  },
  copyBtnTextCopiado: {
    color: '#22C55E',
    fontWeight: '600',
  },
});
