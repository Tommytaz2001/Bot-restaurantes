import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { ESTADO_CONFIG } from '../constants/estados';
import type { EstadoPedido } from '../services/pedidosService';

export function EstadoBadge({ estado }: { estado: EstadoPedido }) {
  const cfg = ESTADO_CONFIG[estado] ?? { label: estado, color: '#9A9A9A', bg: 'rgba(154,154,154,0.15)' };
  return (
    <View style={[styles.badge, { backgroundColor: cfg.bg }]}>
      <View style={[styles.dot, { backgroundColor: cfg.color }]} />
      <Text style={[styles.text, { color: cfg.color }]}>{cfg.label.toUpperCase()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    alignSelf: 'flex-start',
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  text: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
});
