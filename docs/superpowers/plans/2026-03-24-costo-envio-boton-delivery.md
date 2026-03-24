# Costo de Envío + Botón Copiar Delivery — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a 40 C$ delivery fee (stored desglosed in Firestore) and a "Copiar para delivery" button in the chef app detail screen.

**Architecture:** The backend is the source of truth — it overwrites both `costo_envio` and `total` regardless of what the bot sends. The prompt teaches the bot to show the fee to the client and pass `costo_envio` in the tool call. The chef app reads the new optional fields and conditionally renders the breakdown and the copy button.

**Tech Stack:** Node.js/Express backend, Jest tests, React Native + Expo (TypeScript), expo-clipboard, expo-haptics, Firebase Firestore.

**Spec:** `docs/superpowers/specs/2026-03-24-costo-envio-boton-delivery-design.md`

---

## File Map

| File | Change |
|------|--------|
| `src/orders/orderValidator.js` | Promote `tipo_entrega` to required field |
| `tests/orderValidator.test.js` | Update fixture + add new tipo_entrega tests |
| `src/services/openaiService.js` | Add `costo_envio` to `guardar_pedido` tool schema |
| `src/orders/orderService.js` | Add `COSTO_ENVIO` constant; overwrite `costo_envio` + `total` |
| `tests/orderService.test.js` | Update fixture + add costo_envio/total assertions |
| `prompts/agent.txt` | Delivery fee notice, desglosed summary, calculation rule |
| `app-chef/src/services/pedidosService.ts` | Add `tipo_entrega?` and `costo_envio?` to `Pedido` interface |
| `app-chef/app/pedido/[id].tsx` | Desglose block + copy button + new styles |

---

## Task 1: Promote `tipo_entrega` to required in orderValidator

**Files:**
- Modify: `src/orders/orderValidator.js:25`
- Modify: `tests/orderValidator.test.js`

- [ ] **Step 1: Write the failing test**

Add to `tests/orderValidator.test.js` — the new test documents the new behavior before the code changes:

```js
// Add to the describe block in tests/orderValidator.test.js

test('lanza error si falta tipo_entrega', () => {
  const order = { ...validOrder, tipo_entrega: undefined };
  expect(() => validateOrder(order)).toThrow('tipo_entrega');
});

test('lanza error si tipo_entrega es inválido', () => {
  const order = { ...validOrder, tipo_entrega: 'express' };
  expect(() => validateOrder(order)).toThrow('tipo_entrega');
});

test('acepta tipo_entrega delivery', () => {
  const order = { ...validOrder, tipo_entrega: 'delivery' };
  expect(() => validateOrder(order)).not.toThrow();
});

test('acepta tipo_entrega retiro', () => {
  const order = { ...validOrder, tipo_entrega: 'retiro' };
  expect(() => validateOrder(order)).not.toThrow();
});
```

- [ ] **Step 2: Run tests to verify expected failures**

```bash
npm test -- --testPathPattern=orderValidator
```

Expected: only `'lanza error si falta tipo_entrega'` fails (current validator uses `if (order.tipo_entrega && ...)`, so `undefined` is falsy and no error is thrown). The other three new tests pass immediately under the current validator. The test `'lanza error si tipo_entrega es inválido'` passes because `'express'` is truthy and not in the array, so the current validator already throws. The happy-path tests also pass because valid values were already accepted.

- [ ] **Step 3: Update the valid fixture first — keep existing tests green**

In `tests/orderValidator.test.js`, add `tipo_entrega: 'delivery'` to `validOrder` **before** touching the validator, so existing tests stay green throughout:

```js
const validOrder = {
  cliente: 'Juan Pérez',
  telefono: '+50512345678',
  direccion: 'Barrio Linda Vista, casa 5',
  productos: [{ nombre: 'Clásica', cantidad: 1, precio_unitario: 160 }],
  total: 160,
  metodo_pago: 'efectivo',
  tipo_entrega: 'delivery',   // ← add this line
};
```

Also in `tests/orderService.test.js`, add `tipo_entrega: 'delivery'` to `baseOrder` in the same edit (the validator change in Step 4 will immediately break `orderService` tests if this is deferred):

```js
const baseOrder = {
  restauranteId: 'urbano',
  sessionId: 'test-session-' + Date.now(),
  cliente: 'Test Cliente',
  telefono: '+50599999999',
  direccion: 'Test Address 123',
  productos: [{ nombre: 'Clásica', cantidad: 1, precio_unitario: 160, opcion: null }],
  total: 160,
  moneda: 'C$',
  metodo_pago: 'efectivo',
  tipo_entrega: 'delivery',   // ← add this line
};
```

- [ ] **Step 4: Update the validator**

In `src/orders/orderValidator.js`, change line 25 from:

```js
  if (order.tipo_entrega && !['delivery', 'retiro'].includes(order.tipo_entrega)) {
    throw new Error('tipo_entrega debe ser "delivery" o "retiro"');
  }
```

To:

```js
  if (!['delivery', 'retiro'].includes(order.tipo_entrega)) {
    throw new Error('tipo_entrega debe ser "delivery" o "retiro"');
  }
```

- [ ] **Step 5: Run all tests to verify all pass**

```bash
npm test
```

Expected: all existing tests pass (fixtures now include `tipo_entrega`); new tests for `tipo_entrega` also pass.

- [ ] **Step 6: Commit**

```bash
git add src/orders/orderValidator.js tests/orderValidator.test.js tests/orderService.test.js
git commit -m "feat: promote tipo_entrega to required field in orderValidator"
```

---

## Task 2: Add `costo_envio` to the `guardar_pedido` tool schema

**Files:**
- Modify: `src/services/openaiService.js:31-34`

No new test needed — the tool schema is a data structure consumed by OpenAI; its correctness is validated by the bot behavior, not unit tests.

- [ ] **Step 1: Add `costo_envio` property and update `total` description**

In `src/services/openaiService.js`, find the existing `total` property (line 31):

```js
        total: { type: 'number', description: 'Total del pedido en la moneda del restaurante' },
```

Replace with:

```js
        costo_envio: {
          type: 'number',
          description: 'Costo de envío. 40 para delivery, 0 para retiro en local.',
        },
        total: {
          type: 'number',
          description: 'Total del pedido incluyendo el costo de envío (subtotal + costo_envio).',
        },
```

- [ ] **Step 2: Add `costo_envio` to the `required` array**

Change line 34 from:

```js
      required: ['cliente', 'telefono', 'tipo_entrega', 'direccion', 'productos', 'total', 'metodo_pago'],
```

To:

```js
      required: ['cliente', 'telefono', 'tipo_entrega', 'direccion', 'productos', 'costo_envio', 'total', 'metodo_pago'],
```

- [ ] **Step 3: Run lint**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/services/openaiService.js
git commit -m "feat: add costo_envio to guardar_pedido tool schema"
```

---

## Task 3: Compute and overwrite `costo_envio` + `total` in orderService

**Files:**
- Modify: `src/orders/orderService.js`
- Modify: `tests/orderService.test.js`

- [ ] **Step 1: Write failing tests**

Note: `tipo_entrega: 'delivery'` was already added to `baseOrder` in Task 1 Step 3. Only add the new tests here:


```js
test('pedido delivery tiene costo_envio=40 y total=subtotal+40', async () => {
  const order = await saveOrder({
    ...baseOrder,
    sessionId: 'test-delivery-fee-' + Date.now(),
    tipo_entrega: 'delivery',
    productos: [{ nombre: 'Clásica', cantidad: 1, precio_unitario: 160, opcion: null }],
    total: 9999, // backend must overwrite this
  });
  expect(order.costo_envio).toBe(40);
  expect(order.total).toBe(200); // 160 + 40
}, 10000);

test('pedido retiro tiene costo_envio=0 y total=solo subtotal', async () => {
  const order = await saveOrder({
    ...baseOrder,
    sessionId: 'test-retiro-fee-' + Date.now(),
    tipo_entrega: 'retiro',
    direccion: 'Retiro en local',
    productos: [{ nombre: 'Clásica', cantidad: 1, precio_unitario: 160, opcion: null }],
    total: 9999, // backend must overwrite this
  });
  expect(order.costo_envio).toBe(0);
  expect(order.total).toBe(160); // 160 + 0
}, 10000);
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- --testPathPattern=orderService
```

Expected: the two new costo_envio/total tests fail (fields not yet computed); existing tests pass (baseOrder already has tipo_entrega from Task 1).

- [ ] **Step 3: Add `COSTO_ENVIO` constant and overwrite logic in orderService**

**3a. Add the constant.** Find the last `require` line in `src/orders/orderService.js`:

```js
const { randomUUID } = require('crypto');
```

Replace with:

```js
const { randomUUID } = require('crypto');

const COSTO_ENVIO = 40;
```

**3b. Add the computation after validation.** Find the validate call followed by the id generation:

```js
  validateOrder(orderData);

  const id = randomUUID();
```

Replace with:

```js
  validateOrder(orderData);

  const costoEnvio = orderData.tipo_entrega === 'delivery' ? COSTO_ENVIO : 0;
  const subtotal = orderData.productos.reduce(
    (sum, p) => sum + p.precio_unitario * p.cantidad,
    0,
  );

  const id = randomUUID();
```

**3c. Update the `pedido` object to overwrite `costo_envio` and `total`.** In JavaScript object literals, later keys overwrite earlier ones with the same name, so placing them after `...orderData` is what makes the backend values win. Find the current `pedido` object:

```js
  const pedido = {
    ...orderData,
    estado: buildEstado(orderData.metodo_pago),
    comprobante_url: null,
    createdAt: serverTimestamp(),
    productos: orderData.productos.map((p) => ({
      ...p,
      opcion: p.opcion ?? null,
    })),
  };
```

Replace with:

```js
  const pedido = {
    ...orderData,
    estado: buildEstado(orderData.metodo_pago),
    comprobante_url: null,
    createdAt: serverTimestamp(),
    costo_envio: costoEnvio,         // overwrite — never trust LLM value
    total: subtotal + costoEnvio,    // overwrite — backend is source of truth
    productos: orderData.productos.map((p) => ({
      ...p,
      opcion: p.opcion ?? null,
    })),
  };
```

- [ ] **Step 4: Run all backend tests to verify everything passes**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/orders/orderService.js tests/orderService.test.js
git commit -m "feat: backend computes costo_envio and overwrites total in saveOrder"
```

---

## Task 4: Update the bot prompt (`prompts/agent.txt`)

**Files:**
- Modify: `prompts/agent.txt`

No tests for prompt files — changes are verified through manual bot testing.

- [ ] **Step 1: Add delivery fee notice in Paso 2**

Find the delivery data-collection block (lines 62-68):

```
**Si eligió DELIVERY** — solicita todo en un solo mensaje:
"¡Perfecto! Para tu pedido a domicilio necesito:
• Nombre completo
• Dirección de entrega
• Qué quieres y cuánto (ej: 2 clásicas, 1 premium BBQ)
• Pago: ¿transferencia o efectivo?"
```

Replace with:

```
**Si eligió DELIVERY** — solicita todo en un solo mensaje:
"¡Perfecto! Para tu pedido a domicilio necesito:
• Nombre completo
• Dirección de entrega
• Qué quieres y cuánto (ej: 2 clásicas, 1 premium BBQ)
• Pago: ¿transferencia o efectivo?

El envío tiene un costo adicional de *40 C$*."
```

- [ ] **Step 2: Update the delivery summary format in Paso 3**

Find the delivery resumen block (lines 83-90):

```
**Para DELIVERY:**
"📋 *Resumen de tu pedido:*
• [Producto] x[cantidad] — [precio]
💰 *Total:* [total] {{MONEDA}}
📍 *Entrega:* [dirección]
💳 *Pago:* [método]

¿Confirmamos? ✅"
```

Replace with:

```
**Para DELIVERY:**
"📋 *Resumen de tu pedido:*
• [Producto] x[cantidad] — [precio]
💰 *Subtotal:* [subtotal] {{MONEDA}}
🛵 *Envío:* 40 {{MONEDA}}
💰 *Total:* [total] {{MONEDA}}
📍 *Entrega:* [dirección]
💳 *Pago:* [método]

¿Confirmamos? ✅"
```

- [ ] **Step 3: Update Section 6 (Cálculo de total) with the delivery fee rule**

Find section 6 (lines 156-157):

```
### 6. Cálculo de total
Suma los precios de todos los productos. Incluye extras si los hay.
```

Replace with:

```
### 6. Cálculo de total
Suma los precios de todos los productos. Incluye extras si los hay.

Para pedidos **delivery**: total = subtotal de productos + 40 C$ de costo de envío. El campo `total` que pasas a `guardar_pedido` DEBE incluir los 40 C$. El campo `costo_envio` que pasas DEBE ser `40`.

Para pedidos **retiro**: el costo de envío es 0. No lo menciones. El campo `costo_envio` que pasas DEBE ser `0`.
```

- [ ] **Step 4: Commit**

```bash
git add prompts/agent.txt
git commit -m "feat: add delivery fee notice and desglosed summary to bot prompt"
```

---

## Task 5: Add `tipo_entrega` and `costo_envio` to the `Pedido` interface

**Files:**
- Modify: `app-chef/src/services/pedidosService.ts:44-58`

- [ ] **Step 1: Add the two optional fields to the Pedido interface**

In `app-chef/src/services/pedidosService.ts`, find the closing lines of the `Pedido` interface:

```ts
  cambio_solicitado?: CambioSolicitado;
}
```

Replace with:

```ts
  cambio_solicitado?: CambioSolicitado;
  tipo_entrega?: 'delivery' | 'retiro';
  costo_envio?: number;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd app-chef && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app-chef/src/services/pedidosService.ts
git commit -m "feat: add tipo_entrega and costo_envio to Pedido interface"
```

---

## Task 6: Install Expo dependencies

**Files:** `app-chef/package.json` (updated by expo install)

- [ ] **Step 1: Install expo-clipboard and expo-haptics**

```bash
cd app-chef && npx expo install expo-clipboard expo-haptics
```

Expected: packages added to package.json and package-lock.json without errors.

- [ ] **Step 2: Commit**

```bash
git add app-chef/package.json app-chef/package-lock.json
git commit -m "chore: install expo-clipboard and expo-haptics"
```

---

## Task 7: Add desglose breakdown and copy button to `[id].tsx`

**Files:**
- Modify: `app-chef/app/pedido/[id].tsx`

- [ ] **Step 1: Add imports for Clipboard and Haptics**

In `app-chef/app/pedido/[id].tsx`, find the last import line:

```ts
import { EstadoBadge } from '../../src/components/EstadoBadge';
```

Replace with:

```ts
import { EstadoBadge } from '../../src/components/EstadoBadge';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
```

- [ ] **Step 2: Add `copiado` state and `copiarParaDelivery` function**

Inside `DetallePedidoScreen`, after the `[accionando, setAccionando]` state declaration (line 60), add:

```ts
  const [copiado, setCopiado] = useState(false);

  const copiarParaDelivery = async () => {
    if (!pedido) return;
    const envio = pedido.costo_envio ?? 0;
    const subtotal = (pedido.total ?? 0) - envio;
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
```

- [ ] **Step 3: Add the copy button in the CLIENT section**

Find the CLIENT section JSX (around line 122-128):

```tsx
        {/* Client section */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>CLIENTE</Text>
          <Text style={styles.clienteName}>{pedido.cliente}</Text>
          <View style={styles.sectionDivider} />
          <InfoRow icon="◎" label="Teléfono" value={pedido.telefono} />
          <InfoRow icon="⊙" label="Dirección" value={pedido.direccion} />
        </View>
```

Replace with:

```tsx
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
```

- [ ] **Step 4: Add the desglose breakdown in the PRODUCTS section**

Find the total row block in the PRODUCTS section (lines 144-148):

```tsx
          <View style={styles.sectionDivider} />
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValor}>{pedido.moneda ?? 'C$'}{pedido.total}</Text>
          </View>
```

Replace with:

```tsx
          <View style={styles.sectionDivider} />
          {pedido.costo_envio != null && pedido.costo_envio > 0 ? (
            <>
              <View style={styles.subtotalRow}>
                <Text style={styles.subtotalLabel}>Subtotal</Text>
                <Text style={styles.subtotalValor}>
                  {pedido.moneda ?? 'C$'}{(pedido.total ?? 0) - pedido.costo_envio}
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
```

- [ ] **Step 5: Add the new styles**

Find the last style and closing of `StyleSheet.create` (lines 480-485):

```ts
  finalText: {
    color: '#444444',
    fontSize: 14,
    fontWeight: '600',
  },
});
```

Replace with:

```ts
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
```

- [ ] **Step 6: Verify TypeScript compiles**

```bash
cd app-chef && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add app-chef/app/pedido/[id].tsx
git commit -m "feat: add delivery breakdown and copy button to order detail screen"
```

---

## Final verification

- [ ] **Run all backend tests**

```bash
cd .. && npm test
```

Expected: all tests pass.

- [ ] **Run lint**

```bash
npm run lint
```

Expected: no errors.
