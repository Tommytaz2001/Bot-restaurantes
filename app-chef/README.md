# Urbano Chef — App Móvil

App para que el chef gestione pedidos en tiempo real desde su celular.

## Requisitos previos

- Node.js 20+
- Cuenta en [expo.dev](https://expo.dev) (gratis)
- Android Studio instalado (solo para build local) — opcional
- EAS CLI instalado globalmente

```bash
npm install -g eas-cli
```

---

## Configuración inicial

### 1. Variables de entorno

Copia el archivo de ejemplo y completa los valores:

```bash
cp .env.example .env
```

Todos los valores se obtienen desde **Firebase Console → ⚙️ Configuración del proyecto → Tu app web**:

```env
EXPO_PUBLIC_FIREBASE_API_KEY=AIza...
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=tu-proyecto.firebaseapp.com
EXPO_PUBLIC_FIREBASE_PROJECT_ID=tu-proyecto
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=tu-proyecto.appspot.com
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789
EXPO_PUBLIC_FIREBASE_APP_ID=1:123456789:web:abc123
EXPO_PUBLIC_RESTAURANTE_ID=urbano
```

### 2. Instalar dependencias

```bash
cd app-chef
npm install
```

### 3. Crear usuario chef en Firebase

En **Firebase Console → Authentication → Users → Add user**:
- Email: `chef@urbano.com` (o el que prefieras)
- Contraseña: la que decidas

Ese email y contraseña son los que usará el chef para entrar a la app.

---

## Correr en desarrollo

### Opción A — Expo Go (más rápido, sin instalar nada)

```bash
npm start
```

Escanea el QR con la app **Expo Go** desde tu celular Android.
> ⚠️ Expo Go tiene limitaciones con algunos módulos nativos. Para producción usa EAS Build.

### Opción B — Emulador Android (requiere Android Studio)

```bash
npm run android
```

---

## Generar APK

Hay dos formas: en la nube con EAS (recomendado) o local con Android Studio.

---

### Opción 1 — EAS Build en la nube (recomendado)

No requiere Android Studio. Expo compila en sus servidores y te da un link de descarga.

#### Paso 1 — Login en Expo

```bash
eas login
```

#### Paso 2 — Configurar EAS en el proyecto (solo la primera vez)

```bash
eas build:configure
```

Esto crea el archivo `eas.json`. Acepta los valores por defecto.

#### Paso 3 — Build APK para pruebas internas

```bash
eas build --platform android --profile preview
```

- Tarda entre 5 y 15 minutos
- Al terminar te da un link para descargar el `.apk`
- Instálalo en el celular directamente (habilita "Fuentes desconocidas" en Android)

#### Paso 4 — Build APK para producción (Play Store)

```bash
eas build --platform android --profile production
```

Genera un `.aab` listo para subir a Google Play.

---

### Opción 2 — Build local (requiere Android Studio)

```bash
# Generar carpeta android/
npx expo prebuild --platform android

# Abrir en Android Studio y compilar desde ahí
# O desde terminal:
cd android && ./gradlew assembleRelease
```

El APK queda en `android/app/build/outputs/apk/release/app-release.apk`.

---

## Configurar eas.json (perfiles de build)

Si EAS Build genera el archivo `eas.json`, asegúrate de que tenga este perfil `preview` para APK de prueba:

```json
{
  "build": {
    "preview": {
      "android": {
        "buildType": "apk"
      }
    },
    "production": {
      "android": {
        "buildType": "app-bundle"
      }
    }
  }
}
```

---

## Estructura del proyecto

```
app-chef/
  app/
    _layout.tsx              ← Auth guard + navegación raíz
    (auth)/login.tsx         ← Pantalla de login del chef
    (tabs)/
      index.tsx              ← Lista de pedidos activos (tiempo real)
      historial.tsx          ← Pedidos entregados y cancelados
    pedido/[id].tsx          ← Detalle de pedido + acciones
  src/
    services/
      firebaseConfig.ts      ← Inicialización Firebase
      pedidosService.ts      ← Listeners Firestore + funciones de update
    store/
      authStore.ts           ← Estado de autenticación (Zustand)
      pedidosStore.ts        ← Lista de pedidos (Zustand)
    hooks/
      usePedidos.ts          ← Subscripción en tiempo real
    components/
      PedidoCard.tsx         ← Tarjeta de pedido en la lista
      EstadoBadge.tsx        ← Chip de color según estado
    constants/
      estados.ts             ← Colores y etiquetas por estado
```

---

## Flujo de uso

```
Chef abre app → Login → Ve lista de pedidos en tiempo real
                              ↓
              Toca un pedido → Ve detalle completo
                              ↓
         [Confirmar] [Rechazar] [En camino] [Entregado]
                              ↓
         Si hay cambio solicitado → [Aprobar] [Rechazar cambio]
```

## Estados del pedido

| Estado | Color | Acción disponible |
|---|---|---|
| `pendiente` | 🟠 Naranja | Confirmar / Rechazar |
| `pendiente_pago` | 🟡 Amarillo | Confirmar / Rechazar |
| `confirmado` | 🟢 Verde | Marcar en camino |
| `en_camino` | 🔵 Azul | Marcar entregado |
| `entregado` | ⚫ Gris | — (historial) |
| `cancelado` | 🔴 Rojo | — (historial) |

---

## Comandos rápidos

```bash
npm start              # Expo dev server (Expo Go)
npm run android        # Emulador Android local
eas build --platform android --profile preview   # APK de prueba
eas build --platform android --profile production # AAB producción
```
