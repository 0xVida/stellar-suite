import { z } from "zod";

/**
 * Client-side identity & profile model.
 *
 * The marketing/app frontend has no auth backend yet, so identity is persisted
 * locally (localStorage) behind a small, validated API. Everything here is
 * SSR-safe and treats all input as untrusted: values are schema-validated before
 * they are stored, and only *public* Stellar keys are ever accepted.
 */

export const STORAGE_KEY = "stellar-kit:identity";

/** Stellar StrKey-encoded public keys: 'G' + 55 base32 chars (A-Z, 2-7). */
const STELLAR_PUBLIC_KEY_REGEX = /^G[A-Z2-7]{55}$/;
/** A Stellar secret key starts with 'S' — we must never store one. */
const STELLAR_SECRET_KEY_REGEX = /^S[A-Z2-7]{55}$/;
/** GitHub usernames: 1-39 chars, alphanumeric or single hyphens, no edges. */
const GITHUB_USERNAME_REGEX = /^[a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38}$/;

export function isValidStellarPublicKey(value: string): boolean {
  return STELLAR_PUBLIC_KEY_REGEX.test(value.trim());
}

export function isStellarSecretKey(value: string): boolean {
  return STELLAR_SECRET_KEY_REGEX.test(value.trim());
}

/** Shorten a Stellar address for display, e.g. GABC…WXYZ. */
export function truncateAddress(address: string, lead = 4, tail = 4): string {
  if (address.length <= lead + tail) return address;
  return `${address.slice(0, lead)}…${address.slice(-tail)}`;
}

export const profileSchema = z.object({
  displayName: z
    .string()
    .trim()
    .max(50, "Display name must be 50 characters or fewer"),
  bio: z.string().trim().max(280, "Bio must be 280 characters or fewer"),
  // Empty is allowed (no avatar); otherwise must be a valid http(s) URL.
  // Restricting to http(s) avoids javascript:/data: injection vectors.
  avatarUrl: z
    .string()
    .trim()
    .refine(
      (url) => url === "" || /^https?:\/\/.+/i.test(url),
      "Avatar URL must start with http:// or https://",
    )
    .refine(
      (url) => url === "" || z.string().url().safeParse(url).success,
      "Enter a valid URL",
    ),
});

export const githubUsernameSchema = z
  .string()
  .trim()
  .min(1, "Enter a GitHub username")
  .regex(GITHUB_USERNAME_REGEX, "That doesn't look like a valid GitHub username");

export const stellarAccountSchema = z.object({
  address: z
    .string()
    .trim()
    .refine(
      (value) => !isStellarSecretKey(value),
      "That's a secret key — never share it. Enter your public key (starts with G).",
    )
    .refine(
      isValidStellarPublicKey,
      "Enter a valid Stellar public key (starts with G, 56 characters)",
    ),
  label: z.string().trim().max(30, "Label must be 30 characters or fewer").optional(),
});

export type ProfileFields = z.infer<typeof profileSchema>;

export interface LinkedStellarAccount {
  address: string;
  label?: string;
  primary: boolean;
}

export interface Identity {
  displayName: string;
  bio: string;
  avatarUrl: string;
  github: string | null;
  stellarAccounts: LinkedStellarAccount[];
}

export const EMPTY_IDENTITY: Identity = {
  displayName: "",
  bio: "",
  avatarUrl: "",
  github: null,
  stellarAccounts: [],
};

/** Derive avatar fallback initials from the display name (or a default). */
export function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "SK";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Read identity from localStorage, tolerating absent/corrupt data. */
export function loadIdentity(): Identity {
  if (typeof window === "undefined") return EMPTY_IDENTITY;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_IDENTITY;
    const parsed = JSON.parse(raw) as Partial<Identity>;
    return {
      ...EMPTY_IDENTITY,
      ...parsed,
      stellarAccounts: Array.isArray(parsed.stellarAccounts)
        ? parsed.stellarAccounts.filter((a) => isValidStellarPublicKey(a.address))
        : [],
    };
  } catch {
    return EMPTY_IDENTITY;
  }
}

/** Persist identity to localStorage. */
export function saveIdentity(identity: Identity): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(identity));
  } catch {
    /* storage may be full or unavailable — ignore */
  }
}
