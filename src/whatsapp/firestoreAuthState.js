/**
 * Implementación de auth state de Baileys que persiste en Firestore.
 * Reemplaza useMultiFileAuthState (filesystem) para funcionar en entornos
 * con filesystem efímero como Render free tier.
 */
const { initAuthCreds, BufferJSON } = require('@whiskeysockets/baileys');
const { doc, getDoc, setDoc, deleteDoc } = require('firebase/firestore');
const { db } = require('../services/firebaseService');

function sessionDocRef(restauranteId, path) {
  return doc(db, 'baileys_sessions', restauranteId, 'data', path);
}

async function readData(restauranteId, path) {
  const snap = await getDoc(sessionDocRef(restauranteId, path));
  if (!snap.exists()) return null;
  const raw = snap.data();
  // Desenvolver arrays que fueron envueltos al guardar
  const unwrapped = raw._isArray ? raw._data : raw;
  return JSON.parse(JSON.stringify(unwrapped), BufferJSON.reviver);
}

async function writeData(restauranteId, path, data) {
  const serialized = JSON.parse(JSON.stringify(data, BufferJSON.replacer));
  // Firestore no admite arrays como raíz del documento — los envolvemos
  const toStore = Array.isArray(serialized) ? { _isArray: true, _data: serialized } : serialized;
  await setDoc(sessionDocRef(restauranteId, path), toStore);
}

async function removeData(restauranteId, path) {
  await deleteDoc(sessionDocRef(restauranteId, path));
}

async function useFirestoreAuthState(restauranteId) {
  const creds = (await readData(restauranteId, 'creds')) || initAuthCreds();

  const state = {
    creds,
    keys: {
      get: async (type, ids) => {
        const data = {};
        await Promise.all(
          ids.map(async (id) => {
            const value = await readData(restauranteId, `keys_${type}_${id}`);
            if (value != null) data[id] = value;
          }),
        );
        return data;
      },
      set: async (data) => {
        await Promise.all(
          Object.entries(data).flatMap(([type, typeData]) =>
            Object.entries(typeData).map(([id, value]) =>
              value
                ? writeData(restauranteId, `keys_${type}_${id}`, value)
                : removeData(restauranteId, `keys_${type}_${id}`),
            ),
          ),
        );
      },
    },
  };

  return {
    state,
    saveCreds: async () => {
      await writeData(restauranteId, 'creds', state.creds);
    },
  };
}

module.exports = { useFirestoreAuthState };
