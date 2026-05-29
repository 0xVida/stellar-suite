/**
 * Lightweight validators used by the WalletConnect binding to reject
 * obviously invalid input before the request leaves the browser. Real
 * structural decoding is the wallet's responsibility — these checks only
 * guard against UI-side mistakes (empty strings, non-base64, accidental
 * pubkeys passed where an XDR was expected).
 */

import { STELLAR_CHAINS, type StellarChain } from "./types";

const BASE64_RE = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

const MIN_XDR_LENGTH = 8;
const MAX_XDR_LENGTH = 512 * 1024;

/** Strip whitespace and verify the payload looks like base64. */
export function normalizeXdr(input: string): string {
  return input.replace(/\s+/g, "");
}

export function isValidBase64Xdr(input: string): boolean {
  if (typeof input !== "string") return false;
  const trimmed = normalizeXdr(input);
  if (trimmed.length < MIN_XDR_LENGTH || trimmed.length > MAX_XDR_LENGTH) {
    return false;
  }
  if (trimmed.length % 4 !== 0) return false;
  return BASE64_RE.test(trimmed);
}

export function isStellarPublicKey(input: string): boolean {
  return /^G[A-Z2-7]{55}$/.test(input);
}

export function isStellarChain(value: unknown): value is StellarChain {
  return (
    value === STELLAR_CHAINS.pubnet || value === STELLAR_CHAINS.testnet
  );
}

/** Parse a CAIP-10 account ID (`stellar:pubnet:G…`) into its parts. */
export function parseAccount(account: string): {
  chain: StellarChain;
  publicKey: string;
} | null {
  const parts = account.split(":");
  if (parts.length !== 3) return null;
  const chain = `${parts[0]}:${parts[1]}`;
  if (!isStellarChain(chain)) return null;
  if (!isStellarPublicKey(parts[2])) return null;
  return { chain, publicKey: parts[2] };
}
