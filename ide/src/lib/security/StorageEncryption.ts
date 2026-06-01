/**
 * StorageEncryption.ts
 *
 * Provides AES-GCM encryption / decryption wrappers backed by PBKDF2
 * key derivation for securing sensitive identity secrets (private keys)
 * stored in IndexedDB.
 *
 * Security properties:
 *  - AES-256-GCM (authenticated encryption with 128-bit tag)
 *  - PBKDF2 with SHA-256, 600 000 iterations (OWASP 2023 recommendation)
 *  - 128-bit random salt per encryption operation
 *  - 96-bit random IV per encryption operation
 *  - Zero raw secret ever written to console or logs
 */

// ─── Constants ────────────────────────────────────────────────────────────────

const PBKDF2_ITERATIONS = 600_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;
const KEY_LENGTH_BITS = 256;

// Prefix written at the start of every encrypted blob so we can distinguish
// encrypted values from legacy plain-text ones during migration.
const ENCRYPTED_PREFIX = "enc:v1:";

// ─── Internal helpers ─────────────────────────────────────────────────────────

function bufToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBuf(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function deriveKey(
  passphrase: string,
  salt: Uint8Array,
  usage: KeyUsage[]
): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt,
      iterations: PBKDF2_ITERATIONS,
    },
    baseKey,
    { name: "AES-GCM", length: KEY_LENGTH_BITS },
    false,
    usage
  );
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Encrypts a plain-text string with AES-256-GCM using a passphrase-derived key.
 *
 * The returned string has the form:
 *   "enc:v1:<base64(salt)>:<base64(iv)>:<base64(ciphertext+tag)>"
 *
 * @param plaintext  The value to encrypt (e.g. a Stellar secret key).
 * @param passphrase A user-supplied or derived passphrase.  Never logged.
 */
export async function encryptSecret(
  plaintext: string,
  passphrase: string
): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));

  const key = await deriveKey(passphrase, salt, ["encrypt"]);

  const encoder = new TextEncoder();
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoder.encode(plaintext)
  );

  return (
    ENCRYPTED_PREFIX +
    bufToBase64(salt.buffer as ArrayBuffer) +
    ":" +
    bufToBase64(iv.buffer as ArrayBuffer) +
    ":" +
    bufToBase64(ciphertext)
  );
}

/**
 * Decrypts a value that was produced by `encryptSecret`.
 *
 * @throws {Error} if the passphrase is wrong or the ciphertext is corrupted.
 */
export async function decryptSecret(
  encrypted: string,
  passphrase: string
): Promise<string> {
  if (!encrypted.startsWith(ENCRYPTED_PREFIX)) {
    throw new Error(
      "[StorageEncryption] Value does not appear to be an encrypted blob."
    );
  }

  const payload = encrypted.slice(ENCRYPTED_PREFIX.length);
  const parts = payload.split(":");
  if (parts.length !== 3) {
    throw new Error("[StorageEncryption] Malformed encrypted blob.");
  }

  const [saltB64, ivB64, ciphertextB64] = parts;
  const salt = base64ToBuf(saltB64);
  const iv = base64ToBuf(ivB64);
  const ciphertext = base64ToBuf(ciphertextB64);

  const key = await deriveKey(passphrase, salt, ["decrypt"]);

  let plainBuffer: ArrayBuffer;
  try {
    plainBuffer = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      ciphertext
    );
  } catch {
    // Do NOT include the passphrase or any key material in the error message.
    throw new Error(
      "[StorageEncryption] Decryption failed — wrong passphrase or tampered data."
    );
  }

  return new TextDecoder().decode(plainBuffer);
}

/**
 * Returns `true` if the value looks like it was produced by `encryptSecret`.
 */
export function isEncrypted(value: string): boolean {
  return value.startsWith(ENCRYPTED_PREFIX);
}

/**
 * Migrates a legacy plain-text secret by encrypting it in-place.
 *
 * If the value is already encrypted the original is returned unchanged so this
 * function is idempotent and safe to call on every load.
 *
 * @returns `{ encrypted, changed }` — `changed` is `true` when the value was
 *          actually re-encrypted so callers know to persist the update.
 */
export async function migrateSecretIfNeeded(
  secretKey: string,
  passphrase: string
): Promise<{ encrypted: string; changed: boolean }> {
  if (isEncrypted(secretKey)) {
    return { encrypted: secretKey, changed: false };
  }
  const encrypted = await encryptSecret(secretKey, passphrase);
  return { encrypted, changed: true };
}

/**
 * Convenience: decrypt if encrypted, or pass through if plain-text.
 *
 * Used during store hydration where the stored value might be a legacy
 * plain-text key or a freshly migrated encrypted blob.
 */
export async function resolveSecret(
  storedValue: string,
  passphrase: string
): Promise<string> {
  if (!isEncrypted(storedValue)) {
    return storedValue;
  }
  return decryptSecret(storedValue, passphrase);
}
