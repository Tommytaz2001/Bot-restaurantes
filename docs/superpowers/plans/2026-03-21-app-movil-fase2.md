# Plan — Fase 2: App Móvil del Chef (React Native / Expo)

**Fecha:** 2026-03-21
**Responsable:** Equipo Bot Urbano
**Dependencias:** Fase 1 completada (bot WhatsApp + Firebase Firestore operativos)

---

## 1. Contexto y objetivo

El bot de WhatsApp (Fase 1) ya toma pedidos, los guarda en Firebase Firestore y permite a los clientes consultar estado, solicitar cambios y cancelar. Sin embargo, **el chef no tiene ninguna interfaz** para ver y gestionar esos pedidos en tiempo real.

El objetivo de esta fase es construir una **app móvil nativa para el chef/restaurante** que:

- Muestre todos los pedidos entrantes en tiempo real.
- Permita al chef confirmar, rechazar y actualizar el estado de cada pedido.
- Notifique sobre nuevos pedidos y solicitudes de cambio.
- Permita aprobar o rechazar cambios solicitados por el cliente.

---

## 2. Stack tecnológico

| Capa | Tecnología | Justificación |
|---|---|---|
| Framework | **React Native + Expo SDK 51+** | Un solo código para iOS y Android; Expo simplifica build y distribución |
| Navegación | **Expo Router (file-based)** | Convención clara, soporte deep-linking |
| Base de datos | **Firebase Firestore (SDK v9 modular)** | Ya configurado en el backend; listeners en tiempo real |
| Autenticación | **Firebase Auth (email/password)** | Protege el acceso a la app del chef |
| Notificaciones | **Expo Notifications + FCM** | Alertas push cuando llega un pedido nuevo |
| Estado global | **Zustand** | Liviano, sin boilerplate |
| UI | **React Native Paper** | Material Design 3, componentes accesibles |
| Hosting builds | **EAS Build (Expo)** | Builds en la nube, distribución por QR o TestFlight/Play |

---

## 3. Estructura de Firestore usada

```
/pedidos/{pedidoId}
  cliente:           string
  telefono:          string
  direccion:         string
  productos:         [{ nombre, cantidad, opcion }]
  total:             number
  metodo_pago:       "transferencia" | "efectivo"
  estado:            "pendiente" | "pendiente_pago" | "confirmado" |
                     "en_camino" | "entregado" | "cancelado"
  comprobante_url:   string | null
  sessionId:         string
  restauranteId:     string
  moneda:            string
  createdAt:         Timestamp
  canceladoAt?:      Timestamp
  cambio_solicitado?: {
    descripcion:     string
    estado:          "pendiente_chef" | "aprobado" | "rechazado"
    solicitadoAt:    Timestamp
  }
```

---

## 4. Arquitectura de la app

```
/app
  (auth)/
    login.tsx              — pantalla de login del chef
  (tabs)/
    _layout.tsx            — tab navigator
    index.tsx              — Lista de pedidos activos (tiempo real)
    historial.tsx          — Pedidos entregados/cancelados
    configuracion.tsx      — Ajustes del restaurante
  pedido/
    [id].tsx               — Detalle de pedido + acciones
/components
  PedidoCard.tsx           — Tarjeta resumen de pedido
  BadgeCambio.tsx          — Indicador de cambio solicitado pendiente
  EstadoBadge.tsx          — Chip de color según estado
/hooks
  usePedidos.ts            — Firestore listener en tiempo real
  usePedido.ts             — Listener de un pedido individual
/store
  pedidosStore.ts          — Zustand: lista de pedidos activos
/services
  firebaseConfig.ts        — Inicialización Firebase
  pedidosService.ts        — update estado, aprobar/rechazar cambio
/constants
  estados.ts               — Colores y etiquetas por estado
```

---

## 5. Flujos principales

### 5.1 Autenticación

```
Chef abre app → pantalla Login → ingresa email + contraseña →
Firebase Auth valida → redirige a Tab "Pedidos"

Si no está autenticado y accede a ruta protegida → redirige a /login
```

> **Seguridad:** Las reglas de Firestore deben restringir escritura a usuarios autenticados del restaurante. Implementar en `firebase/firestore.rules`.

---

### 5.2 Lista de pedidos en tiempo real

- Listener Firestore: `where('estado', 'in', ['pendiente', 'pendiente_pago', 'confirmado', 'en_camino'])`
- Ordenado por `createdAt desc`
- Actualización instantánea sin recargar
- Indicador visual si tiene `cambio_solicitado.estado === 'pendiente_chef'`

**Estados mostrados en esta vista:**

| Estado | Color | Acción disponible |
|---|---|---|
| `pendiente` | Naranja | Confirmar / Rechazar |
| `pendiente_pago` | Amarillo | Confirmar pago + Confirmar pedido |
| `confirmado` | Azul | Marcar en camino |
| `en_camino` | Verde claro | Marcar entregado |

---

### 5.3 Detalle de pedido (`/pedido/[id]`)

Muestra:
- Datos del cliente (nombre, teléfono, dirección)
- Lista de productos con cantidad y opción
- Total + método de pago
- Estado actual
- Si existe `cambio_solicitado` con estado `pendiente_chef` → sección destacada con la descripción del cambio y botones **Aprobar** / **Rechazar**

**Acciones por estado:**

```
pendiente / pendiente_pago
  → [✅ Confirmar pedido]  [❌ Rechazar pedido]

confirmado
  → [🛵 Marcar en camino]

en_camino
  → [✅ Marcar como entregado]

cambio_solicitado.estado === 'pendiente_chef'
  → [✅ Aprobar cambio]  [❌ Rechazar cambio]
```

---

### 5.4 Actualización de estados en Firestore

```typescript
// pedidosService.ts

async function confirmarPedido(id: string) {
  await updateDoc(doc(db, 'pedidos', id), { estado: 'confirmado' });
}

async function marcarEnCamino(id: string) {
  await updateDoc(doc(db, 'pedidos', id), { estado: 'en_camino' });
}

async function marcarEntregado(id: string) {
  await updateDoc(doc(db, 'pedidos', id), { estado: 'entregado', entregadoAt: serverTimestamp() });
}

async function rechazarPedido(id: string, motivo?: string) {
  await updateDoc(doc(db, 'pedidos', id), { estado: 'cancelado', motivoRechazo: motivo ?? null });
}

async function aprobarCambio(id: string) {
  await updateDoc(doc(db, 'pedidos', id), {
    'cambio_solicitado.estado': 'aprobado',
    'cambio_solicitado.respondidoAt': serverTimestamp(),
  });
}

async function rechazarCambio(id: string) {
  await updateDoc(doc(db, 'pedidos', id), {
    'cambio_solicitado.estado': 'rechazado',
    'cambio_solicitado.respondidoAt': serverTimestamp(),
  });
}
```

> El bot de WhatsApp ya escucha estos cambios en Firestore para notificar al cliente (se implementará en Fase 3).

---

### 5.5 Notificaciones push

- Al llegar nuevo pedido (`estado: 'pendiente'`) → push al chef
- Al llegar `cambio_solicitado` nuevo → push al chef
- Implementar con **Expo Notifications** + token FCM guardado en Firestore al hacer login

```
/restaurantes/{restauranteId}/tokens/{tokenId}
  token: string (Expo push token)
  plataforma: "ios" | "android"
  creadoAt: Timestamp
```

El backend Node.js puede usar `expo-server-sdk` para enviar las notificaciones desde un trigger o desde el webhook de Baileys.

---

## 6. Reglas de seguridad Firestore

```javascript
// firebase/firestore.rules
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Pedidos: solo usuarios autenticados pueden leer/escribir
    match /pedidos/{pedidoId} {
      allow read, write: if request.auth != null;
    }

    // Menú: lectura pública, escritura solo autenticados
    match /restaurantes/{restauranteId}/menu/{categoriaId} {
      allow read: if true;
      allow write: if request.auth != null;
    }

    // Configuración del restaurante: solo autenticados
    match /restaurantes/{restauranteId} {
      allow read, write: if request.auth != null;
    }
  }
}
```

---

## 7. Pantallas y componentes

### Pantalla: Lista de pedidos (`index.tsx`)

```
┌─────────────────────────────────────┐
│  🍔 Pedidos activos            [3]  │
├─────────────────────────────────────┤
│ ● PENDIENTE          hace 2 min     │
│ Juan Pérez — C$450                  │
│ 2x Hamburguesa Clásica              │
│ Efectivo · Colonia Los Robles      │
│ [Confirmar]  [Rechazar]             │
├─────────────────────────────────────┤
│ ● CONFIRMADO         hace 10 min    │
│ María López — C$290                 │
│ 1x Nivel 100                        │
│ ⚠️ Cambio solicitado: "sin cebolla" │
│ [Ver detalle]                       │
├─────────────────────────────────────┤
│ ● EN CAMINO          hace 25 min    │
│ Carlos Ruiz — C$180                 │
│ 1x Cheeseburguer                    │
│ [Marcar entregado]                  │
└─────────────────────────────────────┘
```

### Pantalla: Detalle de pedido (`pedido/[id].tsx`)

```
┌─────────────────────────────────────┐
│ ← Pedido #a3f2...    [EN CAMINO]   │
├─────────────────────────────────────┤
│ Cliente: Carlos Ruiz                │
│ Tel: +505 8888 8888                 │
│ Dir: Semáforos de Rubenia 2c al sur │
├─────────────────────────────────────┤
│ Productos:                          │
│  · 1x Cheeseburguer — C$180         │
│  · 1x Papas medianas — C$60         │
│ ─────────────────────────────────── │
│ Total: C$240  |  Efectivo           │
├─────────────────────────────────────┤
│ ⚠️ CAMBIO SOLICITADO                │
│ "Me olvidé pedir sin ketchup"       │
│ [✅ Aprobar]       [❌ Rechazar]    │
├─────────────────────────────────────┤
│         [✅ Marcar como entregado]  │
└─────────────────────────────────────┘
```

---

## 8. MVP — mínimo para lanzar

- [ ] Login con Firebase Auth (email/contraseña)
- [ ] Lista de pedidos en tiempo real (listener Firestore)
- [ ] Confirmar / rechazar pedido
- [ ] Marcar en camino / entregado
- [ ] Ver detalle completo del pedido
- [ ] Aprobar / rechazar cambio solicitado
- [ ] Notificación push al llegar pedido nuevo

---

## 9. Iteraciones post-MVP

| Prioridad | Feature |
|---|---|
| Alta | Filtrar por estado en la lista |
| Alta | Historial con búsqueda y rango de fechas |
| Media | Sonido de alerta al llegar pedido |
| Media | Resumen diario (total ventas, pedidos completados) |
| Media | Soporte multi-restaurante (mismo chef, varias sucursales) |
| Baja | Modo oscuro |
| Baja | Estadísticas semanales / mensuales |
| Futura | El bot notifica al cliente cuando el chef actualiza estado |

---

## 10. Comandos de desarrollo

```bash
# Instalar Expo CLI
npm install -g eas-cli

# Crear proyecto
npx create-expo-app app-chef --template blank-typescript

# Instalar dependencias principales
npx expo install expo-router react-native-paper @react-native-firebase/app @react-native-firebase/firestore @react-native-firebase/auth expo-notifications zustand

# Correr en simulador
npx expo start

# Build de desarrollo (QR para dispositivo físico)
eas build --profile development --platform android
```

---

## 11. Criterios de aceptación (DoD)

- El chef puede ver un pedido nuevo en menos de 3 segundos desde que el bot lo guarda.
- Al confirmar, marcar en camino o marcar entregado → el campo `estado` en Firestore se actualiza correctamente.
- Al aprobar o rechazar un cambio → `cambio_solicitado.estado` se actualiza a `aprobado` o `rechazado`.
- El pedido desaparece de la lista activa al marcarse como `entregado` o `cancelado`.
- La app no permite acceso sin autenticación válida.
- Los builds funcionan en Android (mínimo). iOS es bonus.
