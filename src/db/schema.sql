-- Esquema Relacional de PostgreSQL para Bot Restaurantes

CREATE TABLE IF NOT EXISTS restaurantes (
    id VARCHAR(64) PRIMARY KEY,
    nombre VARCHAR(255) NOT NULL,
    moneda VARCHAR(16) DEFAULT 'C$',
    pais VARCHAR(64) DEFAULT 'Nicaragua',
    departamento VARCHAR(64) DEFAULT 'Jinotega',
    direccion TEXT DEFAULT 'De rest Mi Rancho 10 vrs al sur, casa naranja, sin rótulo de momento',
    telefono VARCHAR(64),
    activo BOOLEAN DEFAULT TRUE,
    horario JSONB DEFAULT '{}',
    cuentas_bancarias TEXT,
    proteinas_bloqueadas JSONB DEFAULT '[]',
    push_tokens JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS usuarios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurante_id VARCHAR(64) REFERENCES restaurantes(id) ON DELETE CASCADE,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    rol VARCHAR(32) DEFAULT 'chef',
    nombre VARCHAR(255) DEFAULT 'Chef Urbano',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS categorias (
    id VARCHAR(64) PRIMARY KEY,
    restaurante_id VARCHAR(64) REFERENCES restaurantes(id) ON DELETE CASCADE,
    nombre VARCHAR(255) NOT NULL,
    orden INT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS productos (
    id VARCHAR(64) PRIMARY KEY,
    restaurante_id VARCHAR(64) REFERENCES restaurantes(id) ON DELETE CASCADE,
    categoria_id VARCHAR(64) REFERENCES categorias(id) ON DELETE CASCADE,
    nombre VARCHAR(255) NOT NULL,
    precio NUMERIC(10, 2) NOT NULL,
    descripcion TEXT,
    opciones JSONB DEFAULT '[]',
    disponible BOOLEAN DEFAULT TRUE,
    proteina VARCHAR(32) DEFAULT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pedidos (
    id VARCHAR(64) PRIMARY KEY,
    restaurante_id VARCHAR(64) REFERENCES restaurantes(id) ON DELETE CASCADE,
    cliente VARCHAR(255) NOT NULL,
    telefono VARCHAR(64),
    jid VARCHAR(128),
    tipo_entrega VARCHAR(32) NOT NULL DEFAULT 'delivery',
    direccion TEXT,
    costo_envio NUMERIC(10, 2) DEFAULT 0,
    total NUMERIC(10, 2) NOT NULL,
    metodo_pago VARCHAR(32) NOT NULL DEFAULT 'efectivo',
    estado VARCHAR(32) NOT NULL DEFAULT 'pendiente',
    comprobante_url TEXT,
    tiempo_estimado_min INT,
    session_id VARCHAR(128),
    cambio_solicitado JSONB,
    notificaciones_enviadas JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pedido_items (
    id SERIAL PRIMARY KEY,
    pedido_id VARCHAR(64) REFERENCES pedidos(id) ON DELETE CASCADE,
    nombre VARCHAR(255) NOT NULL,
    cantidad INT NOT NULL,
    precio_unitario NUMERIC(10, 2) NOT NULL,
    opcion TEXT,
    subtotal NUMERIC(10, 2) NOT NULL
);

CREATE TABLE IF NOT EXISTS notificaciones_queue (
    id SERIAL PRIMARY KEY,
    destino VARCHAR(128) NOT NULL,
    mensaje TEXT NOT NULL,
    pedido_id VARCHAR(64),
    clave VARCHAR(64),
    estado VARCHAR(32) DEFAULT 'pendiente',
    intentos INT DEFAULT 0,
    error TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lista_negra (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurante_id VARCHAR(64) REFERENCES restaurantes(id) ON DELETE CASCADE,
    telefono VARCHAR(64) NOT NULL,
    telefono_clean VARCHAR(64) NOT NULL,
    nombre VARCHAR(255) DEFAULT 'Repartidor',
    motivo VARCHAR(255) DEFAULT 'Repartidor',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para consultas eficientes en tiempo real
CREATE INDEX IF NOT EXISTS idx_pedidos_restaurante_estado ON pedidos (restaurante_id, estado);
CREATE INDEX IF NOT EXISTS idx_pedidos_created_at ON pedidos (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pedidos_telefono ON pedidos (telefono);
CREATE INDEX IF NOT EXISTS idx_pedidos_session_id ON pedidos (session_id);
CREATE INDEX IF NOT EXISTS idx_productos_restaurante ON productos (restaurante_id);
CREATE INDEX IF NOT EXISTS idx_lista_negra_restaurante ON lista_negra (restaurante_id);
CREATE INDEX IF NOT EXISTS idx_lista_negra_clean ON lista_negra (telefono_clean);

