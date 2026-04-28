import {
  normalizeXdrPayload,
  validateBase64XdrPayload,
} from "@/utils/XdrValidator";

const SHA256_HEX_PATTERN = /^[a-f0-9]{64}$/;

export interface XdrChecksumResult {
  normalizedXdr: string;
  checksum: string;
}

export interface XdrChecksumVerificationResult extends XdrChecksumResult {
  expectedChecksum: string;
  matches: boolean;
}

const getCryptoApi = () => {
  if (!globalThis.crypto?.subtle) {
    throw new Error("SHA-256 checksum support is unavailable in this environment.");
  }

  return globalThis.crypto;
};

const bytesToHex = (bytes: Uint8Array) =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

async function sha256Hex(value: string): Promise<string> {
  const digest = await getCryptoApi().subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );

  return bytesToHex(new Uint8Array(digest));
}

export function normalizeSha256Checksum(input: string): string {
  const compact = input.trim().replace(/\s+/g, "").toLowerCase();
  const normalized = compact.startsWith("0x") ? compact.slice(2) : compact;

  if (!SHA256_HEX_PATTERN.test(normalized)) {
    throw new Error("Checksum must be a 64-character SHA-256 hex string.");
  }

  return normalized;
}

export async function checksumXdrPayload(input: string): Promise<XdrChecksumResult> {
  const normalizedXdr = normalizeXdrPayload(input);
  const validationError = validateBase64XdrPayload(normalizedXdr);

  if (validationError) {
    throw new Error(validationError.error);
  }

  return {
    normalizedXdr,
    checksum: await sha256Hex(normalizedXdr),
  };
}

export async function verifyXdrChecksum(
  input: string,
  expectedChecksumInput: string,
): Promise<XdrChecksumVerificationResult> {
  const { normalizedXdr, checksum } = await checksumXdrPayload(input);
  const expectedChecksum = normalizeSha256Checksum(expectedChecksumInput);

  return {
    normalizedXdr,
    checksum,
    expectedChecksum,
    matches: checksum === expectedChecksum,
  };
}
