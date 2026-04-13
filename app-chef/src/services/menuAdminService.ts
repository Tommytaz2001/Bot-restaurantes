import { authFetch } from './apiClient';

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

export async function getCategorias(): Promise<MenuCategoria[]> {
  const res = await authFetch('/menu-admin/categorias');
  if (!res.ok) throw new Error(`getCategorias failed: ${res.status}`);
  const json = await res.json();
  return json.categorias as MenuCategoria[];
}

export async function addCategoria(nombre: string, orden: number): Promise<void> {
  const res = await authFetch('/menu-admin/categorias', {
    method: 'POST',
    body: JSON.stringify({ nombre, orden }),
  });
  if (!res.ok) throw new Error(`addCategoria failed: ${res.status}`);
}

export async function updateCategoriaNombre(id: string, nombre: string): Promise<void> {
  const res = await authFetch(`/menu-admin/categorias/${id}/nombre`, {
    method: 'PATCH',
    body: JSON.stringify({ nombre }),
  });
  if (!res.ok) throw new Error(`updateCategoriaNombre failed: ${res.status}`);
}

export async function updateCategoriaOrden(id: string, orden: number): Promise<void> {
  const res = await authFetch(`/menu-admin/categorias/${id}/orden`, {
    method: 'PATCH',
    body: JSON.stringify({ orden }),
  });
  if (!res.ok) throw new Error(`updateCategoriaOrden failed: ${res.status}`);
}

export async function deleteCategoria(id: string): Promise<void> {
  const res = await authFetch(`/menu-admin/categorias/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`deleteCategoria failed: ${res.status}`);
}

export async function addItem(categoriaId: string, item: Omit<MenuItem, 'disponible'>): Promise<void> {
  const res = await authFetch(`/menu-admin/categorias/${categoriaId}/items`, {
    method: 'POST',
    body: JSON.stringify(item),
  });
  if (!res.ok) throw new Error(`addItem failed: ${res.status}`);
}

export async function updateItem(categoriaId: string, idx: number, updated: MenuItem): Promise<void> {
  const res = await authFetch(`/menu-admin/categorias/${categoriaId}/items/${idx}`, {
    method: 'PATCH',
    body: JSON.stringify(updated),
  });
  if (!res.ok) throw new Error(`updateItem failed: ${res.status}`);
}

export async function deleteItem(categoriaId: string, idx: number): Promise<void> {
  const res = await authFetch(`/menu-admin/categorias/${categoriaId}/items/${idx}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(`deleteItem failed: ${res.status}`);
}

export async function toggleDisponible(categoriaId: string, idx: number): Promise<void> {
  const res = await authFetch(`/menu-admin/categorias/${categoriaId}/items/${idx}/toggle`, {
    method: 'PATCH',
  });
  if (!res.ok) throw new Error(`toggleDisponible failed: ${res.status}`);
}
