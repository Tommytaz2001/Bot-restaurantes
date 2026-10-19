const { saveOrder, getOrder } = require('../orders/orderService');
const { query } = require('../db/connection');
const { orderEvents } = require('../services/orderEvents');

const PEDIDOS_DEMO = [
  {
    cliente: 'Carlos Mendoza',
    telefono: '+50588112233',
    tipo_entrega: 'delivery',
    direccion: 'Colonial Los Robles, casa #45, frente al parque',
    metodo_pago: 'efectivo',
    productos: [
      { nombre: 'Clásica', cantidad: 2, precio_unitario: 160, opcion: 'una sin cebolla' },
      { nombre: 'Papas Peor es Nada', cantidad: 1, precio_unitario: 80, opcion: null },
      { nombre: 'Coca Cola 355ml', cantidad: 1, precio_unitario: 30, opcion: null },
    ],
  },
  {
    cliente: 'Sofía Morales',
    telefono: '+50587223344',
    tipo_entrega: 'retiro',
    direccion: 'Retiro en restaurante',
    metodo_pago: 'transferencia',
    comprobante_url: '/uploads/comprobante_demo.png',
    productos: [
      { nombre: 'Tacos Birria', cantidad: 1, precio_unitario: 190, opcion: 'con caldo bien caliente' },
      { nombre: 'Fresca 355ml', cantidad: 1, precio_unitario: 30, opcion: null },
    ],
  },
  {
    cliente: 'Kevin Gutiérrez',
    telefono: '+50586334455',
    tipo_entrega: 'delivery',
    direccion: 'Altamira D’Este, del Palí 2c al sur',
    metodo_pago: 'efectivo',
    productos: [
      { nombre: 'Burrito Pastor-cerdo Combo', cantidad: 1, precio_unitario: 230, opcion: 'salsa aparte' },
      { nombre: 'Cheddar', cantidad: 1, precio_unitario: 20, opcion: null },
    ],
  },
  {
    cliente: 'Andrea Bermúdez',
    telefono: '+50585445566',
    tipo_entrega: 'retiro',
    direccion: 'Retiro en restaurante',
    metodo_pago: 'efectivo',
    productos: [
      { nombre: 'Quesadilla Pollo', cantidad: 1, precio_unitario: 160, opcion: null },
      { nombre: 'Hi-C Té Limón', cantidad: 1, precio_unitario: 30, opcion: null },
    ],
  },
  {
    cliente: 'Luis Fernando Pérez',
    telefono: '+50584556677',
    tipo_entrega: 'delivery',
    direccion: 'Bello Horizonte F-12, portón negro',
    metodo_pago: 'transferencia',
    comprobante_url: '/uploads/comprobante_demo.png',
    productos: [
      { nombre: 'Nivel 100', cantidad: 1, precio_unitario: 290, opcion: 'extra kétchup' },
      { nombre: 'Papas Premium', cantidad: 1, precio_unitario: 140, opcion: null },
      { nombre: 'Coca Cola 355ml', cantidad: 2, precio_unitario: 30, opcion: null },
    ],
  },
  {
    cliente: 'Mariana Centeno',
    telefono: '+50583667788',
    tipo_entrega: 'delivery',
    direccion: 'Villa Fontana Norte, casa 12A',
    metodo_pago: 'efectivo',
    productos: [
      { nombre: 'Nachos Cerdo', cantidad: 1, precio_unitario: 210, opcion: null },
      { nombre: 'Salsa aguacate', cantidad: 1, precio_unitario: 20, opcion: null },
    ],
  },
  {
    cliente: 'David Jarquín',
    telefono: '+50582778899',
    tipo_entrega: 'retiro',
    direccion: 'Retiro en restaurante',
    metodo_pago: 'efectivo',
    productos: [
      { nombre: 'Cheeseburguer', cantidad: 2, precio_unitario: 180, opcion: 'ambas bien cocidas' },
      { nombre: 'Papas De Calle', cantidad: 1, precio_unitario: 100, opcion: null },
    ],
  },
  {
    cliente: 'Valeria Duarte',
    telefono: '+50581889900',
    tipo_entrega: 'delivery',
    direccion: 'Reparto San Juan, Módulo 5, apto 2',
    metodo_pago: 'transferencia',
    comprobante_url: '/uploads/comprobante_demo.png',
    productos: [
      { nombre: 'Tacos Mixto', cantidad: 1, precio_unitario: 160, opcion: null },
      { nombre: 'Burrito Pollo', cantidad: 1, precio_unitario: 160, opcion: null },
    ],
  },
  {
    cliente: 'Gabriel Rivas',
    telefono: '+50580990011',
    tipo_entrega: 'delivery',
    direccion: 'Las Colinas, 1ra entrada 50vrs este',
    metodo_pago: 'efectivo',
    productos: [
      { nombre: 'Double Cheeseburguer', cantidad: 1, precio_unitario: 240, opcion: null },
      { nombre: 'Papas Nivel 100', cantidad: 1, precio_unitario: 220, opcion: null },
    ],
  },
  {
    cliente: 'Natalia Solís',
    telefono: '+50589001122',
    tipo_entrega: 'retiro',
    direccion: 'Retiro en restaurante',
    metodo_pago: 'transferencia', // Sin comprobante para verificar estado "Sin comprobante aún"
    productos: [
      { nombre: 'Nachos Birria', cantidad: 1, precio_unitario: 240, opcion: null },
      { nombre: 'Fresca 355ml', cantidad: 1, precio_unitario: 30, opcion: null },
    ],
  },
];

async function simularLotePedidos(cantidad = 10) {
  const lote = PEDIDOS_DEMO.slice(0, Math.min(cantidad, PEDIDOS_DEMO.length));
  const creados = [];

  for (let i = 0; i < lote.length; i++) {
    const item = lote[i];
    const uniqueSessionId = `demo_${Date.now()}_${i}_${Math.random().toString(36).substring(7)}`;
    const costoEnvio = item.tipo_entrega === 'delivery' ? 40 : 0;
    const subtotal = item.productos.reduce((sum, p) => sum + p.precio_unitario * p.cantidad, 0);
    const total = subtotal + costoEnvio;

    const saved = await saveOrder({
      cliente: item.cliente,
      telefono: item.telefono,
      jid: `${item.telefono.replace('+', '')}@s.whatsapp.net`,
      tipo_entrega: item.tipo_entrega,
      direccion: item.direccion,
      costo_envio: costoEnvio,
      total,
      metodo_pago: item.metodo_pago,
      productos: item.productos,
      sessionId: uniqueSessionId,
      restauranteId: 'urbano',
    });

    if (item.comprobante_url) {
      await query(
        `UPDATE pedidos SET comprobante_url = $1, estado = 'pendiente', updated_at = NOW() WHERE id = $2`,
        [item.comprobante_url, saved.id]
      );
      const updated = await getOrder(saved.id);
      orderEvents.emit('order:updated', { restauranteId: 'urbano', pedido: updated });
      creados.push(updated);
    } else {
      creados.push(saved);
    }

    // Pequeño delay de 100ms para timestamps diferenciados
    await new Promise((r) => setTimeout(r, 100));
  }

  console.log(`[simulacionService] ${creados.length} pedidos simulados creados exitosamente.`);
  return creados;
}

module.exports = {
  simularLotePedidos,
  PEDIDOS_DEMO,
};
