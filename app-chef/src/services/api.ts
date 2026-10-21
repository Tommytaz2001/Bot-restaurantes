export interface Usuario {
  id: string;
  email: string;
  rol: string;
  nombre: string;
  restauranteId: string;
}

export interface ProductoItem {
  nombre: string;
  cantidad: number;
  precio_unitario: number;
  opcion?: string | null;
  subtotal?: number;
}

export interface CambioSolicitado {
  tipo: 'modificacion' | 'agregar_productos' | 'cambiar_entrega';
  descripcion: string;
  estado: 'pendiente_chef' | 'aprobado' | 'rechazado';
  productos_nuevos?: ProductoItem[];
  total_nuevo?: number;
  datos_entrega?: {
    tipo_entrega: 'domicilio' | 'retiro';
    direccion?: string;
    costo_envio: number;
    total_nuevo: number;
  };
  solicitadoAt?: string;
}

export interface Pedido {
  id: string;
  restauranteId: string;
  cliente: string;
  telefono: string;
  jid?: string;
  tipo_entrega: 'delivery' | 'retiro';
  direccion: string;
  costo_envio: number;
  total: number;
  metodo_pago: 'efectivo' | 'transferencia';
  estado: 'pendiente' | 'pendiente_pago' | 'confirmado' | 'en_camino' | 'entregado' | 'cancelado';
  comprobante_url?: string | null;
  tiempo_estimado_min?: number;
  cambio_solicitado?: CambioSolicitado | null;
  createdAt: string;
  updatedAt?: string;
  productos: ProductoItem[];
}

const STORAGE_KEY_TOKEN = 'urbano_chef_jwt_token';
const STORAGE_KEY_USER = 'urbano_chef_user_data';
const STORAGE_KEY_BACKEND = 'urbano_chef_backend_url';

export function getBackendUrl(): string {
  const saved = localStorage.getItem(STORAGE_KEY_BACKEND);
  if (saved) return saved;
  // Si estamos en un navegador en localhost o red local
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    return `http://${host}:3001`;
  }
  return 'http://localhost:3001';
}

export function setBackendUrl(url: string) {
  localStorage.setItem(STORAGE_KEY_BACKEND, url.replace(/\/$/, ''));
}

export function getToken(): string | null {
  return localStorage.getItem(STORAGE_KEY_TOKEN);
}

export function setToken(token: string) {
  localStorage.setItem(STORAGE_KEY_TOKEN, token);
}

export function removeToken() {
  localStorage.removeItem(STORAGE_KEY_TOKEN);
  localStorage.removeItem(STORAGE_KEY_USER);
}

export function getUser(): Usuario | null {
  const saved = localStorage.getItem(STORAGE_KEY_USER);
  if (!saved) return null;
  try {
    return JSON.parse(saved);
  } catch {
    return null;
  }
}

export function setUser(user: Usuario) {
  localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(user));
}

export async function authFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const backend = getBackendUrl();
  const token = getToken();

  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> || {}),
  };

  if (options.body && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${backend}${path}`, {
    ...options,
    headers,
  });

  if (res.status === 401) {
    removeToken();
    window.dispatchEvent(new Event('auth:unauthorized'));
  }

  return res;
}

// ── Auth ─────────────────────────────────────────────────────────────────────
export async function login(email: string, password: string): Promise<{ token: string; user: Usuario }> {
  const backend = getBackendUrl();
  const res = await fetch(`${backend}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || 'Credenciales inválidas');
  }

  const data = await res.json();
  setToken(data.token);
  setUser(data.user);
  return data;
}

// ── Bot Status & Toggle ──────────────────────────────────────────────────────
export async function fetchBotStatus(): Promise<{ botActivo: boolean }> {
  const res = await authFetch('/whatsapp/status');
  if (!res.ok) throw new Error('Error obteniendo estado del bot');
  return res.json();
}

export async function toggleBot(currentActive: boolean): Promise<boolean> {
  const endpoint = currentActive ? '/whatsapp/pause' : '/whatsapp/resume';
  const res = await authFetch(endpoint, { method: 'POST' });
  const data = await res.json();
  return data.botActivo;
}

// ── Acciones de Pedidos ──────────────────────────────────────────────────────
export async function confirmarPedido(id: string, tiempoEstimadoMin?: number): Promise<void> {
  const res = await authFetch(`/pedidos-admin/${id}/confirmar`, {
    method: 'PATCH',
    body: JSON.stringify({ tiempoEstimadoMin }),
  });
  if (!res.ok) throw new Error('Error confirmando pedido');
}

export async function marcarEnCamino(id: string): Promise<void> {
  const res = await authFetch(`/pedidos-admin/${id}/en-camino`, {
    method: 'PATCH',
  });
  if (!res.ok) throw new Error('Error marcando pedido en camino');
}

export async function marcarEntregado(id: string): Promise<void> {
  const res = await authFetch(`/pedidos-admin/${id}/entregado`, {
    method: 'PATCH',
  });
  if (!res.ok) throw new Error('Error marcando pedido entregado');
}

export async function rechazarPedido(id: string): Promise<void> {
  const res = await authFetch(`/pedidos-admin/${id}/rechazar`, {
    method: 'PATCH',
  });
  if (!res.ok) throw new Error('Error rechazando pedido');
}

export async function aprobarCambio(id: string): Promise<void> {
  const res = await authFetch(`/pedidos-admin/${id}/cambio/aprobar`, {
    method: 'PATCH',
  });
  if (!res.ok) throw new Error('Error aprobando cambio');
}

export async function rechazarCambio(id: string): Promise<void> {
  const res = await authFetch(`/pedidos-admin/${id}/cambio/rechazar`, {
    method: 'PATCH',
  });
  if (!res.ok) throw new Error('Error rechazando cambio');
}

export async function fetchHistorial(filtro = 'todos'): Promise<Pedido[]> {
  const res = await authFetch(`/pedidos-admin/historial?filtro=${filtro}`);
  if (!res.ok) throw new Error('Error consultando historial');
  const data = await res.json();
  return data.pedidos || [];
}

export async function simularPedidos(cantidad = 10): Promise<{ ok: boolean; creados: number }> {
  const res = await authFetch('/pedidos-admin/simular-pedidos', {
    method: 'POST',
    body: JSON.stringify({ cantidad }),
  });
  if (!res.ok) throw new Error('Error al simular pedidos');
  return res.json();
}

// ── Menú y Horarios ──────────────────────────────────────────────────────────
export type Proteina = 'pollo' | 'cerdo' | 'res' | 'birria' | 'mixto';

export interface MenuItemAdmin {
  id: string;
  nombre: string;
  precio: number;
  descripcion: string;
  opciones: string[];
  disponible: boolean;
  proteina?: Proteina | null;
  bloqueadoPorProteina?: boolean;
}

export interface MenuCategoriaAdmin {
  id: string;
  nombre: string;
  orden: number;
  items: MenuItemAdmin[];
}

export async function fetchCategorias(): Promise<MenuCategoriaAdmin[]> {
  const res = await authFetch('/menu-admin/categorias');
  if (!res.ok) throw new Error('Error consultando menú');
  const data = await res.json();
  return Array.isArray(data) ? data : (data.categorias || []);
}

export async function toggleDisponibilidad(categoriaId: string, indexOrId: string | number): Promise<void> {
  const res = await authFetch(`/menu-admin/categorias/${categoriaId}/items/${indexOrId}/toggle`, {
    method: 'PATCH',
  });
  if (!res.ok) throw new Error('Error cambiando disponibilidad');
}

export async function createCategoria(nombre: string, orden = 0): Promise<{ id: string }> {
  const res = await authFetch('/menu-admin/categorias', {
    method: 'POST',
    body: JSON.stringify({ nombre, orden }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Error creando categoría');
  }
  return res.json();
}

export async function deleteCategoria(categoriaId: string): Promise<void> {
  const res = await authFetch(`/menu-admin/categorias/${categoriaId}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Error eliminando categoría');
  }
}

export async function createProducto(
  categoriaId: string,
  producto: {
    nombre: string;
    precio: number;
    descripcion?: string;
    proteina?: string | null;
    opciones?: string[];
    disponible?: boolean;
  }
): Promise<void> {
  const res = await authFetch(`/menu-admin/categorias/${categoriaId}/items`, {
    method: 'POST',
    body: JSON.stringify(producto),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Error agregando platillo');
  }
}

export async function updateProducto(
  categoriaId: string,
  itemId: string,
  producto: {
    nombre: string;
    precio: number;
    descripcion?: string;
    proteina?: string | null;
    opciones?: string[];
    disponible?: boolean;
  }
): Promise<void> {
  const res = await authFetch(`/menu-admin/categorias/${categoriaId}/items/${itemId}`, {
    method: 'PATCH',
    body: JSON.stringify(producto),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Error actualizando platillo');
  }
}

export async function deleteProducto(categoriaId: string, itemId: string): Promise<void> {
  const res = await authFetch(`/menu-admin/categorias/${categoriaId}/items/${itemId}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Error eliminando platillo');
  }
}

export async function fetchProteinasBloqueadas(): Promise<string[]> {
  const res = await authFetch('/restaurante/proteinas');
  if (!res.ok) throw new Error('Error consultando proteínas bloqueadas');
  const data = await res.json();
  return Array.isArray(data.proteinasBloqueadas) ? data.proteinasBloqueadas : [];
}

export async function saveProteinasBloqueadas(proteinasBloqueadas: string[]): Promise<void> {
  const res = await authFetch('/restaurante/proteinas', {
    method: 'PUT',
    body: JSON.stringify({ proteinasBloqueadas }),
  });
  if (!res.ok) throw new Error('Error guardando proteínas bloqueadas');
}

export async function fetchHorario(): Promise<any> {
  const res = await authFetch('/restaurante/horario');
  if (!res.ok) throw new Error('Error consultando horario');
  const data = await res.json();
  return data.horario;
}

export async function saveHorario(horario: any): Promise<void> {
  const res = await authFetch('/restaurante/horario', {
    method: 'PUT',
    body: JSON.stringify({ horario }),
  });
  if (!res.ok) throw new Error('Error guardando horario');
}
