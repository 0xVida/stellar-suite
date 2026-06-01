/**
 * src/lib/wallet/index.ts
 * Public barrel — import everything from one path.
 *
 *   import {
 *     WalletAdapterRegistry,
 *     FreighterAdapter, AlbedoAdapter, HanaAdapter,
 *     WalletAdapterError,
 *   } from "@/lib/wallet";
 */

// Core interface, base class, registry, and error
export * from "./BaseAdapter";

// Concrete adapters (importing triggers self-registration)
export * from "./FreighterAdapter";
export * from "./AlbedoAdapter";
export * from "./HanaAdapter";
