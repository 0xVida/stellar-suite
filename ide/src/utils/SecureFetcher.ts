/**
 * SecureFetcher.ts
 *
 * Fetches a remote resource (primarily WASM binaries and worker scripts) and
 * verifies its SHA-384 integrity against the build-time SRI manifest before
 * returning the bytes to the caller.
 *
 * Key guarantees:
 *  • If the manifest lists a hash for the URL and it does NOT match → throws
 *    SRIIntegrityError and NEVER returns the (potentially tampered) bytes.
 *  • If the manifest has no entry for the URL (e.g. dev mode, unlisted asset)
 *    → logs a console.warn and returns the bytes unverified so development
 *    is not blocked.
 *  • The manifest is fetched once and cached in module memory; call
 *    clearSRICache() to force a re-fetch (useful in tests).
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SRIManifest {
  generated: string;
  algorithm: string;
  assets: Record<string, string>; // URL path → "sha384-<base64>"
}

export interface SecureFetchOptions {
  /** Override the manifest URL (defaults to /sri-manifest.json). */
  manifestUrl?: string;
  /** If true, skip SRI verification even when a hash is present. NEVER use in production. */
  bypassVerification?: boolean;
}

// ─── Custom error ─────────────────────────────────────────────────────────────

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
    // Maintain proper prototype chain for `instanceof` checks
    Object.setPrototypeOf(this, SRIIntegrityError.prototype);
  }
}

// ─── Module-level manifest cache ─────────────────────────────────────────────

let _manifestCache: SRIManifest | null = null;
let _manifestUrl: string = "/sri-manifest.json";

/**
 * Load (and cache) the SRI manifest from the given URL.
 * Subsequent calls return the cached copy unless clearSRICache() is called.
 */
export async function loadSRIManifest(
  manifestUrl: string = "/sri-manifest.json"
): Promise<SRIManifest | null> {
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
    _manifestCache = (await res.json()) as SRIManifest;
    return _manifestCache;
  } catch (err) {
    console.warn(
      `[SRI] Failed to fetch manifest: ${(err as Error).message}. ` +
        `Running without integrity verification.`
    );
    return null;
  }
}

/** Reset the cached manifest so the next call to loadSRIManifest re-fetches. */
export function clearSRICache(): void {
  _manifestCache = null;
}

// ─── SHA-384 digest helper ────────────────────────────────────────────────────

async function computeSHA384Base64(buffer: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest("SHA-384", buffer);
  const bytes = new Uint8Array(hashBuffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// ─── Main API ─────────────────────────────────────────────────────────────────

/**
 * Fetch a resource and verify its SHA-384 integrity against the SRI manifest.
 *
 * @param url     The URL to fetch (absolute or relative).
 * @param options Optional configuration.
 * @returns       The verified ArrayBuffer of the response body.
 * @throws        {SRIIntegrityError} if the hash does not match.
 */
export async function fetchWithSRI(
  url: string,
  options: SecureFetchOptions = {}
): Promise<ArrayBuffer> {
  const { manifestUrl = "/sri-manifest.json", bypassVerification = false } =
    options;

  // 1. Fetch the resource (always cache-busted so we get fresh bytes)
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(
      `[SRI] Failed to fetch "${url}": HTTP ${response.status} ${response.statusText}`
    );
  }

  const buffer = await response.arrayBuffer();

  // 2. Short-circuit if bypass is requested (tests / local dev only)
  if (bypassVerification) {
    console.warn(
      `[SRI] Integrity verification BYPASSED for "${url}". Do not use in production.`
    );
    return buffer;
  }

  // 3. Load the manifest
  const manifest = await loadSRIManifest(manifestUrl);

  if (!manifest) {
    // No manifest available — warn and return unverified
    console.warn(
      `[SRI] No manifest available. Returning "${url}" unverified. ` +
        `Run "npm run sri" to generate integrity hashes.`
    );
    return buffer;
  }

  // 4. Derive the URL key used in the manifest (just the pathname)
  let urlKey: string;
  try {
    urlKey = new URL(url, "https://localhost").pathname;
  } catch {
    urlKey = url;
  }

  const expectedSRI = manifest.assets[urlKey];

  if (!expectedSRI) {
    // No entry for this URL — graceful degradation
    console.warn(
      `[SRI] No manifest entry for "${urlKey}". Returning bytes unverified. ` +
        `Run "npm run sri" to include this asset.`
    );
    return buffer;
  }

  // 5. Compute actual hash and compare
  const actualBase64 = await computeSHA384Base64(buffer);
  const actualSRI = `sha384-${actualBase64}`;

  if (actualSRI !== expectedSRI) {
    throw new SRIIntegrityError(url, expectedSRI, actualSRI);
  }

  return buffer;
}
