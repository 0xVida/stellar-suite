import { Asset } from 'stellar-sdk';

export type AssetType = 'native' | 'alphanum4' | 'alphanum12';

export interface SACAsset {
  code: string;
  issuer?: string;
  type: AssetType;
  contractId: string;
}

export interface SACInteractionState {
  asset: Asset;
  contractId: string;
  amount: string;
  loading: boolean;
  error?: string;
  result?: {
    txHash: string;
    type: 'wrap' | 'unwrap';
  };
}