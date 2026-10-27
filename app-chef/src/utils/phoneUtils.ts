/**
 * Utilidades para formatear y sanitizar números de teléfono en el panel KDS.
 */

export function extractDigits(val?: string | number | null): string {
  if (!val) return '';
  return String(val).replace(/\D/g, '');
}

/**
 * Deduplica y sanea un número de teléfono para mostrarlo o copiarlo al repartidor (delivery).
 * Resuelve duplicaciones accidentales generadas por modelos de IA o copias repetidas
 * (ej: "58544518558544518" o "5854451858544518" -> "58544518").
 */
export function formatDeliveryPhone(rawPhone?: string | number | null): string {
  if (!rawPhone) return '';
  const str = String(rawPhone).trim();
  if (!str) return '';

  let digits = extractDigits(str);
  if (!digits) return str;

  // 1. Repetición exacta de mitades (ej: "5854451858544518" de 16 dígitos)
  if (digits.length % 2 === 0 && digits.length >= 14) {
    const half = digits.length / 2;
    if (digits.slice(0, half) === digits.slice(half)) {
      digits = digits.slice(0, half);
    }
  }

  // 2. Prefijo 505 repetido (ej: "5055854451858544518")
  if (digits.startsWith('505') && digits.length >= 16) {
    const national = digits.slice(3, 11);
    if (/^[25678]\d{7}$/.test(national)) {
      digits = national;
    }
  }

  // 3. Inicio y final coinciden con bloque de 8 dígitos (ej: "58544518558544518" de 17 dígitos)
  if (digits.length > 8) {
    const start8 = digits.slice(0, 8);
    const end8 = digits.slice(-8);
    if (/^[25678]\d{7}$/.test(start8) && start8 === end8) {
      digits = start8;
    }
  }

  // 4. Bloque de 8 dígitos repetido dentro de la cadena
  if (digits.length > 8) {
    const start8 = digits.slice(0, 8);
    if (/^[25678]\d{7}$/.test(start8) && digits.indexOf(start8, 1) !== -1) {
      digits = start8;
    }
    const end8 = digits.slice(-8);
    if (/^[25678]\d{7}$/.test(end8) && digits.indexOf(end8) < digits.length - 8) {
      digits = end8;
    }
  }

  // Normalizar Nicaragua: si tiene 11 dígitos y empieza con 505
  if (digits.length === 11 && digits.startsWith('505')) {
    const nat = digits.slice(3);
    if (/^[25678]\d{7}$/.test(nat)) {
      return nat;
    }
  }

  if (digits.length === 8 && /^[25678]\d{7}$/.test(digits)) {
    return digits;
  }

  if (str.startsWith('+') && digits.length >= 8 && digits.length <= 15) {
    return `+${digits}`;
  }

  return digits || str;
}
