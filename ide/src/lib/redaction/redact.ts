/**
 * Redaction layer for log surfaces (Events panel, Terminal output).
 *
 * Two passes:
 *  1. Named pattern rules — Stellar secret keys, public keys, contract IDs,
 *     bare hex private keys, JWTs, generic Bearer/Authorization headers.
 *  2. Generic high-entropy fallback — any base64-ish/hex-ish token of length
 *     >= 24 whose Shannon entropy crosses ENTROPY_THRESHOLD is masked. This
 *     catches secrets we don't have a named rule for (API keys, signing
 *     material) without flagging readable identifiers.
 *
 * The output preserves a small prefix/suffix for known patterns ("G…ABCD") so
 * users can still cross-reference an account in screenshots without exposing
 * the full string.
 */

export interface RedactionRule {
  name: string;
  pattern: RegExp;
  replace: (match: string, ...groups: string[]) => string;
}

export interface RedactionResult {
  redacted: string;
  count: number;
  hits: Array<{ rule: string; original: string; replacement: string }>;
}

const PARTIAL_PREFIX = 4;
const PARTIAL_SUFFIX = 4;
const ENTROPY_THRESHOLD = 4.0;
const ENTROPY_MIN_LENGTH = 24;

function partial(match: string): string {
  if (match.length <= PARTIAL_PREFIX + PARTIAL_SUFFIX + 3) {
    return "[REDACTED]";
  }
  return `${match.slice(0, PARTIAL_PREFIX)}…${match.slice(-PARTIAL_SUFFIX)}`;
}

/**
 * Built-in pattern rules. Order matters — the most specific rules run first
 * so the high-entropy fallback doesn't double-mask known formats.
 */
export const DEFAULT_RULES: RedactionRule[] = [
  {
    name: "stellar-secret-key",
    pattern: /\bS[A-Z2-7]{55}\b/g,
    replace: () => "[REDACTED:STELLAR_SECRET]",
  },
  {
    name: "stellar-public-key",
    pattern: /\bG[A-Z2-7]{55}\b/g,
    replace: (m) => `${m.slice(0, PARTIAL_PREFIX)}…${m.slice(-PARTIAL_SUFFIX)}`,
  },
  {
    name: "stellar-contract-id",
    pattern: /\bC[A-Z2-7]{55}\b/g,
    replace: (m) => `${m.slice(0, PARTIAL_PREFIX)}…${m.slice(-PARTIAL_SUFFIX)}`,
  },
  {
    name: "stellar-muxed-account",
    pattern: /\bM[A-Z2-7]{68}\b/g,
    replace: (m) => `${m.slice(0, PARTIAL_PREFIX)}…${m.slice(-PARTIAL_SUFFIX)}`,
  },
  {
    name: "jwt",
    pattern: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
    replace: () => "[REDACTED:JWT]",
  },
  {
    name: "bearer-token",
    pattern: /\bBearer\s+[A-Za-z0-9._\-+/=]{16,}/gi,
    replace: () => "Bearer [REDACTED]",
  },
  {
    name: "authorization-header",
    pattern: /\bAuthorization\s*[:=]\s*[A-Za-z0-9._\-+/=]+/gi,
    replace: () => "Authorization: [REDACTED]",
  },
  {
    name: "hex-private-key",
    pattern: /\b(?:0x)?[0-9a-fA-F]{64,128}\b/g,
    replace: (m) => `${m.slice(0, PARTIAL_PREFIX)}…${m.slice(-PARTIAL_SUFFIX)}`,
  },
];

/**
 * Shannon entropy in bits per character. High-entropy strings (random tokens)
 * score above ~3.5; English prose averages around 2.0–2.5.
 */
export function shannonEntropy(s: string): number {
  if (s.length === 0) return 0;
  const counts = new Map<string, number>();
  for (const ch of s) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  let h = 0;
  for (const c of counts.values()) {
    const p = c / s.length;
    h -= p * Math.log2(p);
  }
  return h;
}

const HIGH_ENTROPY_TOKEN = /[A-Za-z0-9+/=_-]{24,}/g;

/**
 * Apply the entropy fallback to anything that escaped the named rules.
 */
function maskHighEntropyTokens(
  input: string,
  hits: RedactionResult["hits"],
): string {
  return input.replace(HIGH_ENTROPY_TOKEN, (token) => {
    if (token.startsWith("[REDACTED")) return token;
    if (shannonEntropy(token) < ENTROPY_THRESHOLD) return token;
    const replacement = partial(token);
    hits.push({
      rule: "high-entropy",
      original: token,
      replacement,
    });
    return replacement;
  });
}

export interface RedactOptions {
  rules?: RedactionRule[];
  enableEntropyFallback?: boolean;
}

export function redactString(
  input: string,
  options: RedactOptions = {},
): RedactionResult {
  if (!input) {
    return { redacted: input, count: 0, hits: [] };
  }
  const rules = options.rules ?? DEFAULT_RULES;
  const hits: RedactionResult["hits"] = [];
  let working = input;

  for (const rule of rules) {
    working = working.replace(rule.pattern, (match, ...groupsAndOffset) => {
      const groups = groupsAndOffset.slice(0, -2) as string[];
      const replacement = rule.replace(match, ...groups);
      hits.push({ rule: rule.name, original: match, replacement });
      return replacement;
    });
  }

  if (options.enableEntropyFallback ?? true) {
    working = maskHighEntropyTokens(working, hits);
  }

  return { redacted: working, count: hits.length, hits };
}

/**
 * Convenience for the common case where callers only need the redacted text.
 */
export function redact(input: string, options?: RedactOptions): string {
  return redactString(input, options).redacted;
}
