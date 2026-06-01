/**
 * src/store/networkStore.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Domain-specific Zustand store for all network configuration state.
 * Part of the store partitioning initiative (Issue #819).
 *
 * Re-exports the canonical `useNetworkStore` under the domain-store naming
 * convention so consumers can import from either path:
 *
 *   import { useNetworkStore } from "@/store/networkStore";
 *   import { useNetworkStore } from "@/store/useNetworkStore"; // also valid
 *
 * Owns:
 *  • Active network selection (testnet | futurenet | mainnet | local | custom)
 *  • RPC endpoint URL and custom headers
 *  • Network passphrase and Horizon URL
 *  • Named custom network profiles
 *  • Per-network isolated workspace state (deployments, env vars, notes)
 *
 * Zero circular dependencies — this store does not import from identityStore,
 * fileStore, or uiStore.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export {
  useNetworkStore,
  useResolvedRpcUrl,
  useResolvedPassphrase,
  useActiveNetwork,
  useNetworkProfiles,
  useNetworkValidationError,
  useResolvedNetworkConfig,
  useActiveWorkspace,
  useActiveNetworkContracts,
  useActiveNetworkEnvVars,
  useActiveNetworkNotes,
  useAllNetworkWorkspaces,
  type ExtendedNetworkKey,
  type CustomNetworkProfile,
  type ValidationResult,
  type NetworkWorkspace,
  type DeployedContractEntry,
  type NetworkStoreState,
} from "./useNetworkStore";
