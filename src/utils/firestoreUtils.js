/**
 * Serializa un documento de Firestore a un objeto JSON-safe.
 * Convierte Timestamp → ISO string recursivamente.
 */
function serializeDoc(data) {
  if (data === null || data === undefined) return data;

  if (typeof data === 'object' && typeof data.toDate === 'function') {
    return data.toDate().toISOString();
  }

  if (Array.isArray(data)) {
    return data.map(serializeDoc);
  }

  if (typeof data === 'object') {
    const result = {};
    for (const [key, value] of Object.entries(data)) {
      result[key] = serializeDoc(value);
    }
    return result;
  }

  return data;
}

module.exports = { serializeDoc };
