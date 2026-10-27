function validateOrder(order) {
  const required = ['cliente', 'tipo_entrega', 'direccion', 'productos', 'total', 'metodo_pago'];
  for (const field of required) {
    if (!order[field] && order[field] !== 0) {
      throw new Error(`Campo requerido faltante: ${field}`);
    }
  }

  // Teléfono requerido solo para delivery
  if (order.tipo_entrega === 'delivery') {
    if (!order.telefono) {
      throw new Error('Campo requerido faltante: telefono (requerido para delivery)');
    }
    const digits = String(order.telefono).replace(/\D/g, '');
    if (digits.length < 7 || digits.length > 15) {
      throw new Error('telefono inválido: formato o longitud incorrecta');
    }
  }

  if (!Array.isArray(order.productos) || order.productos.length === 0) {
    throw new Error('productos debe ser un array no vacío');
  }

  for (const producto of order.productos) {
    if (!producto.nombre) throw new Error('Cada producto requiere nombre');
    if (!producto.cantidad || producto.cantidad < 1) throw new Error('Cada producto requiere cantidad >= 1');
    if (producto.precio_unitario === undefined || producto.precio_unitario === null) {
      throw new Error('Cada producto requiere precio_unitario');
    }
  }

  if (!['transferencia', 'efectivo'].includes(order.metodo_pago)) {
    throw new Error('metodo_pago debe ser "transferencia" o "efectivo"');
  }

  if (!['delivery', 'retiro'].includes(order.tipo_entrega)) {
    throw new Error('tipo_entrega debe ser "delivery" o "retiro"');
  }

  if (!order.total || order.total <= 0) {
    throw new Error('total debe ser mayor a 0');
  }
}

module.exports = { validateOrder };
