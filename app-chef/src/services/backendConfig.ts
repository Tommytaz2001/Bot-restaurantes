import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'backend_url';
const DEFAULT = process.env.EXPO_PUBLIC_BACKEND_URL ?? 'http://localhost:3001';

export async function getBackendUrl(): Promise<string> {
  try {
    const stored = await AsyncStorage.getItem(KEY);
    return stored ?? DEFAULT;
  } catch {
    return DEFAULT;
  }
}

export async function setBackendUrl(url: string): Promise<void> {
  const clean = url.trim().replace(/\/$/, ''); // quita slash final
  await AsyncStorage.setItem(KEY, clean);
}
