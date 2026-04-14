import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { useAuthStore } from '../src/store/authStore';
import { registerPushToken, setupTokenRefresh } from '../src/services/pushNotificationService';

export default function RootLayout() {
  const { user, loading, init } = useAuthStore();
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    const unsub = init();
    return unsub;
  }, []);

  useEffect(() => {
    if (loading) return;
    const inAuth = segments[0] === '(auth)';
    if (!user && !inAuth) {
      router.replace('/(auth)/login');
    } else if (user && inAuth) {
      router.replace('/(tabs)');
    }
  }, [user, loading, segments]);

  // Push token: solo cuando cambia el usuario (no en cada cambio de ruta)
  useEffect(() => {
    if (!user) return;
    registerPushToken().catch(() => {});
    const cleanupRefresh = setupTokenRefresh();
    return () => cleanupRefresh();
  }, [user]);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(auth)/login" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="pedido/[id]" options={{ headerShown: false, presentation: 'card' }} />
    </Stack>
  );
}
