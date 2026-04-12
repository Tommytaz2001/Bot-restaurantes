import { db } from './firebaseConfig';
import {
  collection, doc, getDocs, addDoc, updateDoc, deleteDoc,
} from 'firebase/firestore';

const RESTAURANTE_ID = process.env.EXPO_PUBLIC_RESTAURANTE_ID ?? 'urbano';

export type Proteina = 'pollo' | 'cerdo' | 'birria' | 'mixto';

export interface MenuItem {
  nombre: string;
  precio: number;
  descripcion: string;
  opciones: string[];
  disponible: boolean;
  proteina?: Proteina;
}

export interface MenuCategoria {
  id: string;
  nombre: string;
  orden: number;
  items: MenuItem[];
}

const menuCol = () => collection(db, 'restaurantes', RESTAURANTE_ID, 'menu');
const categoriaDoc = (id: string) => doc(db, 'restaurantes', RESTAURANTE_ID, 'menu', id);

export async function getCategorias(): Promise<MenuCategoria[]> {
  const snap = await getDocs(menuCol());
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() } as MenuCategoria))
    .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
}

export async function addCategoria(nombre: string, orden: number): Promise<void> {
  await addDoc(menuCol(), { nombre, orden, items: [] });
}

export async function updateCategoriaNombre(id: string, nombre: string): Promise<void> {
  await updateDoc(categoriaDoc(id), { nombre });
}

export async function updateCategoriaOrden(id: string, orden: number): Promise<void> {
  await updateDoc(categoriaDoc(id), { orden });
}

export async function deleteCategoria(id: string): Promise<void> {
  await deleteDoc(categoriaDoc(id));
}

export async function addItem(categoriaId: string, items: MenuItem[], item: Omit<MenuItem, 'disponible'>): Promise<void> {
  await updateDoc(categoriaDoc(categoriaId), {
    items: [...items, { ...item, disponible: true }],
  });
}

export async function updateItem(categoriaId: string, items: MenuItem[], idx: number, updated: MenuItem): Promise<void> {
  const next = [...items];
  next[idx] = updated;
  await updateDoc(categoriaDoc(categoriaId), { items: next });
}

export async function deleteItem(categoriaId: string, items: MenuItem[], idx: number): Promise<void> {
  await updateDoc(categoriaDoc(categoriaId), {
    items: items.filter((_, i) => i !== idx),
  });
}

export async function toggleDisponible(categoriaId: string, items: MenuItem[], idx: number): Promise<void> {
  const next = [...items];
  next[idx] = { ...next[idx], disponible: !(next[idx].disponible ?? true) };
  console.log(`[toggleDisponible] ${next[idx].nombre} → disponible=${next[idx].disponible} (doc=${categoriaId})`);
  await updateDoc(categoriaDoc(categoriaId), { items: next });
  console.log(`[toggleDisponible] OK — write committed`);
}
