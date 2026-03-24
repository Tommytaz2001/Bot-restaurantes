# Cambios de Pedido Tipados + Opción en Productos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add typed change requests (modificacion vs agregar_productos) so the chef app can merge new products and update the order total on approval, and instruct the bot to use the `opcion` field for product modifications.

**Architecture:** The backend (`solicitarCambioPedido`) gains `tipo` and `productosNuevos` params, computes `total_nuevo` server-side, and stores structured data in `cambio_solicitado`. The chef app's `aprobarCambio` merges new products and updates `total` when approving an `agregar_productos` change. The bot prompt gains two new rules: use `opcion` during original order, and use `tipo` when requesting post-order changes.

**Tech Stack:** Node.js + Firebase Firestore (backend), React Native + Expo (chef app), TypeScript, Jest (backend tests).

**Spec:** `docs/superpowers/specs/2026-03-24-cambios-pedido-tipados-design.md`

---

## File Map

| File | Change |
|------|--------|
| `tests/orderService.test.js` | Add 3 tests for `solicitarCambioPedido` |
| `src/orders/orderService.js` | Update `solicitarCambioPedido` signature + implementation |
| `src/services/openaiService.js` | Update `SOLICITAR_CAMBIO_TOOL` parameters |
| `src/agent/agentService.js` | Extract `tipo` + `productos_nuevos` in handler |
| `prompts/agent.txt` | Add `opcion` rule in §6, replace §5b with typed change rules |
| `app-chef/src/services/pedidosService.ts` | Add `precio_unitario?` to `Producto`, new fields to `CambioSolicitado`, rewrite `aprobarCambio` |
| `app-chef/app/pedido/[id].tsx` | Update `aprobarCambio` call + conditional UI in cambio card + new styles |

---

## Task 1: `solicitarCambioPedido` — backend with tests

**Files:**
- Modify: `tests/orderService.test.js`
- Modify: `src/orders/orderService.js`

The function currently only accepts `{ pedidoId, descripcionCambio }` and stores a flat text note. After this task it accepts `tipo` and `productosNuevos`, computes `total_nuevo` server-side, and stores a structured `cambio_solicitado` object.

- [ ] **Step 1: Add `solicitarCambioPedido` to the import line in the test file**

Open `tests/orderService.test.js` line 1. Change:
```js
const { saveOrder, getOrder } = require('../src/orders/orderService');
```
To:
```js
const { saveOrder, getOrder, solicitarCambioPedido } = require('../src/orders/orderService');
```

- [ ] **Step 2: Write 3 failing tests at the end of `tests/orderService.test.js`**

Append a new `describe` block after the existing `describe('orderService', ...)` closing brace:

```js
describe('solicitarCambioPedido', () => {
  async function crearPedidoTest(suffix) {
    const order = await saveOrder({
      restauranteId: 'urbano',
      sessionId: 'test-cambio-' + suffix + Date.now(),
      cliente: 'Test Cliente',
      telefono: '+50599999999',
      direccion: 'Test Address 123',
      productos: [{ nombre: 'Clásica', cantidad: 1, precio_unitario: 160, opcion: null }],
      total: 9999,
      moneda: 'C$',
      metodo_pago: 'efectivo',
      tipo_entrega: 'delivery',
    });
    return order.id;
  }

  test('tipo modificacion guarda estructura correcta', async () => {
    const pedidoId = await crearPedidoTest('mod-');
    await solicitarCambioPedido({
      pedidoId,
      descripcionCambio: 'Sin cebolla en la hamburguesa',
      tipo: 'modificacion',
    });
    const order = await getOrder(pedidoId);
    expect(order.cambio_solicitado.tipo).toBe('modificacion');
    expect(order.cambio_solicitado.descripcion).toBe('Sin cebolla en la hamburguesa');
    expect(order.cambio_solicitado.estado).toBe('pendiente_chef');
    expect(order.cambio_solicitado.productos_nuevos).toBeNull();
    expect(order.cambio_solicitado.total_nuevo).toBeNull();
  }, 15000);

  test('tipo agregar_productos calcula total_nuevo correctamente', async () => {
    const pedidoId = await crearPedidoTest('agr-');
    // Order has total=200 (160 producto + 40 envío delivery computed by backend)
    await solicitarCambioPedido({
      pedidoId,
      descripcionCambio: 'Agregar 2 Clásicas',
      tipo: 'agregar_productos',
      productosNuevos: [{ nombre: 'Clásica', cantidad: 2, precio_unitario: 160, opcion: null }],
    });
    const order = await getOrder(pedidoId);
    expect(order.cambio_solicitado.tipo).toBe('agregar_productos');
    expect(order.cambio_solicitado.total_nuevo).toBe(520); // 200 + (160 * 2)
    expect(order.cambio_solicitado.productos_nuevos).toHaveLength(1);
    expect(order.cambio_solicitado.productos_nuevos[0].nombre).toBe('Clásica');
    expect(order.cambio_solicitado.productos_nuevos[0].opcion).toBeNull();
  }, 15000);

  test('lanza error para pedido inexistente', async () => {
    await expect(
      solicitarCambioPedido({ pedidoId: 'no-existe-xyz', descripcionCambio: 'test', tipo: 'modificacion' })
    ).rejects.toThrow('Pedido no encontrado');
  }, 10000);
});
```

- [ ] **Step 3: Run tests to confirm they fail**

```bash
npm test -- --testPathPattern=orderService --verbose
```

Expected: 3 new tests FAIL (function signature doesn't accept `tipo` yet).

- [ ] **Step 4: Update `solicitarCambioPedido` in `src/orders/orderService.js`**

Replace the current function (lines 64–82):

```js
// OLD (includes the JSDoc comment that precedes the function in the actual file):
/**
 * Registra una solicitud de cambio sobre un pedido activo.
 * El chef la ve en la app y aprueba o rechaza.
 */
async function solicitarCambioPedido({ pedidoId, descripcionCambio }) {
  const ref = doc(db, 'pedidos', pedidoId);
  const snapshot = await getDoc(ref);
  if (!snapshot.exists()) throw new Error('Pedido no encontrado');

  await updateDoc(ref, {
    cambio_solicitado: {
      descripcion: descripcionCambio,
      estado: 'pendiente_chef',   // el chef lo actualizará a 'aprobado' o 'rechazado'
      solicitadoAt: serverTimestamp(),
    },
  });

  return { pedidoId, descripcionCambio };
}
```

With:

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
      (sum, p) => sum + p.precio_unitario * p.cantidad,
      0,
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

- [ ] **Step 5: Run tests to confirm all pass**

```bash
npm test -- --testPathPattern=orderService --verbose
```

Expected: All 9 tests PASS (6 existing + 3 new).

- [ ] **Step 6: Commit**

```bash
git add tests/orderService.test.js src/orders/orderService.js
git commit -m "feat: typed solicitarCambioPedido with total_nuevo calculation"
```

---

## Task 2: `SOLICITAR_CAMBIO_TOOL` — openaiService

**Files:**
- Modify: `src/services/openaiService.js`

The tool schema must expose `tipo` (required) and `productos_nuevos` (optional array). `total_nuevo` is intentionally absent — the backend computes it.

- [ ] **Step 1: Replace `SOLICITAR_CAMBIO_TOOL` in `src/services/openaiService.js`**

Replace lines 46–62:

```js
// OLD:
const SOLICITAR_CAMBIO_TOOL = {
  type: 'function',
  function: {
    name: 'solicitar_cambio_pedido',
    description: 'Registra una solicitud de cambio sobre el pedido ya confirmado del cliente. Úsala SOLO cuando el cliente quiera modificar o agregar algo a un pedido que ya fue enviado al chef.',
    parameters: {
      type: 'object',
      properties: {
        descripcion_cambio: {
          type: 'string',
          description: 'Descripción clara del cambio solicitado por el cliente (ej: "Agregar 1 Cheeseburger adicional", "Cambiar dirección a Colonia Los Robles")',
        },
      },
      required: ['descripcion_cambio'],
    },
  },
};
```

With:

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

- [ ] **Step 2: Run tests to confirm no regressions**

```bash
npm test -- --verbose
```

Expected: All existing tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/services/openaiService.js
git commit -m "feat: add tipo and productos_nuevos to solicitar_cambio_pedido tool"
```

---

## Task 3: `agentService.js` — handler update

**Files:**
- Modify: `src/agent/agentService.js`

The handler currently only extracts `descripcion_cambio`. It must also extract `tipo` and `productos_nuevos` and pass them to `solicitarCambioPedido`.

- [ ] **Step 1: Update the handler in `src/agent/agentService.js`**

Find the `solicitar_cambio_pedido` handler block (around lines 87–89). Replace:

```js
          const { descripcion_cambio } = JSON.parse(toolCall.function.arguments);
          await solicitarCambioPedido({ pedidoId, descripcionCambio: descripcion_cambio });
```

With:

```js
          const { descripcion_cambio, tipo, productos_nuevos } = JSON.parse(toolCall.function.arguments);
          await solicitarCambioPedido({
            pedidoId,
            descripcionCambio: descripcion_cambio,
            tipo: tipo ?? 'modificacion',
            productosNuevos: productos_nuevos ?? null,
          });
```

- [ ] **Step 2: Run tests**

```bash
npm test -- --verbose
```

Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/agent/agentService.js
git commit -m "feat: pass tipo and productosNuevos from agent handler to orderService"
```

---

## Task 4: `prompts/agent.txt` — bot prompt changes

**Files:**
- Modify: `prompts/agent.txt`

Two changes: (a) add `opcion` rule in §6, (b) replace §5b with two-type change rules.

- [ ] **Step 1: Add `opcion` instruction at the end of Section 6**

In `prompts/agent.txt`, find:

```
Para pedidos **retiro**: el costo de envío es 0. No lo menciones. El campo `costo_envio` que pasas DEBE ser `0`.
```

Replace with:

```
Para pedidos **retiro**: el costo de envío es 0. No lo menciones. El campo `costo_envio` que pasas DEBE ser `0`.

**Modificaciones de producto:** Si el cliente pide una modificación sobre un producto (ej: "sin cebolla", "extra queso", "sin tomate", "término medio"), inclúyela en el campo `opcion` del producto correspondiente al invocar `guardar_pedido`. Ejemplo: `{ "nombre": "Hamburguesa Premium", "cantidad": 1, "precio_unitario": 200, "opcion": "sin cebolla" }`.
```

- [ ] **Step 2: Replace Section 5b with two-type change handling**

Find the entire §5b block:

```
**b) Solicitar un cambio:**
SOLO aplica cuando el cliente diga EXPLÍCITAMENTE que quiere modificar o agregar algo al pedido YA ENVIADO (ej: "me olvidé agregar papas", "quiero cambiar la dirección", "¿pueden agregar una bebida?").

**Regla crítica de cambios — DOS PASOS:**
1. Cuando el cliente pida un cambio, PRIMERO pregunta qué exactamente quiere agregar o cambiar. Espera que te dé el detalle completo. Ejemplo: si dice "quiero agregar algo", responde "¿Qué quieres agregar? Dime el producto y cantidad."
2. SOLO cuando el cliente ya te haya dado el detalle específico del cambio (producto, cantidad, nueva dirección, etc.), invoca solicitar_cambio_pedido con esa descripción.
3. NUNCA invoques solicitar_cambio_pedido con una descripción vaga o incompleta.

Después de invocar: "📨 Tu solicitud de cambio fue enviada al chef. Si el pedido aún no está preparado, lo podrán ajustar. Te notificaremos la respuesta."
No prometas que el cambio será aceptado — el chef decide.

⚠️ NO uses solicitar_cambio_pedido si el cliente está respondiendo una pregunta tuya sobre productos (ej: el bot preguntó "¿qué quesadilla prefieres?" y el cliente responde "la de pollo" → eso es selección de producto, no cambio).
```

Replace with:

```
**b) Solicitar un cambio:**
SOLO aplica cuando el cliente diga EXPLÍCITAMENTE que quiere modificar o agregar algo al pedido YA ENVIADO (ej: "me olvidé agregar papas", "quiero cambiar la dirección", "¿pueden agregar una bebida?").

Hay dos tipos de cambio:

**Tipo `modificacion`** — para cualquier cambio que NO agregue productos nuevos:
- Quitar o modificar ingredientes ("sin cebolla en la hamburguesa del pedido")
- Cambiar dirección de entrega o método de pago
- Cualquier nota o ajuste genérico
→ Invoca con `tipo: "modificacion"` y `descripcion_cambio` describiendo el cambio exacto.

**Tipo `agregar_productos`** — cuando el cliente quiere añadir ítems nuevos al pedido:
1. PRIMERO pregunta qué quiere agregar y en qué cantidad.
2. SOLO cuando el cliente dé el detalle completo (producto y cantidad), invoca con `tipo: "agregar_productos"`, `descripcion_cambio` con el resumen, y `productos_nuevos` (nombre, cantidad, precio_unitario de cada ítem). El sistema calcula el nuevo total automáticamente.

**Regla general:** NUNCA invoques solicitar_cambio_pedido con una descripción vaga o sin saber exactamente qué cambio se pide.

Después de invocar: "📨 Tu solicitud de cambio fue enviada al chef. Si el pedido aún no está preparado, lo podrán ajustar. Te notificaremos la respuesta."
No prometas que el cambio será aceptado — el chef decide.

⚠️ NO uses solicitar_cambio_pedido si el cliente está respondiendo una pregunta tuya sobre productos (ej: el bot preguntó "¿qué quesadilla prefieres?" y el cliente responde "la de pollo" → eso es selección de producto, no cambio).
```

- [ ] **Step 3: Run tests**

```bash
npm test -- --verbose
```

Expected: All tests pass (prompt changes don't affect Jest).

- [ ] **Step 4: Commit**

```bash
git add prompts/agent.txt
git commit -m "feat: add opcion rule and typed change instructions to bot prompt"
```

---

## Task 5: `pedidosService.ts` — interfaces + `aprobarCambio`

**Files:**
- Modify: `app-chef/src/services/pedidosService.ts`

Three changes: add `precio_unitario?` to `Producto`, add new fields to `CambioSolicitado`, rewrite `aprobarCambio` to merge products when approving `agregar_productos`.

- [ ] **Step 1: Add `precio_unitario?: number` to the `Producto` interface**

Find (lines 31–35):

```ts
export interface Producto {
  nombre: string;
  cantidad: number;
  opcion?: string | null;
}
```

Replace with:

```ts
export interface Producto {
  nombre: string;
  cantidad: number;
  opcion?: string | null;
  precio_unitario?: number;
}
```

- [ ] **Step 2: Add new fields to `CambioSolicitado` interface**

Find (lines 37–42):

```ts
export interface CambioSolicitado {
  descripcion: string;
  estado: 'pendiente_chef' | 'aprobado' | 'rechazado';
  solicitadoAt: any;
  respondidoAt?: any;
}
```

Replace with:

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

- [ ] **Step 3: Rewrite `aprobarCambio` to accept `Pedido` and merge if needed**

Find (lines 150–154):

```ts
export const aprobarCambio = (id: string) =>
  actualizarEstado(id, {
    'cambio_solicitado.estado': 'aprobado',
    'cambio_solicitado.respondidoAt': serverTimestamp(),
  });
```

Replace with:

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

> Note: `rechazarCambio` keeps its `(id: string)` signature unchanged — it does not need to merge products.

> ⚠️ **Intermediate state:** After this Task 5 commit, `aprobarCambio` has the new `(pedido: Pedido)` signature but `[id].tsx` still calls `aprobarCambio(pedido.id)`. The TypeScript compile check in Step 4 will pass because it runs before Task 6 touches `[id].tsx`. The repo is in a TypeScript-broken state between Task 5 and Task 6 — proceed to Task 6 immediately without merging in between.

- [ ] **Step 4: TypeScript compile check**

```bash
cd app-chef && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add app-chef/src/services/pedidosService.ts
git commit -m "feat: typed CambioSolicitado interface and smart aprobarCambio merge"
```

---

## Task 6: `[id].tsx` — UI update

**Files:**
- Modify: `app-chef/app/pedido/[id].tsx`

Two changes: update `aprobarCambio` call (pass `pedido` not `pedido.id`), and replace the static `<Text>` in the cambio card with conditional rendering that shows product list + new total for `agregar_productos`.

- [ ] **Step 1: Update the `aprobarCambio` call**

Find (line 236):

```tsx
                  await aprobarCambio(pedido.id);
```

Replace with:

```tsx
                  await aprobarCambio(pedido);
```

- [ ] **Step 2: Replace the static cambio description with conditional rendering**

Find (line 230):

```tsx
            <Text style={styles.cambioDesc}>{pedido.cambio_solicitado!.descripcion}</Text>
```

Replace with:

```tsx
            {pedido.cambio_solicitado!.tipo === 'agregar_productos' && pedido.cambio_solicitado!.productos_nuevos?.length ? (
              <>
                <Text style={styles.cambioDesc}>Agregar al pedido:</Text>
                <View style={styles.cambioProductosList}>
                  {pedido.cambio_solicitado!.productos_nuevos.map((p, i) => (
                    <Text key={i} style={styles.cambioProductoItem}>
                      • {p.cantidad}× {p.nombre}{p.opcion ? ` (${p.opcion})` : ''}
                    </Text>
                  ))}
                </View>
                {pedido.cambio_solicitado!.total_nuevo != null && (
                  <Text style={styles.cambioTotalNuevo}>
                    Nuevo total: {pedido.moneda ?? 'C$'}{pedido.cambio_solicitado!.total_nuevo}
                  </Text>
                )}
              </>
            ) : (
              <Text style={styles.cambioDesc}>{pedido.cambio_solicitado!.descripcion}</Text>
            )}
```

- [ ] **Step 3: Add new styles to `StyleSheet.create`**

Find (lines 506–510):

```ts
  cambioDesc: {
    color: '#C09060',
    fontSize: 14,
    lineHeight: 20,
  },
```

Replace with:

```ts
  cambioDesc: {
    color: '#C09060',
    fontSize: 14,
    lineHeight: 20,
  },
  cambioProductosList: {
    gap: 2,
    marginVertical: 4,
  },
  cambioProductoItem: {
    color: '#B0B0B0',
    fontSize: 13,
  },
  cambioTotalNuevo: {
    color: '#F0F0F0',
    fontWeight: '600',
    fontSize: 14,
    marginTop: 6,
  },
```

- [ ] **Step 4: TypeScript compile check**

```bash
cd app-chef && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add app-chef/app/pedido/\[id\].tsx
git commit -m "feat: conditional cambio card UI for agregar_productos type"
```
