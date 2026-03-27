export type NetworkKey = "testnet" | "futurenet" | "mainnet" | "local";

export interface NetworkConfig {
  label: string;
  horizon: string;
  passphrase: string;
}

export interface CustomHeaders {
  [key: string]: string;
}

export const NETWORK_CONFIG: Record<NetworkKey, NetworkConfig> = {
  testnet: {
    label: "Testnet",
    horizon: "https://soroban-testnet.stellar.org:443",
    passphrase: "Test SDF Network ; September 2015",
  },
  futurenet: {
    label: "Futurenet",
    horizon: "https://soroban-futurenet.stellar.org:443",
    passphrase: "Future SDF Network ; October 2022",
  },
  mainnet: {
    label: "Mainnet",
    horizon: "https://horizon.stellar.org:443",
    passphrase: "Public Global Stellar Network ; September 2015",
  },
  local: {
    label: "Local",
    horizon: "http://localhost:8000",
    passphrase: "Local Stellar Network",
  },
};

export const DEFAULT_CUSTOM_RPC = "http://localhost:8000";
