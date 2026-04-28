/**
 * WasmLoader.ts
 *
 * Utility for securely fetching WASM modules with Subresource Integrity (SRI)
 * checks to prevent supply chain tampering.
 */

export interface WasmHashesManifest {
  generated: string;
  algorithm: string;
  assets: Record<string, string>;
}

export interface WasmLoaderOptions {
  manifestUrl?: string;
  bypassVerification?: boolean;
}

export class SRIIntegrityError extends Error {
  readonly url: string;
  readonly expected: string;
  readonly actual: string;

  constructor(url: string, expected: string, actual: string) {
    super(
      `[SRI] Integrity check FAILED for "${url}".\n` +
        `  Expected: ${expected}\n` +
        `  Received: ${actual}\n` +
        `  Aborting load — resource may have been tampered with.`
    );
    this.name = "SRIIntegrityError";
    this.url = url;
    this.expected = expected;
    this.actual = actual;
    Object.setPrototypeOf(this, SRIIntegrityError.prototype);
  }
}

let _manifestCache: WasmHashesManifest | null = null;
let _manifestUrl = "/wasm-hashes.json";

export async function loadWasmManifest(
  manifestUrl: string = "/wasm-hashes.json"
): Promise<WasmHashesManifest | null> {
  if (_manifestCache && manifestUrl === _manifestUrl) {
    return _manifestCache;
  }

  _manifestUrl = manifestUrl;

  try {
    const res = await fetch(manifestUrl, { cache: "no-store" });
    if (!res.ok) {
      console.warn(
        `[SRI] Could not load manifest from ${manifestUrl} (HTTP ${res.status}). ` +
          `Running without integrity verification.`
      );
      return null;
    }
    _manifestCache = (await res.json()) as WasmHashesManifest;
    return _manifestCache;
  } catch (err) {
    console.warn(
      `[SRI] Failed to fetch manifest: ${(err as Error).message}. ` +
        `Running without integrity verification.`
    );
    return null;
  }
}

export function clearWasmManifestCache(): void {
  _manifestCache = null;
}

async function computeSHA384Base64(buffer: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest("SHA-384", buffer);
  const bytes = new Uint8Array(hashBuffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export async function fetchSecureWasm(
  url: string,
  options: WasmLoaderOptions = {}
): Promise<ArrayBuffer> {
  const { manifestUrl = "/wasm-hashes.json", bypassVerification = false } =
    options;

  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(
      `[SRI] Failed to fetch "${url}": HTTP ${response.status} ${response.statusText}`
    );
  }

  const buffer = await response.arrayBuffer();

  if (bypassVerification) {
    console.warn(
      `[SRI] Integrity verification BYPASSED for "${url}". Do not use in production.`
    );
    return buffer;
  }

  const manifest = await loadWasmManifest(manifestUrl);

  if (!manifest) {
    console.warn(
      `[SRI] No manifest available. Returning "${url}" unverified. ` +
        `Run build hash generation to include integrity checks.`
    );
    return buffer;
  }

  let urlKey: string;
  try {
    urlKey = new URL(url, "https://localhost").pathname;
  } catch {
    urlKey = url;
  }

  const expectedSRI = manifest.assets[urlKey];

  if (!expectedSRI) {
    console.warn(
      `[SRI] No manifest entry for "${urlKey}". Returning bytes unverified.`
    );
    return buffer;
  }

  const actualBase64 = await computeSHA384Base64(buffer);
  const actualSRI = `sha384-${actualBase64}`;

  if (actualSRI !== expectedSRI) {
    throw new SRIIntegrityError(url, expectedSRI, actualSRI);
  }

  return buffer;
}

export async function secureLoadWorker(
  url: string,
  options: WasmLoaderOptions = {}
): Promise<string> {
  const buffer = await fetchSecureWasm(url, options);
  const blob = new Blob([buffer], { type: "application/javascript" });
  return URL.createObjectURL(blob);
}
