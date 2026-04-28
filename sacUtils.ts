import { Asset } from 'stellar-sdk';

/**
 * Derives the SAC (Stellar Asset Contract) ID for a given Stellar Asset.
 * This contract ID is deterministic based on the asset and network passphrase.
 */
export const getSACContractId = (asset: Asset, networkPassphrase: string): string => {
  try {
    // Asset.contractId returns the hex string of the contract ID in modern SDKs
    return asset.contractId(networkPassphrase);
  } catch (error) {
    console.error('Error deriving SAC contract ID:', error);
    return '';
  }
};