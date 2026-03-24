# Spec: Costo de envío desglosado + Botón copiar para delivery

**Fecha:** 2026-03-24
**Estado:** Aprobado por usuario

---

## Contexto

El bot de WhatsApp actualmente no cobra costo de envío diferenciado. El chef necesita poder copiar rápidamente el resumen de un pedido de delivery para reenviárselo al repartidor.

---

## Alcance

Dos cambios independientes:

1. **Costo de envío (40 C$)** — se suma automáticamente a pedidos delivery y se guarda desglosado en Firestore.
2. **Botón "Copiar para delivery"** — aparece en la pantalla de detalle del pedido solo para pedidos delivery; copia un resumen formateado al portapapeles.

---

## 1. Bot — `prompts/agent.txt`

### Cambios en el flujo

**Paso 2 (delivery) — aviso de costo:**
Al solicitar los datos, agregar una línea informativa:
> "El envío tiene un costo adicional de **40 C$**."

**Paso 3 (resumen delivery) — formato desglosado:**
```
📋 *Resumen de tu pedido:*
• [Producto] x[cantidad] — [precio]
💰 *Subtotal:* [subtotal] C$
🛵 *Envío:* 40 C$
💰 *Total:* [total] C$
📍 *Entrega:* [dirección]
💳 *Pago:* [método]

¿Confirmamos? ✅
```

**Regla de cálculo (sección 6):**
Agregar explícitamente: "Para pedidos delivery, el total = subtotal de productos + 40 C$ de costo de envío. El campo `total` que pasas a `guardar_pedido` DEBE incluir los 40 C$ de envío. Para retiro, el costo de envío es 0 y no se menciona."

**Guardar pedido:**
El bot pasa `costo_envio: 40` para delivery y `costo_envio: 0` para retiro. El campo `total` que envía el bot siempre incluye el costo de envío (subtotal + 40 para delivery).

---

## 2. Backend

### `src/services/openaiService.js`

Agregar `costo_envio` como campo requerido en el tool `guardar_pedido`:
```js
costo_envio: {
  type: 'number',
  description: 'Costo de envío. 40 para delivery, 0 para retiro en local.'
},
total: {
  // descripción actualizada:
  description: 'Total del pedido incluyendo el costo de envío (subtotal + costo_envio).'
}
// Agregar costo_envio a required: [...]
```

### `src/orders/orderService.js`

Constante hardcodeada — el backend nunca confía en el valor del bot:
```js
const COSTO_ENVIO = 40;
```

Al construir el objeto del pedido en `saveOrder`, el backend sobreescribe tanto `costo_envio` como `total` para garantizar integridad:
```js
const costoEnvio = orderData.tipo_entrega === 'delivery' ? COSTO_ENVIO : 0;
const subtotal = orderData.productos.reduce(
  (sum, p) => sum + p.precio_unitario * p.cantidad, 0
);

// En el objeto del pedido:
costo_envio: costoEnvio,
total: subtotal + costoEnvio,  // backend sobreescribe el total también
```

> **Razón:** No confiar en el total calculado por el LLM. El backend es la fuente de verdad tanto para `costo_envio` como para `total`.

### `src/orders/orderValidator.js`

Promover `tipo_entrega` a campo **requerido** (actualmente es opcional). Un pedido sin `tipo_entrega` no puede determinar el costo de envío correcto:
```js
// Cambiar la validación de:
if (order.tipo_entrega && !['delivery', 'retiro'].includes(order.tipo_entrega))
// A:
if (!['delivery', 'retiro'].includes(order.tipo_entrega)) {
  throw new Error('tipo_entrega debe ser "delivery" o "retiro"');
}
```

---

## 3. Chef App — TypeScript / React Native

### Dependencias requeridas

`expo-clipboard` y `expo-haptics` **no están instaladas** en el proyecto. Instalar antes de implementar:
```bash
npx expo install expo-clipboard expo-haptics
```

### `app-chef/src/services/pedidosService.ts`

Agregar dos campos opcionales a la interfaz `Pedido`:
```ts
tipo_entrega?: 'delivery' | 'retiro';
costo_envio?: number;
```

> `tipo_entrega` es necesario para la visibilidad condicional del botón de copiar. Ambos campos son opcionales para mantener compatibilidad con pedidos existentes en Firestore que no los tengan.

> **Nota sobre campos ya existentes:** `moneda: string` y `total: number` ya son campos no-opcionales en la interfaz `Pedido` actual. Los `?? 'C$'` y `?? 0` en `copiarParaDelivery` son únicamente defensivos. No se requiere agregar estos campos.

> **Nota sobre `precio_unitario`:** Este campo existe en el schema del tool `guardar_pedido` (backend) y es usado exclusivamente por `orderService.js` para recalcular el `total`. No forma parte del interface `Producto` del frontend ni es necesario allí, porque la app obtiene el subtotal como `pedido.total - pedido.costo_envio`.

### `app-chef/app/pedido/[id].tsx`

#### 3a. Desglose en sección de productos

Cuando `pedido.costo_envio` existe y es mayor a 0, reemplazar el bloque de totales actual por un desglose:

```
Subtotal        C$200
🛵 Envío         C$40
──────────────────
Total           C$240
```

Cuando `costo_envio` es 0 o undefined (pedidos de retiro o pedidos legacy), mantener el diseño actual con solo la fila "Total".

Nuevos estilos sugeridos (consistentes con el sistema existente):
- `subtotalRow` — igual que `totalRow`
- `subtotalLabel` — igual que `totalLabel`
- `subtotalValor` — color `#6B6B6B`, fontSize 15
- `envioRow` — igual que `totalRow`
- `envioLabel` — igual que `totalLabel` con emoji `🛵`
- `envioValor` — color `#6B6B6B`, fontSize 15
- `desgloseDivider` — igual que `sectionDivider`

#### 3b. Botón "Copiar para delivery"

**Condición:** Solo visible cuando `pedido.tipo_entrega === 'delivery'`

**Ubicación:** Dentro de la sección CLIENTE (sección card), como fila adicional debajo de la InfoRow de dirección. Separado por un `sectionDivider`.

**Razón de ubicación:** El chef ya está mirando nombre + dirección. El botón está contextualmente agrupado con los datos del repartidor. Evita saturar el `actionBar` que ya tiene hasta 2 CTAs principales.

**Diseño del botón:**
- Estado normal: fondo transparente, borde `#2A2A2A`, texto `#888888`, icono `📋`
- Texto: `"Copiar para delivery"`
- Estado copiado: fondo `rgba(34,197,94,0.1)`, texto `#22C55E`
- Texto copiado: `"¡Copiado! ✓"`
- Duración estado copiado: 1500ms, luego vuelve al estado normal
- `minHeight: 48` (touch target ≥ 48dp Android)
- Haptic: `Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)` al copiar

**Implementación del estado:**
```ts
const [copiado, setCopiado] = useState(false);

const copiarParaDelivery = async () => {
  // El botón solo es visible para delivery, por lo que costo_envio siempre es > 0 aquí.
  // Se usa ?? 0 como protección defensiva para pedidos legacy sin costo_envio.
  const envio = pedido.costo_envio ?? 0;
  const subtotal = (pedido.total ?? 0) - envio;
  const moneda = pedido.moneda ?? 'C$';

  const lineas: (string | null)[] = [
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
```

> **Nota sobre el inner check eliminado:** La versión anterior tenía condicionales `pedido.costo_envio ? ... : null` dentro del texto copiado. Esto se elimina porque el botón ya está gateado por `tipo_entrega === 'delivery'`, y todos los pedidos delivery tienen `costo_envio > 0`. Las líneas de subtotal/envío siempre se muestran en el texto copiado.

---

## 4. Mobile Design Decisions

| Decisión | Razón |
|----------|-------|
| Botón en sección CLIENTE, no en actionBar | El actionBar ya tiene hasta 2 CTAs primarias. Agregar una 3ra crea crowding. El botón está contextualmente cerca de los datos que copia. |
| minHeight 48dp | Touch target mínimo Android. El chef puede tener manos ocupadas. |
| Feedback inline (texto cambia, no toast) | Evita dependencia de librería toast. Más ligero, mismo efecto. |
| Haptic `success` | Confirma la acción sin que el chef tenga que mirar la pantalla. |
| Visible en todos los estados del pedido | El chef puede necesitar copiar el resumen en cualquier momento del flujo, no solo al confirmar. |
| `costo_envio` y `total` sobreescritos en backend | Nunca confiar en valores calculados por el LLM. El backend es la fuente de verdad. |
| `tipo_entrega` promovido a requerido en validator | Un pedido sin `tipo_entrega` no puede determinar el costo correcto; debe fallar explícitamente. |

---

## 5. Archivos modificados

| Archivo | Tipo de cambio |
|---------|---------------|
| `prompts/agent.txt` | Aviso de envío en paso 2 + resumen desglosado + regla de cálculo con `total` incluyendo envío |
| `src/services/openaiService.js` | Agregar `costo_envio` al tool schema; actualizar descripción de `total` |
| `src/orders/orderService.js` | Constante `COSTO_ENVIO`; sobreescribir `costo_envio` y `total` en `saveOrder` |
| `src/orders/orderValidator.js` | Promover `tipo_entrega` a campo requerido |
| `app-chef/src/services/pedidosService.ts` | Agregar `tipo_entrega?` y `costo_envio?` a interface `Pedido` |
| `app-chef/app/pedido/[id].tsx` | Desglose subtotal/envío/total + botón copiar + instalar expo-clipboard y expo-haptics |

---

## 6. Compatibilidad con pedidos existentes (legacy)

Pedidos ya guardados en Firestore no tienen `costo_envio` ni `tipo_entrega`. El diseño es compatible:

- La UI de desglose solo aparece cuando `costo_envio > 0` → pedidos legacy muestran solo "Total" (comportamiento anterior).
- El botón copiar solo aparece cuando `tipo_entrega === 'delivery'` → en pedidos legacy `tipo_entrega` es `undefined`, por lo tanto el botón no aparece. Correcto.
- No se requiere script de migración.

---

## 7. Fuera de alcance

- La tarifa de envío NO es configurable por variable de entorno (MVP hardcodeado)
- No hay notificación automática al repartidor — el chef copia y pega manualmente
- El `PedidoCard` en la lista NO muestra el costo desglosado (solo el total)
- El historial NO necesita cambios de UI (ya muestra el total)
