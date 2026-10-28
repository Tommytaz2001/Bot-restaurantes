const { validateOrder } = require('../src/orders/orderValidator');

describe('Order Normalization & Defensive Rules', () => {
  // Simulador de la lógica de normalización de saveOrder
  function normalizeOrderData(orderData) {
    const COSTO_ENVIO = 40;
    const cleanOrder = { ...orderData };

    // 1. tipo_entrega
    let tipoEntrega = String(cleanOrder.tipo_entrega || '').toLowerCase().trim();
    if (tipoEntrega.includes('deliv') || tipoEntrega.includes('domicil') || tipoEntrega.includes('envi') || tipoEntrega.includes('casa')) {
      tipoEntrega = 'delivery';
    } else if (tipoEntrega.includes('retir') || tipoEntrega.includes('llevar') || tipoEntrega.includes('recog') || tipoEntrega.includes('local')) {
      tipoEntrega = 'retiro';
    } else {
      tipoEntrega = (cleanOrder.direccion && !cleanOrder.direccion.toLowerCase().includes('retiro')) ? 'delivery' : 'retiro';
    }
    cleanOrder.tipo_entrega = tipoEntrega;

    // 2. direccion
    if (cleanOrder.tipo_entrega === 'retiro') {
      if (!cleanOrder.direccion || String(cleanOrder.direccion).trim() === '') {
        cleanOrder.direccion = 'Retiro en local';
      }
    }

    // 3. metodo_pago
    let metodoPago = String(cleanOrder.metodo_pago || '').toLowerCase().trim();
    if (metodoPago.includes('transf') || metodoPago.includes('banc') || metodoPago.includes('bac') || metodoPago.includes('depo')) {
      metodoPago = 'transferencia';
    } else {
      metodoPago = 'efectivo';
    }
    cleanOrder.metodo_pago = metodoPago;

    // 4. cliente
    if (!cleanOrder.cliente || String(cleanOrder.cliente).trim() === '') {
      cleanOrder.cliente = 'Cliente';
    }

    // 5. productos
    if (Array.isArray(cleanOrder.productos)) {
      cleanOrder.productos = cleanOrder.productos.map((p) => {
        const cantidad = Math.max(1, parseInt(p.cantidad || 1, 10) || 1);
        const precioUnitario = parseFloat(p.precio_unitario ?? p.precio ?? p.unit_price ?? 0);
        return {
          nombre: String(p.nombre || 'Producto').trim(),
          cantidad,
          precio_unitario: isNaN(precioUnitario) ? 0 : precioUnitario,
          opcion: p.opcion || null,
        };
      });
    }

    // 6. calculo de total
    const costoEnvio = cleanOrder.tipo_entrega === 'delivery' ? COSTO_ENVIO : 0;
    cleanOrder.costo_envio = costoEnvio;
    const subtotal = (cleanOrder.productos || []).reduce(
      (sum, p) => sum + (p.precio_unitario * p.cantidad),
      0
    );
    cleanOrder.total = subtotal + costoEnvio;

    return cleanOrder;
  }

  test('normaliza "domicilio" a "delivery" y calcula envío correctamente', () => {
    const raw = {
      cliente: 'Carlos',
      telefono: '88888888',
      tipo_entrega: 'domicilio',
      direccion: 'Barrio Central',
      productos: [{ nombre: 'Clásica', cantidad: '1', precio: '150' }],
      metodo_pago: 'contra entrega',
    };
    const normalized = normalizeOrderData(raw);
    expect(normalized.tipo_entrega).toBe('delivery');
    expect(normalized.costo_envio).toBe(40);
    expect(normalized.total).toBe(190);
    expect(normalized.metodo_pago).toBe('efectivo');
    expect(() => validateOrder(normalized)).not.toThrow();
  });

  test('normaliza "para llevar" a "retiro" y autocompleta "Retiro en local"', () => {
    const raw = {
      cliente: 'María',
      tipo_entrega: 'para llevar',
      productos: [{ nombre: 'Burrito', cantidad: 2, precio_unitario: 120 }],
      metodo_pago: 'efectivo',
    };
    const normalized = normalizeOrderData(raw);
    expect(normalized.tipo_entrega).toBe('retiro');
    expect(normalized.direccion).toBe('Retiro en local');
    expect(normalized.costo_envio).toBe(0);
    expect(normalized.total).toBe(240);
    expect(() => validateOrder(normalized)).not.toThrow();
  });

  test('normaliza "transferencia BAC" a "transferencia"', () => {
    const raw = {
      cliente: 'Pedro',
      telefono: '58544518',
      tipo_entrega: 'delivery',
      direccion: 'Frente al parque',
      productos: [{ nombre: 'Tacos', cantidad: 1, precio_unitario: 190 }],
      metodo_pago: 'transferencia BAC',
    };
    const normalized = normalizeOrderData(raw);
    expect(normalized.metodo_pago).toBe('transferencia');
    expect(normalized.total).toBe(230);
    expect(() => validateOrder(normalized)).not.toThrow();
  });

  test('asigna cliente por defecto "Cliente" si falta el nombre', () => {
    const raw = {
      tipo_entrega: 'retiro',
      productos: [{ nombre: 'Papas', cantidad: 1, precio_unitario: 80 }],
      metodo_pago: 'efectivo',
    };
    const normalized = normalizeOrderData(raw);
    expect(normalized.cliente).toBe('Cliente');
    expect(() => validateOrder(normalized)).not.toThrow();
  });
});
