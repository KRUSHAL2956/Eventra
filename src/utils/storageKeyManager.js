import CryptoJS from "crypto-js";

const SALT_KEY = "eventra:storage-key-salt";

const getOrCreateSalt = () => {
  if (typeof window === "undefined" || typeof localStorage === "undefined") {
    return "eventra-fallback-salt";
  }
  try {
    let stored = localStorage.getItem(SALT_KEY);
    if (!stored) {
      // Generate 256-bit random salt
      const bytes = crypto.getRandomValues(new Uint8Array(32));
      stored = btoa(String.fromCharCode(...bytes));
      localStorage.setItem(SALT_KEY, stored);
    }
    return stored;
  } catch {
    return "eventra-fallback-salt";
  }
};

const bufferToHex = (buffer) => {
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
};

const fallbackHash = (str) => {
  try {
    if (typeof CryptoJS !== "undefined" && CryptoJS.SHA256) {
      return CryptoJS.SHA256(str).toString();
    }
  } catch {}
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const chr = str.charCodeAt(i);
    hash = (hash << 5) - hash + chr;
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
};

/**
 * Generate a salted, opaque namespace key for storage.
 * 
 * @param {string} namespace 
 * @param {string} userId 
 * @returns {Promise<string>} Opaque key
 */
export const getOpaqueKey = async (namespace, userId) => {
  const normalizedUserId = userId || "guest";
  const salt = getOrCreateSalt();
  const rawString = `${namespace}:${normalizedUserId}:${salt}`;

  if (typeof crypto !== "undefined" && crypto.subtle && crypto.subtle.digest) {
    try {
      const buffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(rawString));
      return `${namespace}_${bufferToHex(buffer)}`;
    } catch {
      // Fall through to fallback
    }
  }

  return `${namespace}_${fallbackHash(rawString)}`;
};

/**
 * Retrieve the opaque key and perform a non-destructive migration if legacy key exists.
 * 
 * @param {string} namespace 
 * @param {string} userId 
 * @param {string} legacyKey 
 * @returns {Promise<string>} Opaque key
 */
export const getOrMigrateKey = async (namespace, userId, legacyKey) => {
  const opaqueKey = await getOpaqueKey(namespace, userId);
  
  if (typeof window === "undefined" || typeof localStorage === "undefined") {
    return opaqueKey;
  }

  try {
    const existingOpaque = localStorage.getItem(opaqueKey);
    if (existingOpaque === null) {
      const legacyValue = localStorage.getItem(legacyKey);
      if (legacyValue !== null) {
        localStorage.setItem(opaqueKey, legacyValue);
        localStorage.removeItem(legacyKey);
      }
    }
  } catch (e) {
    // Non-fatal, e.g. localStorage full or blocked
  }

  return opaqueKey;
};
