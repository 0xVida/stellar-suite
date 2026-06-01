/**
 * src/store/identityStore.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Domain-specific Zustand store for identity and keypair management.
 * Part of the store partitioning initiative (Issue #819).
 *
 * Re-exports the canonical `useIdentityStore` under the domain-store naming
 * convention so consumers can import from either path:
 *
 *   import { useIdentityStore } from "@/store/identityStore";
 *   import { useIdentityStore } from "@/store/useIdentityStore"; // also valid
 *
 * Owns:
 *  • Local keypair vault (AES-GCM encrypted, stored in IndexedDB)
 *  • Active identity context (web-wallet vs local keypair)
 *  • Web-wallet public key (set by the adapter layer)
 *  • XLM balance cache per public key
 *  • Vault lock / unlock lifecycle
 *
 * Zero circular dependencies — this store does not import from networkStore,
 * fileStore, or uiStore.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export {
  useIdentityStore,
  type Identity,
  type ActiveContext,
} from "./useIdentityStore";
