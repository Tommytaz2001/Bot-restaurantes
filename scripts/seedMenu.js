require('dotenv').config();
const { db } = require('../src/services/firebaseService');
const { doc, setDoc, collection } = require('firebase/firestore');

const RESTAURANTE_ID = 'urbano';

const restauranteConfig = {
  nombre: 'Urbano',
  moneda: 'C$',
  pais: 'Nicaragua',
  activo: true,
};

// Convención: items con variante Sencillo/Combo son items separados
const menu = [
  {
    id: 'hamburguesas',
    nombre: 'Hamburguesas',
    orden: 1,
    items: [
      { nombre: 'Clásica', precio: 160, descripcion: '150g de res, queso americano, mayonesa, lechuga, tomate, cebolla caramelizada. Incluye papas fritas y kétchup.', opciones: [] },
      { nombre: 'Premium', precio: 200, descripcion: '150g de res, jamón, mozarella, cheddar, queso americano, mayonesa, tomate, lechuga, cebolla caramelizada. Incluye papas fritas y kétchup.', opciones: ['Chipotle dulce', 'BBQ', 'Salsa dulce'] },
      { nombre: 'Nivel 100', precio: 290, descripcion: '2 tortas de res 150g, jamón, bacon, mozarella, cebolla caramelizada, tomate, lechuga, americano por torta. Aparte: cheddar, BBQ, salsa dulce, chipotle dulce. Incluye papas y kétchup.', opciones: [] },
      { nombre: 'Cheeseburguer', precio: 180, descripcion: '150g de res, sin vegetales, doble queso americano, cheddar y mozarella. Incluye papas, kétchup y cheddar.', opciones: [] },
      { nombre: 'Pollito', precio: 180, descripcion: 'Trocitos de pollo a la plancha, mozarella, cebolla, tomate, lechuga, salsa dulce, cheddar. Incluye papas y kétchup.', opciones: [] },
      { nombre: 'Chuletona', precio: 200, descripcion: 'Chuleta de cerdo, mozarella, cebolla caramelizada, tomate, lechuga, salsa BBQ, cheddar. Incluye papas y kétchup.', opciones: [] },
      { nombre: 'Double Cheeseburguer', precio: 240, descripcion: '2 tortas 150g, mozarella, cheddar, doble americano por torta. Incluye papas, kétchup y cheddar.', opciones: [] },
    ],
  },
  {
    id: 'tacos',
    nombre: 'Tacos',
    orden: 2,
    items: [
      { nombre: 'Tacos Birria', precio: 190, descripcion: 'Orden de 4 tacos con doble tortilla, mozarella, salsa aguacate, salsa roja, cebolla con cilantro y limones. Incluye 5 oz de caldo.', opciones: [] },
      { nombre: 'Tacos Pastor-cerdo', precio: 160, descripcion: 'Orden de 4 tacos de pastor-cerdo con doble tortilla, mozarella, salsa aguacate, salsa roja, cebolla con cilantro y limones.', opciones: [] },
      { nombre: 'Tacos Pollo', precio: 160, descripcion: 'Orden de 4 tacos de pollo con doble tortilla, mozarella, salsa aguacate, salsa roja, cebolla con cilantro y limones.', opciones: [] },
      { nombre: 'Tacos Cerdo', precio: 160, descripcion: 'Orden de 4 tacos de cerdo con doble tortilla, mozarella, salsa aguacate, salsa roja, cebolla con cilantro y limones.', opciones: [] },
      { nombre: 'Tacos Mixto', precio: 160, descripcion: 'Orden de 4 tacos mixtos (cerdo y pollo) con doble tortilla, mozarella, salsa aguacate, salsa roja, cebolla con cilantro y limones.', opciones: [] },
    ],
  },
  {
    id: 'burritos',
    nombre: 'Burritos',
    orden: 3,
    items: [
      { nombre: 'Burrito Pastor-cerdo', precio: 170, descripcion: 'Tortilla de harina con frijoles molidos, mozarella, queso rayado y carne. Incluye crema, salsa guacamole y roja, ensalada de lechuga con tomate y limón.', opciones: [] },
      { nombre: 'Burrito Pastor-cerdo Combo', precio: 230, descripcion: 'Burrito Pastor-cerdo más papas fritas y gaseosa 355ml.', opciones: [] },
      { nombre: 'Burrito Pollo', precio: 160, descripcion: 'Tortilla de harina con frijoles molidos, mozarella, queso rayado y pollo. Incluye crema, salsa guacamole y roja.', opciones: [] },
      { nombre: 'Burrito Pollo Combo', precio: 220, descripcion: 'Burrito Pollo más papas fritas y gaseosa 355ml.', opciones: [] },
      { nombre: 'Burrito Atún', precio: 170, descripcion: 'Tortilla de harina con frijoles molidos, mozarella, queso rayado y atún. Incluye crema, salsa guacamole y roja.', opciones: [] },
      { nombre: 'Burrito Atún Combo', precio: 240, descripcion: 'Burrito Atún más papas fritas y gaseosa 355ml.', opciones: [] },
      { nombre: 'Burrito Cerdo', precio: 160, descripcion: 'Tortilla de harina con frijoles molidos, mozarella, queso rayado y cerdo. Incluye crema, salsa guacamole y roja.', opciones: [] },
      { nombre: 'Burrito Cerdo Combo', precio: 220, descripcion: 'Burrito Cerdo más papas fritas y gaseosa 355ml.', opciones: [] },
      { nombre: 'Burrito Mixto', precio: 160, descripcion: 'Tortilla de harina con frijoles molidos, mozarella, queso rayado y carne mixta (cerdo y pollo). Incluye crema, salsa guacamole y roja.', opciones: [] },
      { nombre: 'Burrito Mixto Combo', precio: 220, descripcion: 'Burrito Mixto más papas fritas y gaseosa 355ml.', opciones: [] },
    ],
  },
  {
    id: 'nachos',
    nombre: 'Nachos',
    orden: 4,
    items: [
      { nombre: 'Nachos Pollo', precio: 200, descripcion: 'Totopos, frijoles molidos, queso rayado, mozarella, pico de gallo, cheddar, crema, salsa aguacate y roja, limones. Jalapeños opcional.', opciones: [] },
      { nombre: 'Nachos Cerdo', precio: 210, descripcion: 'Nachos con cerdo, totopos, frijoles molidos, queso rayado, mozarella, pico de gallo, cheddar, crema, salsas. Jalapeños opcional.', opciones: [] },
      { nombre: 'Nachos Mixto', precio: 210, descripcion: 'Nachos con carne mixta, totopos, frijoles molidos, queso rayado, mozarella, pico de gallo, cheddar, crema, salsas. Jalapeños opcional.', opciones: [] },
      { nombre: 'Nachos Birria', precio: 240, descripcion: 'Nachos de birria, totopos, frijoles molidos, queso rayado, mozarella, pico de gallo, cheddar, crema, salsas. Incluye 5 oz de caldo. Jalapeños opcional.', opciones: [] },
    ],
  },
  {
    id: 'quesadillas',
    nombre: 'Quesadillas',
    orden: 5,
    items: [
      { nombre: 'Quesadilla Pastor-cerdo', precio: 170, descripcion: 'Tortilla de harina con mozarella y carne. Incluye crema, salsa aguacate y roja, ensalada de lechuga con tomate y limón.', opciones: [] },
      { nombre: 'Quesadilla Pastor-cerdo Combo', precio: 230, descripcion: 'Quesadilla Pastor-cerdo más papas fritas y gaseosa 355ml.', opciones: [] },
      { nombre: 'Quesadilla Pollo', precio: 160, descripcion: 'Tortilla de harina con mozarella y pollo. Incluye crema, salsa aguacate y roja.', opciones: [] },
      { nombre: 'Quesadilla Pollo Combo', precio: 220, descripcion: 'Quesadilla Pollo más papas fritas y gaseosa 355ml.', opciones: [] },
      { nombre: 'Quesadilla Cerdo', precio: 160, descripcion: 'Tortilla de harina con mozarella y cerdo. Incluye crema, salsa aguacate y roja.', opciones: [] },
      { nombre: 'Quesadilla Cerdo Combo', precio: 220, descripcion: 'Quesadilla Cerdo más papas fritas y gaseosa 355ml.', opciones: [] },
      { nombre: 'Quesadilla Mixto', precio: 160, descripcion: 'Tortilla de harina con mozarella y carne mixta (cerdo y pollo). Incluye crema, salsa aguacate y roja.', opciones: [] },
      { nombre: 'Quesadilla Mixto Combo', precio: 220, descripcion: 'Quesadilla Mixto más papas fritas y gaseosa 355ml.', opciones: [] },
    ],
  },
  {
    id: 'papas-fritas',
    nombre: 'Papas Fritas',
    orden: 6,
    items: [
      { nombre: 'Papas Peor es Nada', precio: 80, descripcion: 'Papas fritas con salsa de tomate y cheddar.', opciones: [] },
      { nombre: 'Papas De Calle', precio: 100, descripcion: 'Papas fritas bañadas en salsa dulce, salsa de tomate, cheddar y queso rayado.', opciones: [] },
      { nombre: 'Papas Premium', precio: 140, descripcion: 'Papas fritas con salchicha parrillera, bañadas en salsa dulce, cheddar y salsa de tomate. Jalapeños opcional.', opciones: [] },
      { nombre: 'Papas Nivel 100', precio: 220, descripcion: 'Papas fritas con carne, salchicha parrillera y jumbo, bañadas con mozarella, salsa dulce, cheddar, tomate, roja. Salsa roja y aguacate aparte. Jalapeños opcional.', opciones: [] },
    ],
  },
  {
    id: 'hot-dogs',
    nombre: 'Hot-Dogs',
    orden: 7,
    items: [
      { nombre: 'Hot-Dog Nivel 100', precio: 150, descripcion: '2 salchichas parrilleras ahumadas, mayonesa, mostaza, salsa de tomate, bacon, chimichurri, cebolla caramelizada, cheddar y mozarella. Jalapeños opcional.', opciones: ['Aderezo picante', 'BBQ', 'Salsa dulce'] },
      { nombre: 'Hot-Dog Nivel 100 Combo', precio: 210, descripcion: 'Hot-Dog Nivel 100 más gaseosa, papas fritas, salsa roja y de aguacate.', opciones: ['Aderezo picante', 'BBQ', 'Salsa dulce'] },
      { nombre: 'Birri-Dog', precio: 190, descripcion: 'Salchicha jumbo, mayonesa, mozarella, cebolla con cilantro, carne y caldo de birria, salsa aguacate, salsa roja, limón. Incluye 5 oz de caldo. Jalapeños opcional.', opciones: [] },
    ],
  },
  {
    id: 'subs',
    nombre: 'SUB-URBAN — Subs',
    orden: 8,
    items: [
      { nombre: 'Sub Trilogía de Jamones', precio: 260, descripcion: '20cm. Jamón de pavo, serrano y pollo, queso blanco y amarillo, lechuga, tomate, pepino, aceite de oliva, sal y pimienta. Incluye papas, gaseosa y 3 aderezos de 1oz. Aderezos disponibles: mostaza miel, crema fría de pepino, arándanos.', opciones: [] },
      { nombre: 'Sub Pollito Travieso', precio: 240, descripcion: '20cm. Fajitas de pollo, queso americano, mozarella, lechuga, tomate, pepino, cebolla, sal y pimienta. Incluye papas, gaseosa y 3 aderezos de 1oz. Aderezos: cheddar, ranch, mostaza miel.', opciones: [] },
      { nombre: 'Sub SubZerdo', precio: 260, descripcion: '20cm. Cerdo, mozarella, queso americano, lechuga, cebolla, tomate, pepino, sal y pimienta. Incluye papas, gaseosa y 3 aderezos. Aderezos: BBQ, salsa aguacate, chipotle dulce.', opciones: [] },
      { nombre: 'Sub Birria Bomb', precio: 280, descripcion: '20cm. Carne de res a la birria, mozarella, lechuga, tomate, pepino, cebolla, cilantro. Incluye 5 oz de caldo, papas, gaseosa y 3 aderezos. Aderezos: salsa aguacate, jalapeño dulce, arándanos.', opciones: [] },
    ],
  },
  {
    id: 'bebidas',
    nombre: 'Bebidas',
    orden: 9,
    items: [
      { nombre: 'Coca Cola 355ml', precio: 30, descripcion: 'Refresco Coca Cola lata 355ml.', opciones: [] },
      { nombre: 'Fresca 355ml', precio: 30, descripcion: 'Refresco Fresca lata 355ml.', opciones: [] },
      { nombre: 'Hi-C Té Limón', precio: 30, descripcion: 'Refresco Hi-C sabor té limón.', opciones: [] },
      { nombre: 'Canada Dry Ginger Ale', precio: 30, descripcion: 'Refresco Canada Dry Ginger Ale.', opciones: [] },
    ],
  },
  {
    id: 'extras',
    nombre: 'Extras',
    orden: 10,
    items: [
      { nombre: 'Salsa aguacate', precio: 20, descripcion: 'Extra salsa de aguacate.', opciones: [] },
      { nombre: 'Salsa roja', precio: 10, descripcion: 'Extra salsa roja.', opciones: [] },
      { nombre: 'Salsa picante REDHOT', precio: 25, descripcion: 'Extra salsa picante REDHOT.', opciones: [] },
      { nombre: 'Salsa dulce', precio: 20, descripcion: 'Extra salsa dulce.', opciones: [] },
      { nombre: 'Salsa de tomate', precio: 10, descripcion: 'Extra salsa de tomate.', opciones: [] },
      { nombre: 'Cheddar', precio: 20, descripcion: 'Extra queso cheddar.', opciones: [] },
      { nombre: 'BBQ', precio: 20, descripcion: 'Extra salsa BBQ.', opciones: [] },
      { nombre: 'Ranch', precio: 20, descripcion: 'Extra aderezo ranch.', opciones: [] },
      { nombre: 'Mayonesa', precio: 10, descripcion: 'Extra mayonesa.', opciones: [] },
      { nombre: 'Queso Mozarella', precio: 20, descripcion: 'Extra queso mozarella.', opciones: [] },
      { nombre: 'Queso Americano', precio: 10, descripcion: 'Extra queso americano.', opciones: [] },
      { nombre: 'Jamón', precio: 20, descripcion: 'Extra jamón.', opciones: [] },
      { nombre: 'Bacon', precio: 20, descripcion: 'Extra bacon.', opciones: [] },
      { nombre: 'Salchicha parrillera', precio: 30, descripcion: 'Extra salchicha parrillera.', opciones: [] },
      { nombre: 'Salchicha jumbo', precio: 30, descripcion: 'Extra salchicha jumbo.', opciones: [] },
      { nombre: 'Papas fritas extra', precio: 45, descripcion: 'Porción extra de papas fritas.', opciones: [] },
      { nombre: 'Taco de la misma orden', precio: 50, descripcion: 'Taco adicional de la misma orden.', opciones: [] },
      { nombre: 'Quesabirria', precio: 70, descripcion: 'Quesabirria adicional.', opciones: [] },
    ],
  },
];

async function seed() {
  console.log('Iniciando seed del menú de Urbano...');

  await setDoc(doc(db, 'restaurantes', RESTAURANTE_ID), restauranteConfig);
  console.log(`✓ Restaurante "${RESTAURANTE_ID}" creado`);

  for (const categoria of menu) {
    const { id, ...data } = categoria;
    await setDoc(doc(collection(db, 'restaurantes', RESTAURANTE_ID, 'menu'), id), data);
    console.log(`✓ Categoría "${data.nombre}" (${data.items.length} items)`);
  }

  console.log('\n✅ Seed completado. Menú de Urbano cargado en Firestore.');
  process.exit(0);
}

seed().catch((err) => {
  console.error('Error en seed:', err);
  process.exit(1);
});
