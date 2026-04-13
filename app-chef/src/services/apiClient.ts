import { auth } from './firebaseConfig';
import { getBackendUrl } from './backendConfig';

export async function authFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const [backendUrl, token] = await Promise.all([
    getBackendUrl(),
    auth.currentUser?.getIdToken(),
  ]);
  return fetch(`${backendUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  });
}

export async function getAuthToken(): Promise<string | undefined> {
  return auth.currentUser?.getIdToken();
}
