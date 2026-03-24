# Spec: Cambios de pedido tipados + opción en productos

**Fecha:** 2026-03-24
**Estado:** Aprobado por usuario

---

## Contexto

El sistema de cambios post-pedido usa `solicitar_cambio_pedido` con un único campo `descripcion_cambio` (texto libre). Esto tiene dos problemas:

1. Cuando el cliente agrega productos, el chef ve un texto pero el pedido en Firestore no se actualiza — el total queda incorrecto.
2. El campo `opcion` del producto ya existe en el schema de `guardar_pedido`, pero el prompt del bot no instruye al LLM a usarlo durante el pedido original.

---

## Alcance

Tres cambios independientes:

1. **Prompt — `opcion` en pedido original**: instrucción explícita para usar el campo `opcion` cuando el cliente pide modificaciones durante el flujo de pedido.
2. **Tool tipado**: `solicitar_cambio_pedido` recibe `tipo` y campos estructurados para `agregar_productos`.
3. **Aprobación inteligente**: cuando el chef aprueba un cambio `agregar_productos`, la app fusiona los productos nuevos y actualiza el total en Firestore.

---

## 1. Bot — `prompts/agent.txt`

### 1a. Uso de `opcion` durante el pedido original

Agregar en la Sección 6 (Cálculo de total), después de las reglas de costo de envío:

> **Modificaciones de producto:** Si el cliente pide una modificación sobre un producto (ej: "sin cebolla", "extra queso", "sin tomate", "término medio"), inclúyela en el campo `opcion` del producto correspondiente al invocar `guardar_pedido`. Ejemplo: `{ "nombre": "Hamburguesa Premium", "cantidad": 1, "precio_unitario": 200, "opcion": "sin cebolla" }`.

### 1b. Dos tipos de cambio post-pedido

Actualizar la Sección 5b (Solicitar un cambio) para distinguir los dos tipos:

**Tipo `modificacion`** — para cualquier cambio que NO agregue productos nuevos al pedido:
- Quitar un ingrediente del pedido ya enviado (ej: "que la hamburguesa no lleve pepino")
- Cambiar la dirección de entrega
- Cambiar el método de pago
- Cualquier nota o ajuste genérico

**Tipo `agregar_productos`** — cuando el cliente quiere añadir ítems nuevos al pedido ya enviado:
- El bot DEBE pedir al cliente que especifique exactamente qué quiere agregar y en qué cantidad antes de invocar el tool.
- Al invocar, el bot pasa únicamente: `tipo: "agregar_productos"`, `descripcion_cambio` con el resumen, y `productos_nuevos` (lista de productos con nombre, cantidad, precio_unitario y opción si aplica). El sistema calcula el nuevo total automáticamente.

Regla en el prompt (Sección 5b):

> Cuando el cliente quiera agregar productos nuevos a un pedido ya enviado, invoca `solicitar_cambio_pedido` con `tipo: "agregar_productos"` e incluye `productos_nuevos` (lista de productos con nombre, cantidad, precio_unitario). Para cualquier otro cambio (modificar ingrediente, cambiar dirección, etc.), usa `tipo: "modificacion"` y solo `descripcion_cambio`.

---

## 2. Backend

### `src/services/openaiService.js`

Actualizar `SOLICITAR_CAMBIO_TOOL`:

```js
const SOLICITAR_CAMBIO_TOOL = {
  type: 'function',
  function: {
    name: 'solicitar_cambio_pedido',
    description: 'Registra una solicitud de cambio sobre el pedido ya confirmado del cliente. Úsala SOLO cuando el cliente quiera modificar o agregar algo a un pedido que ya fue enviado al chef.',
    parameters: {
      type: 'object',
      properties: {
        tipo: {
          type: 'string',
          enum: ['modificacion', 'agregar_productos'],
          description: '"agregar_productos" cuando el cliente quiere añadir nuevos ítems al pedido. "modificacion" para cualquier otro cambio (ingredientes, dirección, etc.).',
        },
        descripcion_cambio: {
          type: 'string',
          description: 'Descripción clara del cambio solicitado (ej: "Agregar 1 Cheeseburger adicional", "Sin cebolla en la hamburguesa").',
        },
        productos_nuevos: {
          type: 'array',
          description: 'Solo para tipo "agregar_productos". Lista de productos a agregar.',
          items: {
            type: 'object',
            properties: {
              nombre: { type: 'string' },
              cantidad: { type: 'number' },
              precio_unitario: { type: 'number' },
              opcion: { type: 'string', description: 'Modificación opcional del producto.' },
            },
            required: ['nombre', 'cantidad', 'precio_unitario'],
          },
        },
      },
      required: ['tipo', 'descripcion_cambio'],
    },
  },
};
```

> `total_nuevo` no es un campo del tool — el backend lo calcula. El LLM no tiene manera de enviarlo.

### `src/orders/orderService.js`

Actualizar `solicitarCambioPedido` para:

1. Aceptar `tipo` y `productosNuevos` opcionales.
2. Si `tipo === 'agregar_productos'` y `productosNuevos` existe:
   - Calcular `totalNuevo = pedido.total + sum(productosNuevos.map(p => p.precio_unitario * p.cantidad))`.
   - Normalizar `opcion` con `?? null` en cada producto nuevo.
3. Guardar en `cambio_solicitado`:

```js
async function solicitarCambioPedido({ pedidoId, descripcionCambio, tipo = 'modificacion', productosNuevos = null }) {
  const ref = doc(db, 'pedidos', pedidoId);
  const snapshot = await getDoc(ref);
  if (!snapshot.exists()) throw new Error('Pedido no encontrado');

  let totalNuevo = null;
  let productosNormalizados = null;

  if (tipo === 'agregar_productos' && productosNuevos?.length > 0) {
    const pedidoActual = snapshot.data();
    const subtotalNuevos = productosNuevos.reduce(
      (sum, p) => sum + p.precio_unitario * p.cantidad, 0
    );
    totalNuevo = pedidoActual.total + subtotalNuevos;
    productosNormalizados = productosNuevos.map((p) => ({ ...p, opcion: p.opcion ?? null }));
  }

  await updateDoc(ref, {
    cambio_solicitado: {
      tipo,
      descripcion: descripcionCambio,
      productos_nuevos: productosNormalizados,
      total_nuevo: totalNuevo,
      estado: 'pendiente_chef',
      solicitadoAt: serverTimestamp(),
    },
  });

  return { pedidoId, descripcionCambio };
}
```

### `src/agent/agentService.js`

Actualizar el handler de `solicitar_cambio_pedido` para extraer y pasar los nuevos campos:

```js
const { descripcion_cambio, tipo, productos_nuevos } = JSON.parse(toolCall.function.arguments);
await solicitarCambioPedido({
  pedidoId,
  descripcionCambio: descripcion_cambio,
  tipo: tipo ?? 'modificacion',
  productosNuevos: productos_nuevos ?? null,
});
```

---

## 3. Chef App — TypeScript / React Native

### `app-chef/src/services/pedidosService.ts`

Actualizar la interfaz `CambioSolicitado`:

Agregar `precio_unitario?: number` a la interfaz `Producto` (campo ya presente en Firestore para todos los productos guardados por el backend, pero faltante en la interfaz TypeScript). Este campo es necesario para el merge sin error de compilación:

```ts
export interface Producto {
  nombre: string;
  cantidad: number;
  opcion?: string | null;
  precio_unitario?: number;
}
```

Actualizar `CambioSolicitado`:

```ts
export interface CambioSolicitado {
  descripcion: string;
  estado: 'pendiente_chef' | 'aprobado' | 'rechazado';
  solicitadoAt: any;
  respondidoAt?: any;
  tipo?: 'modificacion' | 'agregar_productos';
  productos_nuevos?: Producto[];
  total_nuevo?: number;
}
```

Actualizar `aprobarCambio` para que acepte el pedido completo y aplique el merge si corresponde:

```ts
export async function aprobarCambio(pedido: Pedido): Promise<void> {
  const cambio = pedido.cambio_solicitado!;
  const updateData: Record<string, any> = {
    'cambio_solicitado.estado': 'aprobado',
    'cambio_solicitado.respondidoAt': serverTimestamp(),
  };

  if (
    cambio.tipo === 'agregar_productos' &&
    cambio.productos_nuevos?.length &&
    cambio.total_nuevo != null
  ) {
    updateData.productos = [...pedido.productos, ...cambio.productos_nuevos];
    updateData.total = cambio.total_nuevo;
  }

  await updateDoc(doc(db, 'pedidos', pedido.id), updateData);
}
```

> El llamador en `[id].tsx` pasa el pedido completo en lugar del ID string.

### `app-chef/app/pedido/[id].tsx`

#### Cambio en llamada a `aprobarCambio`

```tsx
// Antes:
await aprobarCambio(pedido.id);
// Después:
await aprobarCambio(pedido);
```

#### UI del card de cambio solicitado

El card de cambio ya existente muestra `pedido.cambio_solicitado!.descripcion`. Agregar lógica condicional:

- Si `tipo === 'agregar_productos'` y `productos_nuevos` existe: mostrar lista de productos nuevos y el nuevo total, además de la descripción.
- Si `tipo === 'modificacion'` o `tipo` es `undefined` (pedidos legacy): mostrar solo la descripción (comportamiento actual).

Diseño del card para `agregar_productos`:

```
⚠ Cambio solicitado por el cliente
─────────────────────────────────
Agregar al pedido:
  • 3× Tacos de birria
  • 1× Refresco 500ml
─────────────────────────────────
Nuevo total: C$340
─────────────────────────────────
[Aprobar cambio]  [Rechazar]
```

Estilos nuevos sugeridos (consistentes con el sistema actual):
- `cambioProductosList` — `gap: 2, marginVertical: 4`
- `cambioProductoItem` — `color: '#B0B0B0', fontSize: 13`
- `cambioTotalNuevo` — `color: '#F0F0F0', fontWeight: '600', fontSize: 14, marginTop: 6`

---

## 4. Compatibilidad con pedidos existentes (legacy)

- `cambio_solicitado` sin campo `tipo`: UI muestra solo `descripcion` (comportamiento anterior).
- `aprobarCambio` verifica `cambio.tipo === 'agregar_productos'` antes de hacer merge — si no coincide, solo actualiza `estado`. Sin cambios para pedidos legacy.
- `rechazarCambio` en `pedidosService.ts` **no se modifica** — su firma sigue siendo `(id: string)` y sigue usando el helper privado `actualizarEstado`. Solo `aprobarCambio` cambia de firma.

## 4b. Cambios simultáneos

Solo puede haber un `cambio_solicitado` activo por pedido. Si el cliente envía un segundo cambio mientras el primero está `pendiente_chef`, el `updateDoc` lo sobreescribe silenciosamente. Este comportamiento es aceptable para el MVP — el chef solo ve el cambio más reciente.

---

## 5. Archivos modificados

| Archivo | Tipo de cambio |
|---------|---------------|
| `prompts/agent.txt` | Instrucción de `opcion` en pedido original + distinción `modificacion`/`agregar_productos` |
| `src/services/openaiService.js` | Actualizar `SOLICITAR_CAMBIO_TOOL` con `tipo` y `productos_nuevos` |
| `src/orders/orderService.js` | `solicitarCambioPedido` calcula `total_nuevo` y almacena estructura completa |
| `src/agent/agentService.js` | Extraer y pasar `tipo` y `productos_nuevos` al handler |
| `app-chef/src/services/pedidosService.ts` | Actualizar `CambioSolicitado` interface + firma de `aprobarCambio` |
| `app-chef/app/pedido/[id].tsx` | UI condicional en card de cambio + actualizar llamada a `aprobarCambio` |

---

## 6. Fuera de alcance

- No se implementa recálculo de `costo_envio` en cambios (si agrega delivery ya tiene el envío en el total original).
- No se soporta eliminar productos del pedido vía `agregar_productos` — eso es siempre `modificacion` (nota para el chef).
- El historial no muestra desglose de cambios aprobados (solo el total final actualizado).
- Los productos nuevos que se fusionan al aprobar un cambio `agregar_productos` incluirán `precio_unitario` en el array de Firestore. Esto es intencional — es consistente con los productos del pedido original que también tienen `precio_unitario` almacenado. No se muestra en la UI del chef.
