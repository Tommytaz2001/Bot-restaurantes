const { db } = require('../services/firebaseService');
const { validateOrder } = require('./orderValidator');
const {
  collection, doc, setDoc, getDoc, query, where, getDocs, serverTimestamp,
} = require('firebase/firestore');
const { randomUUID } = require('crypto');

function buildEstado(metodoPago) {
  return metodoPago === 'efectivo' ? 'pendiente_pago' : 'pendiente';
}

async function findExistingOrder(sessionId) {
  const q = query(
    collection(db, 'pedidos'),
    where('sessionId', '==', sessionId),
    where('estado', 'in', ['pendiente', 'pendiente_pago']),
  );
  const snapshot = await getDocs(q);
  if (snapshot.empty) return null;
  const d = snapshot.docs[0];
  return { id: d.id, ...d.data() };
}

async function saveOrder(orderData) {
  // Check for duplicate active order in same session
  const existing = await findExistingOrder(orderData.sessionId);
  if (existing) return existing;

  // Validate schema
  validateOrder(orderData);

  const id = randomUUID();
  const pedido = {
    ...orderData,
    estado: buildEstado(orderData.metodo_pago),
    comprobante_url: null,
    createdAt: serverTimestamp(),
    productos: orderData.productos.map((p) => ({
      ...p,
      opcion: p.opcion ?? null,
    })),
  };

  await setDoc(doc(db, 'pedidos', id), pedido);
  return { id, ...pedido };
}

async function getOrder(id) {
  const snapshot = await getDoc(doc(db, 'pedidos', id));
  if (!snapshot.exists()) return null;
  return { id: snapshot.id, ...snapshot.data() };
}

module.exports = { saveOrder, getOrder };
