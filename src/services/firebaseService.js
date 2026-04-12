const { initializeApp, getApps } = require('firebase/app');
const { getFirestore } = require('firebase/firestore');
const { getStorage } = require('firebase/storage');

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
const storage = getStorage(app);

// ── Write counter para diagnosticar uso de cuota ─────────────────────────────
const _writeStats = { total: 0, bySource: {}, startedAt: Date.now() };
const _readStats = { total: 0, bySource: {}, startedAt: Date.now() };

function trackWrite(source, details = '') {
  _writeStats.total++;
  _writeStats.bySource[source] = (_writeStats.bySource[source] || 0) + 1;
  const elapsed = Math.round((Date.now() - _writeStats.startedAt) / 1000 / 60);

  console.log(
    `[📝 WRITE #${_writeStats.total}] ${source} ${details ? '- ' + details : ''} (${elapsed}min elapsed)`,
  );

  if (_writeStats.total % 10 === 0) {
    console.log(`[📊 WriteStats] Total: ${_writeStats.total} | ${JSON.stringify(_writeStats.bySource)}`);
  }
}

function trackRead(source, details = '', docCount = 0) {
  _readStats.total++;
  _readStats.bySource[source] = (_readStats.bySource[source] || 0) + 1;
  const elapsed = Math.round((Date.now() - _readStats.startedAt) / 1000 / 60);

  const docInfo = docCount > 0 ? ` [${docCount} docs]` : '';
  console.log(
    `[📖 READ #${_readStats.total}] ${source} ${details ? '- ' + details : ''}${docInfo} (${elapsed}min elapsed)`,
  );

  if (_readStats.total % 20 === 0) {
    console.log(`[📊 ReadStats] Total: ${_readStats.total} | ${JSON.stringify(_readStats.bySource)}`);
  }
}

function getWriteStats() { return { ..._writeStats, uptimeMin: Math.round((Date.now() - _writeStats.startedAt) / 1000 / 60) }; }
function getReadStats() { return { ..._readStats, uptimeMin: Math.round((Date.now() - _readStats.startedAt) / 1000 / 60) }; }

module.exports = { db, storage, trackWrite, trackRead, getWriteStats, getReadStats };
