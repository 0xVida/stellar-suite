#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype, Address, Env, String, Symbol, Map,
};

/// Token Metadata standard structure
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TokenMetadata {
    pub name: String,
    pub symbol: String,
    pub uri: String,
}

/// Royalty storage structure
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RoyaltyData {
    pub receiver: Address,
    pub amount: u32, // represents percentage in basis points (e.g., 500 = 5%)
}

#[contracttype]
pub enum DataKey {
    Admin,
    Name,
    Symbol,
    BaseUri,
    TotalSupply,
    Owner(u64),      // Token ID to Owner mapping
    Metadata(u64),   // Token ID to URI/Metadata mapping
    Royalty,         // Global royalty mapping
    TokenRoyalty(u64), // Per-token royalty mapping
}

#[contract]
pub struct NftContract;

#[contractimpl]
impl NftContract {
    /// Initialize the NFT contract
    pub fn initialize(
        env: Env,
        admin: Address,
        name: String,
        symbol: String,
        base_uri: String,
    ) {
        assert!(
            !env.storage().instance().has(&DataKey::Admin),
            "Already initialized"
        );
        admin.require_auth();

        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Name, &name);
        env.storage().instance().set(&DataKey::Symbol, &symbol);
        env.storage().instance().set(&DataKey::BaseUri, &base_uri);
        env.storage().instance().set(&DataKey::TotalSupply, &0u64);
    }

    /// Mint a new NFT
    pub fn mint(
        env: Env,
        to: Address,
        uri: String,
    ) -> u64 {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();

        let mut total_supply: u64 = env.storage().instance().get(&DataKey::TotalSupply).unwrap_or(0);
        let token_id = total_supply + 1;
        
        total_supply = token_id;
        env.storage().instance().set(&DataKey::TotalSupply, &total_supply);

        env.storage().persistent().set(&DataKey::Owner(token_id), &to);
        env.storage().persistent().set(&DataKey::Metadata(token_id), &uri);

        token_id
    }

    /// Transfer an NFT to another address
    pub fn transfer(
        env: Env,
        from: Address,
        to: Address,
        token_id: u64,
    ) {
        from.require_auth();
        
        let current_owner: Address = env.storage().persistent().get(&DataKey::Owner(token_id))
            .unwrap_or_else(|| panic!("Token does not exist"));
            
        assert!(current_owner == from, "Not the owner");
        
        env.storage().persistent().set(&DataKey::Owner(token_id), &to);
    }

    /// Get the owner of an NFT
    pub fn get_owner(env: Env, token_id: u64) -> Address {
        env.storage().persistent().get(&DataKey::Owner(token_id))
            .unwrap_or_else(|| panic!("Token does not exist"))
    }

    /// Get token metadata
    pub fn get_metadata(env: Env, token_id: u64) -> TokenMetadata {
        let name: String = env.storage().instance().get(&DataKey::Name).unwrap();
        let symbol: String = env.storage().instance().get(&DataKey::Symbol).unwrap();
        
        let token_uri: String = env.storage().persistent()
            .get(&DataKey::Metadata(token_id))
            .unwrap_or_else(|| panic!("Token does not exist"));

        TokenMetadata {
            name,
            symbol,
            uri: token_uri,
        }
    }

    /// Set global default royalty
    pub fn set_royalty(env: Env, receiver: Address, amount: u32) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();
        
        assert!(amount <= 10000, "Royalty cannot exceed 100%");
        
        let royalty_data = RoyaltyData { receiver, amount };
        env.storage().instance().set(&DataKey::Royalty, &royalty_data);
    }

    /// Set specific royalty for a given token
    pub fn set_token_royalty(env: Env, token_id: u64, receiver: Address, amount: u32) {
        let owner: Address = env.storage().persistent().get(&DataKey::Owner(token_id))
            .unwrap_or_else(|| panic!("Token does not exist"));
            
        owner.require_auth();
        
        assert!(amount <= 10000, "Royalty cannot exceed 100%");

        let royalty_data = RoyaltyData { receiver, amount };
        env.storage().persistent().set(&DataKey::TokenRoyalty(token_id), &royalty_data);
    }

    /// Get royalty details for a given token and sale price
    /// Returns (Receiver Address, amount to send to receiver)
    pub fn get_royalty(env: Env, token_id: u64, sale_price: u128) -> (Address, u128) {
        let royalty_data = if let Some(tr) = env.storage().persistent().get::<_, RoyaltyData>(&DataKey::TokenRoyalty(token_id)) {
            tr
        } else if let Some(gr) = env.storage().instance().get::<_, RoyaltyData>(&DataKey::Royalty) {
            gr
        } else {
            // No royalty set, return dummy values or fallback
            return (env.current_contract_address(), 0);
        };

        let royalty_amount = (sale_price * royalty_data.amount as u128) / 10000;
        (royalty_data.receiver, royalty_amount)
    }
}
