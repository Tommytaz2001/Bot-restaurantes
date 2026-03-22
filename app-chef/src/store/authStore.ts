import { create } from 'zustand';
import { signInWithEmailAndPassword, signOut, onAuthStateChanged, type User } from 'firebase/auth';
import { auth } from '../services/firebaseConfig';

interface AuthState {
  user: User | null;
  loading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  init: () => () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: true,
  error: null,

  init: () => {
    const unsub = onAuthStateChanged(auth, (user) => {
      set({ user, loading: false });
    });
    return unsub;
  },

  login: async (email, password) => {
    set({ error: null, loading: true });
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (e: any) {
      const msg = e.code === 'auth/invalid-credential'
        ? 'Correo o contraseña incorrectos.'
        : 'Error al iniciar sesión. Intenta de nuevo.';
      set({ error: msg, loading: false });
    }
  },

  logout: async () => {
    await signOut(auth);
  },
}));
