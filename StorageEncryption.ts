/**
 * StorageEncryption.ts
 * 
 * Handles AES-GCM encryption and decryption of sensitive local data
 * using the Web Crypto API. Designed for protecting Guest identity
 * secrets and private keys before persistence in IndexedDB/LocalStorage.
 */

export interface EncryptedData {
  cipherText: string;
  iv: string;
  salt: string;
}

// PBKDF2 Configuration
const ITERATIONS = 100000;
const KEY_LENGTH = 256;
const DIGEST = "SHA-256";

/**
 * Converts an ArrayBuffer to a Base64 string.
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Converts a Base64 string to an ArrayBuffer.
 */
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Derives an AES-GCM key from a passphrase and a salt using PBKDF2.
 */
async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(passphrase),
    { name: "PBKDF2" },
    false,
    ["deriveBits", "deriveKey"]
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt,
      iterations: ITERATIONS,
      hash: DIGEST
    },
    keyMaterial,
    { name: "AES-GCM", length: KEY_LENGTH },
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * Encrypts a string secret (e.g., a private key) using a passphrase.
 * Returns a JSON string containing the ciphertext, IV, and salt (all Base64 encoded).
 */
export async function encryptSecret(secret: string, passphrase: string): Promise<string> {
  const encoder = new TextEncoder();
  
  // Generate random salt and IV
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV recommended for AES-GCM

  const key = await deriveKey(passphrase, salt);

  const cipherBuffer = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: iv
    },
    key,
    encoder.encode(secret)
  );

  const payload: EncryptedData = {
    cipherText: arrayBufferToBase64(cipherBuffer),
    iv: arrayBufferToBase64(iv.buffer),
    salt: arrayBufferToBase64(salt.buffer)
  };

  return JSON.stringify(payload);
}

/**
 * Decrypts a JSON payload containing the ciphertext, IV, and salt using the original passphrase.
 */
export async function decryptSecret(encryptedPayload: string, passphrase: string): Promise<string> {
  const payload: EncryptedData = JSON.parse(encryptedPayload);
  
  const salt = new Uint8Array(base64ToArrayBuffer(payload.salt));
  const iv = new Uint8Array(base64ToArrayBuffer(payload.iv));
  const cipherBuffer = base64ToArrayBuffer(payload.cipherText);

  const key = await deriveKey(passphrase, salt);

  const decryptedBuffer = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: iv
    },
    key,
    cipherBuffer
  );

  const decoder = new TextDecoder();
  return decoder.decode(decryptedBuffer);
}

/**
 * Checks if a given string is a valid encrypted payload.
 * Useful for migration logic to detect unencrypted legacy secrets.
 */
export function isEncryptedPayload(payload: string): boolean {
  try {
    const parsed = JSON.parse(payload) as Partial<EncryptedData>;
    return !!(parsed && parsed.cipherText && parsed.iv && parsed.salt);
  } catch {
    return false;
  }
}

/**
 * Migrates a legacy unencrypted secret to an encrypted payload.
 */
export async function migrateLegacySecret(secret: string, passphrase: string): Promise<string> {
  if (isEncryptedPayload(secret)) {
    return secret; // Already encrypted
  }
  return encryptSecret(secret, passphrase);
}