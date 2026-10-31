/**
 * Utilidades para saneamiento, deduplicación y normalización de números telefónicos.
 * Diseñado especialmente para evitar que la IA o el usuario almacenen números duplicados
 * (como "5854451858544518" o "58544518558544518") al copiar o despachar órdenes de delivery.
 */

function extractDigits(val) {
  if (!val) return '';
  return String(val).replace(/\D/g, '');
}

/**
 * Detecta y elimina repeticiones directas o asimétricas de números telefónicos contiguos.
 * @param {string} digits - Solo dígitos
 * @returns {string} Dígitos sin repeticiones
 */
function deduplicateDigits(digits) {
  if (!digits || digits.length < 8) return digits;

  // 1. Repetición exacta de dos mitades (ej: "5854451858544518" -> 16 dígitos / 2 = 8)
  if (digits.length % 2 === 0 && digits.length >= 14) {
    const half = digits.length / 2;
    if (digits.slice(0, half) === digits.slice(half)) {
      return deduplicateDigits(digits.slice(0, half));
    }
  }

  // 2. Prefijo 505 repetido (ej: "5055854451858544518" o "5854451850558544518")
  if (digits.startsWith('505') && digits.length >= 16) {
    const national = digits.slice(3, 11);
    if (/^[25678]\d{7}$/.test(national)) {
      const rest = digits.slice(11);
      if (rest.includes(national)) {
        return national;
      }
    }
  }
  if (digits.length >= 16 && digits.slice(8).startsWith('505')) {
    const head = digits.slice(0, 8);
    const national = digits.slice(11, 19);
    if (head === national && /^[25678]\d{7}$/.test(head)) {
      return head;
    }
  }

  // 3. Bloque de 8 dígitos repetido al inicio y al final (ej: "58544518558544518" de 17 dígitos)
  if (digits.length > 8) {
    const start8 = digits.slice(0, 8);
    const end8 = digits.slice(-8);
    if (/^[25678]\d{7}$/.test(start8) && start8 === end8) {
      return start8;
    }
  }

  // 4. Bloque de 8 dígitos nicaragüense que aparece repetido dentro de la cadena
  if (digits.length > 8) {
    const start8 = digits.slice(0, 8);
    if (/^[25678]\d{7}$/.test(start8) && digits.indexOf(start8, 1) !== -1) {
      return start8;
    }
    const end8 = digits.slice(-8);
    if (/^[25678]\d{7}$/.test(end8) && digits.indexOf(end8) < digits.length - 8) {
      return end8;
    }
  }

  return digits;
}

/**
 * Procesa un fragmento individual de número telefónico.
 */
function cleanSinglePhone(str, fallbackDigits = null) {
  if (!str) return null;
  let digits = extractDigits(str);
  if (!digits) return null;

  // Si tenemos un fallback conocido de Nicaragua (ej: "58544518") y digits lo contiene duplicado
  if (fallbackDigits && fallbackDigits.length === 8 && /^[25678]\d{7}$/.test(fallbackDigits)) {
    if (digits.length > 8 && digits.includes(fallbackDigits)) {
      digits = fallbackDigits;
    }
  }

  digits = deduplicateDigits(digits);

  // Normalización para Nicaragua:
  // Si tiene 11 dígitos y empieza con 505 (ej: "50558544518")
  if (digits.length === 11 && digits.startsWith('505')) {
    const nat = digits.slice(3);
    if (/^[25678]\d{7}$/.test(nat)) {
      return nat;
    }
  }

  // Si tiene 8 dígitos válidos en Nicaragua
  if (digits.length === 8 && /^[25678]\d{7}$/.test(digits)) {
    return digits;
  }

  // Si es un número internacional con prefijo '+' en el string original
  if (String(str).trim().startsWith('+') && digits.length >= 8 && digits.length <= 15) {
    if (digits.startsWith('505') && digits.length === 11) {
      return digits.slice(3);
    }
    return `+${digits}`;
  }

  // Caso general: 8 a 15 dígitos
  if (digits.length >= 8 && digits.length <= 15) {
    if (digits.startsWith('505') && digits.length === 11) {
      return digits.slice(3);
    }
    return digits;
  }

  return digits || null;
}

/**
 * Normaliza y sanea un número telefónico, eliminando duplicados o concatenaciones accidentales.
 *
 * @param {string|number|null} rawPhone - Número recibido (del LLM, formulario o webhook).
 * @param {string|number|null} [fallbackPhone] - Número de referencia (de sesión o WhatsApp).
 * @returns {string|null} Número saneado (ej: "58544518") o null si no hay número válido.
 */
function cleanPhoneNumber(rawPhone, fallbackPhone = null) {
  if (!rawPhone && !fallbackPhone) return null;

  // Extraer dígitos del fallback si existe
  let fallbackDigits = null;
  if (fallbackPhone) {
    const fd = extractDigits(fallbackPhone);
    if (fd.length === 11 && fd.startsWith('505')) {
      fallbackDigits = fd.slice(3);
    } else if (fd.length === 8) {
      fallbackDigits = fd;
    }
  }

  const input = rawPhone || fallbackPhone;
  const str = String(input).trim();
  if (!str) return fallbackDigits || null;

  // Si hay separadores comunes (/, ;, ,, " y ", " o ", nueva línea)
  const partes = str
    .split(/[/,;\n]|\s+y\s+|\s+o\s+/i)
    .map(p => p.trim())
    .filter(Boolean);

  if (partes.length > 1) {
    const limpias = partes.map(p => cleanSinglePhone(p, fallbackDigits)).filter(Boolean);
    const unicas = [...new Set(limpias)];
    if (unicas.length > 0) {
      // Si alguna coincide con el fallback, priorizarla
      if (fallbackDigits && unicas.includes(fallbackDigits)) {
        return fallbackDigits;
      }
      return unicas[0];
    }
  }

  return cleanSinglePhone(str, fallbackDigits) || fallbackDigits || null;
}

/**
 * Verifica si un número telefónico pertenece al administrador / dueño del restaurante / instancia local
 * a partir de las variables de entorno configuradas (NOTIFICAR_DESPLIEGUE_TELEFONO).
 * Un número de administrador NUNCA debe asignarse como teléfono de contacto de un cliente.
 *
 * @param {string|number|null} phone - Número a verificar
 * @returns {boolean} true si coincide con el número del dueño/administrador
 */
function isAdminOrOwnerPhone(phone) {
  if (!phone) return false;
  const digits = extractDigits(phone);
  if (!digits || digits.length < 7) return false;

  const adminEnv = process.env.NOTIFICAR_DESPLIEGUE_TELEFONO || '';
  if (!adminEnv.trim()) return false;

  const adminList = adminEnv.split(',').map(s => extractDigits(s)).filter(Boolean);

  for (const admin of adminList) {
    if (!admin) continue;
    // Coincidencia exacta
    if (admin === digits) return true;

    // Comparar los últimos 8 dígitos (formato estándar de Nicaragua)
    const adminLast8 = admin.length >= 8 ? admin.slice(-8) : admin;
    const digitsLast8 = digits.length >= 8 ? digits.slice(-8) : digits;
    if (adminLast8 === digitsLast8 && adminLast8.length === 8) {
      return true;
    }

    // Prefijo 505
    if (admin.startsWith('505') && admin.slice(3) === digits) return true;
    if (digits.startsWith('505') && digits.slice(3) === admin) return true;
  }

  return false;
}

module.exports = {
  cleanPhoneNumber,
  deduplicateDigits,
  extractDigits,
  isAdminOrOwnerPhone,
};
