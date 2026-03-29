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
import { Platform } from 'react-native';
import { db } from './firebaseConfig';
import { doc, setDoc } from 'firebase/firestore';

const RESTAURANTE_ID = process.env.EXPO_PUBLIC_RESTAURANTE_ID ?? 'urbano';

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
 * Solicita permiso y registra el Expo Push Token en Firestore.
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
    const tokenData = await Notifications.getExpoPushTokenAsync();
    const token = tokenData.data;
    await setDoc(
      doc(db, 'restaurantes', RESTAURANTE_ID),
      { push_token: token },
      { merge: true },
    );
    console.log('[pushService] Token registrado:', token.substring(0, 30) + '...');
  } catch (err: any) {
    console.warn('[pushService] Error registrando token:', err.message);
  }
}
