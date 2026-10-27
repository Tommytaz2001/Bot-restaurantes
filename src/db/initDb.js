const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { pool, query } = require('./connection');

const RESTAURANTE_ID = process.env.RESTAURANTE_ID || 'urbano';

const DEFAULT_HORARIO = {
  lunes: { abre: true, apertura: '17:00', cierre: '23:00' },
  martes: { abre: true, apertura: '17:00', cierre: '23:00' },
  miercoles: { abre: true, apertura: '17:00', cierre: '23:00' },
  jueves: { abre: true, apertura: '17:00', cierre: '23:00' },
  viernes: { abre: true, apertura: '17:00', cierre: '23:59' },
  sabado: { abre: true, apertura: '17:00', cierre: '23:59' },
  domingo: { abre: true, apertura: '17:00', cierre: '23:00' },
};

const DEFAULT_CUENTAS = `*Cuenta bancaria de Urbano:*
• BAC Córdobas: 371618588
(Solamente aceptamos transferencias a BAC)`;

const INITIAL_MENU = [
  {
    id: 'hamburguesas',
    nombre: 'Hamburguesas',
    orden: 1,
    items: [
      { id: 'hamb-clasica', nombre: 'Clásica', precio: 160, descripcion: '150g de res, queso americano, mayonesa, lechuga, tomate, cebolla caramelizada. Incluye papas fritas y kétchup.', opciones: [] },
      { id: 'hamb-premium', nombre: 'Premium', precio: 200, descripcion: '150g de res, jamón, mozarella, cheddar, queso americano, mayonesa, tomate, lechuga, cebolla caramelizada. Incluye papas fritas y kétchup.', opciones: ['Chipotle dulce', 'BBQ', 'Salsa dulce'] },
      { id: 'hamb-nivel-100', nombre: 'Nivel 100', precio: 290, descripcion: '2 tortas de res 150g, jamón, bacon, mozarella, cebolla caramelizada, tomate, lechuga, americano por torta. Aparte: cheddar, BBQ, salsa dulce, chipotle dulce. Incluye papas y kétchup.', opciones: [] },
      { id: 'hamb-cheeseburguer', nombre: 'Cheeseburguer', precio: 180, descripcion: '150g de res, sin vegetales, doble queso americano, cheddar y mozarella. Incluye papas, kétchup y cheddar.', opciones: [] },
      { id: 'hamb-pollito', nombre: 'Pollito', precio: 180, descripcion: 'Trocitos de pollo a la plancha, mozarella, cebolla, tomate, lechuga, salsa dulce, cheddar. Incluye papas y kétchup.', opciones: [] },
      { id: 'hamb-chuletona', nombre: 'Chuletona', precio: 200, descripcion: 'Chuleta de cerdo, mozarella, cebolla caramelizada, tomate, lechuga, salsa BBQ, cheddar. Incluye papas y kétchup.', opciones: [] },
      { id: 'hamb-double-cheeseburguer', nombre: 'Double Cheeseburguer', precio: 240, descripcion: '2 tortas 150g, mozarella, cheddar, doble americano por torta. Incluye papas, kétchup y cheddar.', opciones: [] },
    ],
  },
  {
    id: 'tacos',
    nombre: 'Tacos',
    orden: 2,
    items: [
      { id: 'taco-birria', nombre: 'Tacos Birria', precio: 190, descripcion: 'Orden de 4 tacos con doble tortilla, mozarella, salsa aguacate, salsa roja, cebolla con cilantro y limones. Incluye 5 oz de caldo.', opciones: [] },
      { id: 'taco-pastor-cerdo', nombre: 'Tacos Pastor-cerdo', precio: 160, descripcion: 'Orden de 4 tacos de pastor-cerdo con doble tortilla, mozarella, salsa aguacate, salsa roja, cebolla con cilantro y limones.', opciones: [] },
      { id: 'taco-pollo', nombre: 'Tacos Pollo', precio: 160, descripcion: 'Orden de 4 tacos de pollo con doble tortilla, mozarella, salsa aguacate, salsa roja, cebolla con cilantro y limones.', opciones: [] },
      { id: 'taco-cerdo', nombre: 'Tacos Cerdo', precio: 160, descripcion: 'Orden de 4 tacos de cerdo con doble tortilla, mozarella, salsa aguacate, salsa roja, cebolla con cilantro y limones.', opciones: [] },
      { id: 'taco-mixto', nombre: 'Tacos Mixto', precio: 160, descripcion: 'Orden de 4 tacos mixtos (cerdo y pollo) con doble tortilla, mozarella, salsa aguacate, salsa roja, cebolla con cilantro y limones.', opciones: [] },
    ],
  },
  {
    id: 'burritos',
    nombre: 'Burritos',
    orden: 3,
    items: [
      { id: 'burrito-pastor-cerdo', nombre: 'Burrito Pastor-cerdo', precio: 170, descripcion: 'Tortilla de harina con frijoles molidos, mozarella, queso rayado y carne. Incluye crema, salsa guacamole y roja.', opciones: [] },
      { id: 'burrito-pastor-combo', nombre: 'Burrito Pastor-cerdo Combo', precio: 230, descripcion: 'Burrito Pastor-cerdo más papas fritas y gaseosa 355ml.', opciones: [] },
      { id: 'burrito-pollo', nombre: 'Burrito Pollo', precio: 160, descripcion: 'Tortilla de harina con frijoles molidos, mozarella, queso rayado y pollo. Incluye crema, salsa guacamole y roja.', opciones: [] },
      { id: 'burrito-pollo-combo', nombre: 'Burrito Pollo Combo', precio: 220, descripcion: 'Burrito Pollo más papas fritas y gaseosa 355ml.', opciones: [] },
      { id: 'burrito-cerdo', nombre: 'Burrito Cerdo', precio: 160, descripcion: 'Tortilla de harina con frijoles molidos, mozarella, queso rayado y cerdo. Incluye crema, salsa guacamole y roja.', opciones: [] },
      { id: 'burrito-cerdo-combo', nombre: 'Burrito Cerdo Combo', precio: 220, descripcion: 'Burrito Cerdo más papas fritas y gaseosa 355ml.', opciones: [] },
    ],
  },
  {
    id: 'nachos',
    nombre: 'Nachos',
    orden: 4,
    items: [
      { id: 'nacho-pollo', nombre: 'Nachos Pollo', precio: 200, descripcion: 'Totopos, frijoles molidos, queso rayado, mozarella, pico de gallo, cheddar, crema, salsa aguacate y roja, limones.', opciones: [] },
      { id: 'nacho-cerdo', nombre: 'Nachos Cerdo', precio: 210, descripcion: 'Nachos con cerdo, totopos, frijoles molidos, queso rayado, mozarella, pico de gallo, cheddar, crema, salsas.', opciones: [] },
      { id: 'nacho-birria', nombre: 'Nachos Birria', precio: 240, descripcion: 'Nachos de birria, totopos, frijoles molidos, queso rayado, mozarella, pico de gallo, cheddar, crema, salsas. Incluye 5 oz de caldo.', opciones: [] },
    ],
  },
  {
    id: 'quesadillas',
    nombre: 'Quesadillas',
    orden: 5,
    items: [
      { id: 'quesadilla-pastor', nombre: 'Quesadilla Pastor-cerdo', precio: 170, descripcion: 'Tortilla de harina con mozarella y carne. Incluye crema, salsa aguacate y roja, ensalada de lechuga con tomate y limón.', opciones: [] },
      { id: 'quesadilla-pollo', nombre: 'Quesadilla Pollo', precio: 160, descripcion: 'Tortilla de harina con mozarella y pollo. Incluye crema, salsa aguacate y roja.', opciones: [] },
      { id: 'quesadilla-cerdo', nombre: 'Quesadilla Cerdo', precio: 160, descripcion: 'Tortilla de harina con mozarella y cerdo. Incluye crema, salsa aguacate y roja.', opciones: [] },
    ],
  },
  {
    id: 'papas-fritas',
    nombre: 'Papas Fritas',
    orden: 6,
    items: [
      { id: 'papas-peor-es-nada', nombre: 'Papas Peor es Nada', precio: 80, descripcion: 'Papas fritas con salsa de tomate y cheddar.', opciones: [] },
      { id: 'papas-de-calle', nombre: 'Papas De Calle', precio: 100, descripcion: 'Papas fritas bañadas en salsa dulce, salsa de tomate, cheddar y queso rayado.', opciones: [] },
      { id: 'papas-premium', nombre: 'Papas Premium', precio: 140, descripcion: 'Papas fritas con salchicha parrillera, bañadas en salsa dulce, cheddar y salsa de tomate.', opciones: [] },
      { id: 'papas-nivel-100', nombre: 'Papas Nivel 100', precio: 220, descripcion: 'Papas fritas con carne, salchicha parrillera y jumbo, bañadas con mozarella, salsa dulce, cheddar.', opciones: [] },
    ],
  },
  {
    id: 'bebidas',
    nombre: 'Bebidas',
    orden: 7,
    items: [
      { id: 'coca-cola', nombre: 'Coca Cola 355ml', precio: 30, descripcion: 'Refresco Coca Cola lata 355ml.', opciones: [] },
      { id: 'fresca', nombre: 'Fresca 355ml', precio: 30, descripcion: 'Refresco Fresca lata 355ml.', opciones: [] },
      { id: 'hi-c', nombre: 'Hi-C Té Limón', precio: 30, descripcion: 'Refresco Hi-C sabor té limón.', opciones: [] },
    ],
  },
  {
    id: 'extras',
    nombre: 'Extras',
    orden: 8,
    items: [
      { id: 'extra-salsa-aguacate', nombre: 'Salsa aguacate', precio: 20, descripcion: 'Extra salsa de aguacate.', opciones: [] },
      { id: 'extra-salsa-roja', nombre: 'Salsa roja', precio: 10, descripcion: 'Extra salsa roja.', opciones: [] },
      { id: 'extra-cheddar', nombre: 'Cheddar', precio: 20, descripcion: 'Extra queso cheddar.', opciones: [] },
      { id: 'extra-papas', nombre: 'Papas fritas extra', precio: 45, descripcion: 'Porción extra de papas fritas.', opciones: [] },
    ],
  },
];

async function initDb() {
  console.log('[Database] Verificando conexión a PostgreSQL e inicializando tablas...');
  try {
    const schemaSql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
    await query(schemaSql);
    console.log('[Database] Tablas del esquema verificadas exitosamente.');

    // 1. Verificar o crear Restaurante default
    await query(`ALTER TABLE restaurantes ADD COLUMN IF NOT EXISTS departamento VARCHAR(64) DEFAULT 'Jinotega'`);
    await query(`ALTER TABLE restaurantes ADD COLUMN IF NOT EXISTS direccion TEXT DEFAULT 'De rest Mi Rancho 10 vrs al sur, casa naranja, sin rótulo de momento'`);
    await query(`ALTER TABLE restaurantes ADD COLUMN IF NOT EXISTS push_tokens JSONB DEFAULT '[]'`);

    const restRes = await query('SELECT id FROM restaurantes WHERE id = $1', [RESTAURANTE_ID]);
    if (restRes.rows.length === 0) {
      await query(
        `INSERT INTO restaurantes (id, nombre, moneda, pais, departamento, direccion, telefono, horario, cuentas_bancarias)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          RESTAURANTE_ID,
          'Urbano',
          'C$',
          'Nicaragua',
          'Jinotega',
          'De rest Mi Rancho 10 vrs al sur, casa naranja, sin rótulo de momento',
          '+50588888888',
          JSON.stringify(DEFAULT_HORARIO),
          DEFAULT_CUENTAS,
        ]
      );
      console.log(`[Database] Restaurante default "${RESTAURANTE_ID}" creado.`);
    } else {
      await query(
        `UPDATE restaurantes
         SET cuentas_bancarias = $1,
             departamento = COALESCE(departamento, 'Jinotega'),
             direccion = COALESCE(direccion, 'De rest Mi Rancho 10 vrs al sur, casa naranja, sin rótulo de momento')
         WHERE id = $2`,
        [DEFAULT_CUENTAS, RESTAURANTE_ID]
      );
    }

    // 2. Verificar o crear Usuario Chef inicial
    const userRes = await query('SELECT id FROM usuarios WHERE email = $1', ['chef@urbano.com']);
    if (userRes.rows.length === 0) {
      const passwordHash = await bcrypt.hash(process.env.DEFAULT_CHEF_PASSWORD || 'chef123', 10);
      await query(
        `INSERT INTO usuarios (restaurante_id, email, password_hash, rol, nombre)
         VALUES ($1, $2, $3, $4, $5)`,
        [RESTAURANTE_ID, 'chef@urbano.com', passwordHash, 'chef', 'Chef Principal Urbano']
      );
      console.log('[Database] Usuario chef inicial creado: chef@urbano.com (clave: chef123)');
    }

    // 3. Verificar o sembrar Categorías y Menú inicial
    const catRes = await query('SELECT id FROM categorias WHERE restaurante_id = $1 LIMIT 1', [RESTAURANTE_ID]);
    if (catRes.rows.length === 0) {
      console.log('[Database] Sembrando menú inicial...');
      for (const cat of INITIAL_MENU) {
        await query(
          'INSERT INTO categorias (id, restaurante_id, nombre, orden) VALUES ($1, $2, $3, $4)',
          [cat.id, RESTAURANTE_ID, cat.nombre, cat.orden]
        );

        for (const item of cat.items) {
          await query(
            `INSERT INTO productos (id, restaurante_id, categoria_id, nombre, precio, descripcion, opciones, disponible)
             VALUES ($1, $2, $3, $4, $5, $6, $7, true)`,
            [
              item.id,
              RESTAURANTE_ID,
              cat.id,
              item.nombre,
              item.precio,
              item.descripcion,
              JSON.stringify(item.opciones || []),
            ]
          );
        }
      }
      console.log('[Database] Menú inicial sembrado con éxito.');
    }

    console.log('[Database] Inicialización de PostgreSQL completada.');
    return true;
  } catch (err) {
    console.error('[Database] Error inicializando base de datos PostgreSQL:', err.message);
    return false;
  }
}

module.exports = { initDb };
