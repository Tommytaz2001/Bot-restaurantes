const { initializeApp, getApps } = require('firebase/app');
const { getFirestore } = require('firebase/firestore');

const REQUIRED_ENV_VARS = ['FIREBASE_API_KEY', 'FIREBASE_PROJECT_ID', 'FIREBASE_STORAGE_BUCKET'];
for (const v of REQUIRED_ENV_VARS) {
  if (!process.env[v]) throw new Error(`Missing required env var: ${v}`);
}

const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: `${process.env.FIREBASE_PROJECT_ID}.firebaseapp.com`,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
};

// Evita reinicializar si ya existe (útil en tests)
const app = getApps().length === 0
  ? initializeApp(firebaseConfig)
  : getApps()[0];

const db = getFirestore(app);

module.exports = { db };
