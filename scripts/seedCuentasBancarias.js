require('dotenv').config();
const { db } = require('../src/services/firebaseService');
const { doc, setDoc } = require('firebase/firestore');

const RESTAURANTE_ID = process.env.RESTAURANTE_ID || 'urbano';

const cuentasBancarias = [
  {
    banco: 'BAC',
    moneda: 'Córdobas',
    numero: '371618588',
    titular: 'Fidel Ernesto Rivera Bello',
  },
  {
    banco: 'Láfise',
    moneda: 'Córdobas',
    numero: '134066612',
    titular: 'Fidel Ernesto Rivera Bello',
  },
];

async function seed() {
  await setDoc(doc(db, 'restaurantes', RESTAURANTE_ID), { cuentas_bancarias: cuentasBancarias }, { merge: true });
  console.log(`✅ Cuentas bancarias guardadas en restaurantes/${RESTAURANTE_ID}`);
  process.exit(0);
}

seed().catch((err) => { console.error(err); process.exit(1); });
