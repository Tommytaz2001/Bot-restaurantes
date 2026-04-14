import { auth } from './firebaseConfig';
import { getBackendUrl } from './backendConfig';

export async function authFetch(path: string, options: RequestInit = {}): Promise<Response> {
  let backendUrl: string;
  let token: string | undefined;

  try {
    [backendUrl, token] = await Promise.all([
      getBackendUrl(),
      auth.currentUser?.getIdToken(),
    ]) as [string, string | undefined];
  } catch (err) {
    console.error(`[authFetch] Error obteniendo URL/token para ${path}:`, err);
    throw err;
  }

  if (!token) {
    console.warn(`[authFetch] Sin token para ${path} — auth.currentUser=${auth.currentUser ? 'set' : 'null'}`);
  }

  try {
    const res = await fetch(`${backendUrl}${path}`, {
      ...options,
      headers: {
        ...(options.body != null ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers ?? {}),
      },
    });
    if (!res.ok) {
      console.warn(`[authFetch] ${options.method ?? 'GET'} ${path} → ${res.status}`);
    }
    return res;
  } catch (err) {
    console.error(`[authFetch] Fetch falló para ${path}:`, err);
    throw err;
  }
}

export async function getAuthToken(): Promise<string | undefined> {
  return auth.currentUser?.getIdToken();
}
