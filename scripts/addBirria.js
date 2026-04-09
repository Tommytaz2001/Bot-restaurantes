/**
 * Agrega la categoría BIRRIA al menú de Firestore (cambio en caliente).
 * Ejecutar: node scripts/addBirria.js
 */
require('dotenv').config();
const { db } = require('../src/services/firebaseService');
const { doc, setDoc, collection } = require('firebase/firestore');

const RESTAURANTE_ID = process.env.RESTAURANTE_ID || 'urbano';

const birria = {
  nombre: 'Birria',
  orden: 3,
  items: [
    {
      nombre: 'Nachos de Birria',
      precio: 240,
      descripcion: 'Totopos, frijoles molidos, carne y caldo de birria, mozarella, queso rayado, pico de gallo, bañados con crema dulce y cheddar, limones, salsa de aguacate y roja. Jalapeños-opcional.',
      disponible: true,
      opciones: ['Sin jalapeños'],
    },
    {
      nombre: 'Birriamen 1 Lt',
      precio: 210,
      descripcion: 'Fideos de maruchan ramen con caldo y carne de birria, mozarella, salsa de aguacate y roja, cebolla con cilantro, limón. Jalapeños-opcional (servidos dentro del envase).',
      disponible: true,
      opciones: ['Sin jalapeños'],
    },
    {
      nombre: 'Birriamen 2.0',
      precio: 350,
      descripcion: 'Fideos de maruchan ramen con carne y caldo de birria, camarones reales, mozarella, rábanos, maicitos, chícharos, limón, salsa roja, salsa de aguacate, cebolla con cilantro. Incluye dos tortillas con mozarella. Jalapeños-opcional (servidos dentro del envase).',
      disponible: true,
      opciones: ['Sin jalapeños'],
    },
    {
      nombre: 'Burrito de Birria',
      precio: 180,
      descripcion: 'Tortilla de harina, frijoles molidos, mozarella, carne de birria, cebolla, salsa de aguacate, salsa roja, ensalada de lechuga con tomate, limón y crema. Incluye 5 oz de caldo.',
      disponible: true,
      opciones: [],
    },
    {
      nombre: 'Quesabirrias',
      precio: 210,
      descripcion: 'Orden de 3 quesabirrias con tortilla de maíz, mozarella, carne de birria, limones, salsa roja, salsa de aguacate, cebolla con cilantro. Incluye 5 oz de caldo.',
      disponible: true,
      opciones: [],
    },
    {
      nombre: 'Tacos de Birria',
      precio: 190,
      descripcion: 'Orden de 4 taquitos con doble tortilla de maíz, mozarella, limones, cebolla picada con cilantro, salsa de aguacate, salsa roja. Incluye 5 oz de caldo.',
      disponible: true,
      opciones: [],
    },
    {
      nombre: 'Birri-Dog',
      precio: 190,
      descripcion: 'Salchicha jumbo, mayonesa, mozarella, cebolla con cilantro, carne y caldo de birria, salsa de aguacate, salsa roja, limón. Incluye 5 oz de caldo. Jalapeños-opcional.',
      disponible: true,
      opciones: ['Sin jalapeños'],
    },
  ],
};

async function run() {
  console.log(`Agregando categoría "${birria.nombre}" al menú de ${RESTAURANTE_ID}...`);
  await setDoc(
    doc(collection(db, 'restaurantes', RESTAURANTE_ID, 'menu'), 'birria'),
    birria,
  );
  console.log(`✅ Categoría "Birria" creada con ${birria.items.length} items.`);
  console.log('   El bot la tomará en la próxima consulta de menú (caché TTL: 5 min).');
  process.exit(0);
}

run().catch((err) => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
