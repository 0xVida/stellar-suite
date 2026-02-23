//! # Token Contract Template
//!
//! A standard token contract for Soroban supporting:
//! - Token minting by admin
//! - Token burning by holders
//! - Token transfers between addresses
//! - Balance queries
//! - Total supply tracking
//!
//! Template: token
//! Category: token
//! Version: 0.1.0

#![no_std]

use soroban_sdk::{contract, contractimpl, contracttype, Address, Env};

#[contracttype]
#[derive(Clone)]
enum DataKey {
    Admin,
    TotalSupply,
    Balance(Address),
}

#[contract]
pub struct TokenContract;

#[contractimpl]
impl TokenContract {
    /// Initialize the token contract with an admin address
    pub fn initialize(env: Env, admin: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("already initialized");
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::TotalSupply, &0i128);
    }

    /// Get the admin address
    pub fn admin(env: Env) -> Address {
        env.storage()
            .instance()
            .get(&DataKey::Admin)
            .expect("not initialized")
    }

    /// Get the total supply of tokens
    pub fn total_supply(env: Env) -> i128 {
        env.storage()
            .instance()
            .get(&DataKey::TotalSupply)
            .unwrap_or(0i128)
    }

    /// Get the balance of an address
    pub fn balance(env: Env, address: Address) -> i128 {
        env.storage()
            .instance()
            .get(&DataKey::Balance(address.clone()))
            .unwrap_or(0i128)
    }

    /// Mint tokens to an address (admin only)
    pub fn mint(env: Env, admin: Address, to: Address, amount: i128) {
        // Verify the caller is the admin
        let contract_admin = Self::admin(env.clone());
        admin.require_auth();
        if admin != contract_admin {
            panic!("not admin");
        }

        // Validate amount
        if amount <= 0 {
            panic!("amount must be positive");
        }

        // Update balance
        let current_balance = Self::balance(env.clone(), to.clone());
        let new_balance = current_balance
            .checked_add(amount)
            .expect("balance overflow");
        env.storage()
            .instance()
            .set(&DataKey::Balance(to.clone()), &new_balance);

        // Update total supply
        let current_supply = Self::total_supply(env.clone());
        let new_supply = current_supply
            .checked_add(amount)
            .expect("supply overflow");
        env.storage()
            .instance()
            .set(&DataKey::TotalSupply, &new_supply);
    }

    /// Transfer tokens from one address to another
    pub fn transfer(env: Env, from: Address, to: Address, amount: i128) {
        // Require authorization from the sender
        from.require_auth();

        // Validate amount
        if amount <= 0 {
            panic!("amount must be positive");
        }

        // Check sufficient balance
        let from_balance = Self::balance(env.clone(), from.clone());
        if from_balance < amount {
            panic!("insufficient balance");
        }

        // Update sender balance
        let new_from_balance = from_balance
            .checked_sub(amount)
            .expect("balance underflow");
        env.storage()
            .instance()
            .set(&DataKey::Balance(from.clone()), &new_from_balance);

        // Update receiver balance
        let to_balance = Self::balance(env.clone(), to.clone());
        let new_to_balance = to_balance
            .checked_add(amount)
            .expect("balance overflow");
        env.storage()
            .instance()
            .set(&DataKey::Balance(to.clone()), &new_to_balance);
    }

    /// Burn tokens from an address
    pub fn burn(env: Env, from: Address, amount: i128) {
        // Require authorization from the token holder
        from.require_auth();

        // Validate amount
        if amount <= 0 {
            panic!("amount must be positive");
        }

        // Check sufficient balance
        let from_balance = Self::balance(env.clone(), from.clone());
        if from_balance < amount {
            panic!("insufficient balance");
        }

        // Update balance
        let new_balance = from_balance
            .checked_sub(amount)
            .expect("balance underflow");
        env.storage()
            .instance()
            .set(&DataKey::Balance(from.clone()), &new_balance);

        // Update total supply
        let current_supply = Self::total_supply(env.clone());
        let new_supply = current_supply
            .checked_sub(amount)
            .expect("supply underflow");
        env.storage()
            .instance()
            .set(&DataKey::TotalSupply, &new_supply);
    }
}
