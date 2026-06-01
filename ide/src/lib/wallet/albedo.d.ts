/**
 * src/lib/wallet/albedo.d.ts
 * Manual ambient declaration for @albedo-link/intent.
 * The package ships no TypeScript types; this covers the subset used
 * by AlbedoAdapter (publicKey + tx intents).
 */
declare module "@albedo-link/intent" {
  interface PublicKeyParams {
    token?: string;
  }
  interface PublicKeyResult {
    pubkey: string;
    token?: string;
  }

  interface TxParams {
    xdr: string;
    network?: "public" | "testnet";
    submit?: boolean;
    token?: string;
  }
  interface TxResult {
    signed_envelope_xdr: string;
    tx_hash?: string;
    network?: string;
  }

  interface Albedo {
    publicKey(params?: PublicKeyParams): Promise<PublicKeyResult>;
    tx(params: TxParams): Promise<TxResult>;
  }

  const albedo: Albedo;
  export default albedo;
}
