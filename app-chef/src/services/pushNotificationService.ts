/**
 * Expo Push Notifications — registro de token y configuración de canal Android.
 *
 * SETUP REQUERIDO (una sola vez por proyecto):
 *   npx expo install expo-notifications expo-device
 *   npx eas build  (o expo run:android/ios para build local)
 *
 * En producción también necesitas:
 *   - Android: google-services.json en app-chef/
 *   - iOS: certificado APNs en EAS credentials
 */

import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform, AppState, AppStateStatus } from 'react-native';
import { authFetch } from './apiClient';

let _lastRegisteredToken: string | null = null;

// Cómo manejar notificaciones cuando la app está en primer plano
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/**
 * Solicita permiso y registra el Expo Push Token en el backend.
 * Llama esta función una vez al autenticarse el chef.
 */
export async function registerPushToken(): Promise<void> {
  if (!Device.isDevice) {
    // En simulador/emulador sin configuración FCM, no hacemos nada
    return;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('pedidos', {
      name: 'Pedidos',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#F59E0B',
      sound: 'default',
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.log('[pushService] Permiso de notificaciones denegado por el usuario');
    return;
  }

  try {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
    const tokenData = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    const token = tokenData.data;

    // Solo escribir si el token cambió (evita escrituras innecesarias al backend)
    if (token === _lastRegisteredToken) {
      return;
    }

    const res = await authFetch('/restaurante/push-token', {
      method: 'POST',
      body: JSON.stringify({ token }),
    });
    if (!res.ok) throw new Error(`registerPushToken failed: ${res.status}`);

    _lastRegisteredToken = token;
    console.log('[pushService] Token registrado:', token.substring(0, 30) + '...');
  } catch (err: any) {
    console.warn('[pushService] Error registrando token:', err.message);
  }
}

/**
 * Refresca el token push automáticamente cuando la app vuelve a primer plano
 * o cuando el OS rota el token subyacente (FCM/APNs).
 * Retorna función de cleanup para useEffect.
 */
export function setupTokenRefresh(): () => void {
  const appStateSub = AppState.addEventListener('change', (state: AppStateStatus) => {
    if (state === 'active') {
      registerPushToken().catch(() => {});
    }
  });

  const tokenSub = Notifications.addPushTokenListener(() => {
    registerPushToken().catch(() => {});
  });

  return () => {
    appStateSub.remove();
    tokenSub.remove();
  };
}
