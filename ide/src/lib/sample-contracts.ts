export interface FileNode {
  name: string;
  type: "file" | "folder";
  children?: FileNode[];
  content?: string;
  language?: string;
}

export const sampleContracts: FileNode[] = [
  {
    name: "hello_world",
    type: "folder",
    children: [
      {
        name: "lib.rs",
        type: "file",
        language: "rust",
        content: `#![no_std]
use soroban_sdk::{contract, contractimpl, symbol_short, vec, Env, Symbol, Vec};

#[contract]
pub struct HelloContract;

#[contractimpl]
impl HelloContract {
    /// Say hello to someone.
    pub fn hello(env: Env, to: Symbol) -> Vec<Symbol> {
        env.events().publish((symbol_short!("greeting"),), to.clone());
        vec![&env, symbol_short!("Hello"), to]
    }

    /// Example with potentially unsafe math operations
    pub fn unsafe_math(env: Env, a: u64, b: u64) -> u64 {
        // These operations could overflow on ledger
        let sum = a + b;  // MATH001: Potentially unsafe addition
        let product = a * b;  // MATH001: Potentially unsafe multiplication
        let difference = a - b;  // MATH001: Potentially unsafe subtraction

        // Large number operations
        let big_amount: u128 = 1000000;
        let result = big_amount * a;  // MATH001: Potentially unsafe multiplication

        sum + product
    }
}

mod test;`,
      },
      {
        name: "test.rs",
        type: "file",
        language: "rust",
        content: `#![cfg(test)]

use super::*;
use soroban_sdk::{symbol_short, vec, Env};

#[test]
fn test_hello() {
    let env = Env::default();
    let contract_id = env.register_contract(None, HelloContract);
    let client = HelloContractClient::new(&env, &contract_id);

    let words = client.hello(&symbol_short!("Dev"));
    assert_eq!(
        words,
        vec![&env, symbol_short!("Hello"), symbol_short!("Dev")]
    );

    use soroban_sdk::testutils::Events as _;
    let events = env.events().all();
    assert!(events.iter().any(|(_, topics, _)| {
        topics.contains(symbol_short!("greeting").into())
    }));
}`,
      },
      {
        name: "Cargo.toml",
        type: "file",
        language: "toml",
        content: `[package]
name = "hello-world"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib"]

[dependencies]
soroban-sdk = { workspace = true }

[dev-dependencies]
soroban-sdk = { workspace = true, features = ["testutils"] }`,
      },
    ],
  },
  {
    name: "token",
    type: "folder",
    children: [
      {
        name: "lib.rs",
        type: "file",
        language: "rust",
        content: `#![no_std]
use soroban_sdk::{
    contract, contractimpl, contracttype, Address, Env, String,
};

#[contracttype]
pub enum DataKey {
    Admin,
    Name,
    Symbol,
    Decimals,
    Balance(Address),
}

#[contract]
pub struct TokenContract;

#[contractimpl]
impl TokenContract {
    pub fn initialize(
        env: Env,
        admin: Address,
        decimal: u32,
        name: String,
        symbol: String,
    ) {
        admin.require_auth();
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("already initialized");
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Decimals, &decimal);
        env.storage().instance().set(&DataKey::Name, &name);
        env.storage().instance().set(&DataKey::Symbol, &symbol);
    }

    pub fn name(env: Env) -> String {
        env.storage()
            .instance()
            .get(&DataKey::Name)
            .unwrap()
    }

    pub fn symbol(env: Env) -> String {
        env.storage()
            .instance()
            .get(&DataKey::Symbol)
            .unwrap()
    }

    pub fn decimals(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&DataKey::Decimals)
            .unwrap()
    }

    pub fn balance(env: Env, address: Address) -> i128 {
        env.storage()
            .instance()
            .get(&DataKey::Balance(address))
            .unwrap_or(0i128)
    }

    pub fn mint(env: Env, admin: Address, to: Address, amount: i128) {
        admin.require_auth();
        let stored_admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        if admin != stored_admin {
            panic!("not admin");
        }
        let balance_key = DataKey::Balance(to.clone());
        let current_balance: i128 = env.storage().instance().get(&balance_key).unwrap_or(0i128);
        env.storage().instance().set(&balance_key, &(current_balance + amount));
    }

    pub fn set_admin(env: Env, admin: Address, new_admin: Address) {
        admin.require_auth();
        let stored_admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        if admin != stored_admin {
            panic!("not admin");
        }
        env.storage().instance().set(&DataKey::Admin, &new_admin);
    }
}

mod test;`,
      },
      {
        name: "test.rs",
        type: "file",
        language: "rust",
        content: `#![cfg(test)]

use super::*;
use soroban_sdk::{testutils::Address as _, Address, Env, String};

#[test]
fn test_token_mint_and_set_admin() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, TokenContract);
    let client = TokenContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let alice = Address::generate(&env);
    let name = String::from_str(&env, "Test Token");
    let symbol = String::from_str(&env, "TST");

    client.initialize(&admin, &7, &name, &symbol);

    assert_eq!(client.decimals(), 7);

    // Mint tokens (admin required)
    client.mint(&admin, &alice, &1000);
    assert_eq!(client.balance(&alice), 1000);

    // Set admin (admin required)
    let new_admin = Address::generate(&env);
    client.set_admin(&admin, &new_admin);

    // Non-admin attempt should panic (bypass prevention verification)
    let res = std::panic::catch_unwind(|| {
        let env_inner = Env::default();
        env_inner.mock_all_auths();
        let c_id = env_inner.register_contract(None, TokenContract);
        let c_client = TokenContractClient::new(&env_inner, &c_id);
        let adm = Address::generate(&env_inner);
        let ali = Address::generate(&env_inner);
        let nm = String::from_str(&env_inner, "Test Token");
        let sym = String::from_str(&env_inner, "TST");
        c_client.initialize(&adm, &7, &nm, &sym);
        // Try to mint with non-admin (ali)
        c_client.mint(&ali, &ali, &100);
    });
    assert!(res.is_err());
  }`,
      },
      {
        name: "Cargo.toml",
        type: "file",
        language: "toml",
        content: `[package]
name = "token-sample"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib"]

[dependencies]
soroban-sdk = { workspace = true }

[dev-dependencies]
soroban-sdk = { workspace = true, features = ["testutils"] }`,
      },
    ],
  },
  {
    name: "increment",
    type: "folder",
    children: [
      {
        name: "lib.rs",
        type: "file",
        language: "rust",
        content: `#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, log, Env};

#[contracttype]
pub enum DataKey {
    Counter,
}

#[contract]
pub struct IncrementContract;

#[contractimpl]
impl IncrementContract {
    /// Increment an internal counter and return the value.
    pub fn increment(env: Env) -> u32 {
        let mut count: u32 = env
            .storage()
            .instance()
            .get(&DataKey::Counter)
            .unwrap_or(0);

        count += 1;

        log!(&env, "count: {}", count);

        env.storage()
            .instance()
            .set(&DataKey::Counter, &count);

        env.storage().instance().extend_ttl(100, 100);

        count
    }

    /// Return the current value of the counter.
    pub fn get_count(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&DataKey::Counter)
            .unwrap_or(0)
    }
}`,
      },
    ],
  },
  {
    name: "cross_contract",
    type: "folder",
    children: [
      {
        name: "lib.rs",
        type: "file",
        language: "rust",
        content: `#![no_std]
use soroban_sdk::{contract, contractimpl, Address, Env};

#[contract]
pub struct CalleeContract;

#[contractimpl]
impl CalleeContract {
    pub fn add(env: Env, a: u32, b: u32) -> u32 {
        a + b
    }
}

#[contract]
pub struct CallerContract;

#[contractimpl]
impl CallerContract {
    pub fn call_add(env: Env, callee_id: Address, a: u32, b: u32) -> u32 {
        let client = CalleeContractClient::new(&env, &callee_id);
        client.add(&a, &b)
    }
}

mod test;`,
      },
      {
        name: "test.rs",
        type: "file",
        language: "rust",
        content: `#![cfg(test)]

use super::*;
use soroban_sdk::Env;

#[test]
fn test_cross_contract_call() {
    let env = Env::default();
    
    let callee_id = env.register_contract(None, CalleeContract);
    let caller_id = env.register_contract(None, CallerContract);
    let caller_client = CallerContractClient::new(&env, &caller_id);
    
    let result = caller_client.call_add(&callee_id, &5, &7);
    assert_eq!(result, 12);
}`,
      },
      {
        name: "Cargo.toml",
        type: "file",
        language: "toml",
        content: `[package]
name = "cross-contract"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib"]

[dependencies]
soroban-sdk = { workspace = true }

[dev-dependencies]
soroban-sdk = { workspace = true, features = ["testutils"] }`,
      },
    ],
  },
  {
    name: "timelocked_escrow",
    type: "folder",
    children: [
      {
        name: "lib.rs",
        type: "file",
        language: "rust",
        content: `#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, token, Address, Env};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EscrowState {
    pub sender: Address,
    pub recipient: Address,
    pub token: Address,
    pub amount: i128,
    pub unlock_time: u64,
    pub claimed: bool,
}

#[contracttype]
pub enum DataKey {
    State,
}

#[contract]
pub struct EscrowVestingContract;

#[contractimpl]
impl EscrowVestingContract {
    /// Initialize the escrow/vesting contract.
    /// This transfers the amount of tokens from the sender to the contract.
    pub fn initialize(
        env: Env,
        sender: Address,
        recipient: Address,
        token: Address,
        amount: i128,
        unlock_time: u64,
    ) {
        // Prevent double initialization
        assert!(
            !env.storage().instance().has(&DataKey::State),
            "contract already initialized"
        );

        sender.require_auth();

        // Store contract state
        let state = EscrowState {
            sender: sender.clone(),
            recipient,
            token: token.clone(),
            amount,
            unlock_time,
            claimed: false,
        };
        env.storage().instance().set(&DataKey::State, &state);

        // Transfer funds from sender to contract
        let token_client = token::Client::new(&env, &token);
        token_client.transfer(&sender, &env.current_contract_address(), &amount);
    }

    /// Claim the vested/escrowed tokens.
    /// Can only be called by the recipient after the unlock time has passed.
    pub fn claim(env: Env) {
        let mut state: EscrowState = env
            .storage()
            .instance()
            .get(&DataKey::State)
            .expect("contract not initialized");

        assert!(!state.claimed, "tokens already claimed");

        // CRITICAL CHECK: Ensure ledger timestamp is >= unlock_time
        let now = env.ledger().timestamp();
        assert!(
            now >= state.unlock_time,
            "tokens are still locked: current time {} < unlock time {}",
            now,
            state.unlock_time
        );

        // Authorize the claim as the recipient
        state.recipient.require_auth();

        // Mark as claimed
        state.claimed = true;
        env.storage().instance().set(&DataKey::State, &state);

        // Transfer funds to recipient
        let token_client = token::Client::new(&env, &state.token);
        token_client.transfer(
            &env.current_contract_address(),
            &state.recipient,
            &state.amount,
        );
    }

    /// Fetch the current escrow/vesting state.
    pub fn get_state(env: Env) -> EscrowState {
        env.storage()
            .instance()
            .get(&DataKey::State)
            .expect("contract not initialized")
    }
}
`,
      },
      {
        name: "test.rs",
        type: "file",
        language: "rust",
        content: `#![cfg(test)]

use super::*;
use soroban_sdk::{testutils::Address as _, Env};

#[test]
fn test_escrow_vesting() {
    let env = Env::default();
    env.mock_all_auths();

    let sender = Address::generate(&env);
    let recipient = Address::generate(&env);
    let token_admin = Address::generate(&env);

    // Register a mock token contract
    let token_id = env.register_stellar_asset_contract_v2(token_admin).address();
    let token_client = token::Client::new(&env, &token_id);
    let token_admin_client = token::StellarAssetClient::new(&env, &token_id);

    // Mint tokens to sender
    let amount = 1000i128;
    token_admin_client.mint(&sender, &amount);
    assert_eq!(token_client.balance(&sender), amount);

    // Register our EscrowVestingContract
    let contract_id = env.register_contract(None, EscrowVestingContract);
    let client = EscrowVestingContractClient::new(&env, &contract_id);

    // Set lock parameters
    let unlock_time = 1000u64;
    env.ledger().with_mut(|li| li.timestamp = 500);

    // Initialize escrow
    client.initialize(&sender, &recipient, &token_id, &amount, &unlock_time);

    // Verify contract holds the tokens
    assert_eq!(token_client.balance(&sender), 0);
    assert_eq!(token_client.balance(&contract_id), amount);

    // Try to claim before unlock time (should panic/fail)
    env.ledger().with_mut(|li| li.timestamp = 999);
    let result = std::panic::catch_unwind(|| {
        client.claim();
    });
    assert!(result.is_err());

    // Advance ledger timestamp beyond unlock_time and claim
    env.ledger().with_mut(|li| li.timestamp = 1000);
    client.claim();

    // Verify recipient received tokens and state is updated
    assert_eq!(token_client.balance(&recipient), amount);
    assert_eq!(token_client.balance(&contract_id), 0);
    assert!(client.get_state().claimed);
}
`,
      },
      {
        name: "Cargo.toml",
        type: "file",
        language: "toml",
        content: `[package]
name = "timelocked-escrow"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib"]

[dependencies]
soroban-sdk = { workspace = true }

[dev-dependencies]
soroban-sdk = { workspace = true, features = ["testutils"] }
`,
      },
    ],
  },
  {
    name: "assets",
    type: "folder",
    children: [
      {
        name: "logo.svg",
        type: "file",
        content: `<svg width="100" height="100" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <circle cx="50" cy="50" r="40" stroke="white" stroke-width="3" fill="none" />
  <path d="M30 50 L50 30 L70 50 L50 70 Z" fill="white" />
</svg>`,
      },
      {
        name: "banner.png",
        type: "file",
        content: "base64_encoded_placeholder_data",
      },
      {
        name: "icon.webp",
        type: "file",
        content: "base64_encoded_placeholder_data",
      },
    ],
  },
  // ── Liquidity Pool AMM ────────────────────────────────────────────────────
  {
    name: "liquidity_pool_amm",
    type: "folder",
    children: [
      {
        name: "lib.rs",
        type: "file",
        language: "rust",
        content: `#![no_std]

//! Liquidity Pool AMM — Constant-Product Market Maker (x * y = k)
//!
//! Implements the classic automated market maker formula used by protocols
//! like Uniswap v2.  Two token reserves are maintained; swaps move along the
//! constant-product curve while liquidity providers (LPs) mint/burn pool
//! shares proportional to their deposit.
//!
//! Key invariant:  reserve_a * reserve_b = k  (before fees)
//! Swap fee:       0.3 % retained in the pool, accruing to LPs

use soroban_sdk::{
    contract, contractimpl, contracttype,
    token, Address, Env, Symbol,
};

// ─── Storage keys ──────────────────────────────────────────────────────────

#[contracttype]
pub enum DataKey {
    ReserveA,
    ReserveB,
    TotalShares,
    TokenA,
    TokenB,
    LpShare(Address),
}

// ─── Fee constant ──────────────────────────────────────────────────────────

/// 0.3 % expressed as basis points in fixed-point arithmetic.
/// fee_numerator / FEE_DENOMINATOR = 997 / 1000 = 99.7 % of input forwarded.
const FEE_NUMERATOR: i128 = 997;
const FEE_DENOMINATOR: i128 = 1000;

// ─── Contract ──────────────────────────────────────────────────────────────

#[contract]
pub struct LiquidityPoolAMM;

#[contractimpl]
impl LiquidityPoolAMM {
    // ── Initialisation ─────────────────────────────────────────────────────

    /// Initialise the pool with the two token contract addresses.
    /// Must be called once before any deposits or swaps.
    pub fn initialize(env: Env, token_a: Address, token_b: Address) {
        assert!(
            env.storage().instance().get::<_, Address>(&DataKey::TokenA).is_none(),
            "already initialised"
        );
        env.storage().instance().set(&DataKey::TokenA, &token_a);
        env.storage().instance().set(&DataKey::TokenB, &token_b);
        env.storage().instance().set(&DataKey::ReserveA, &0_i128);
        env.storage().instance().set(&DataKey::ReserveB, &0_i128);
        env.storage().instance().set(&DataKey::TotalShares, &0_i128);
    }

    // ── Deposit / Add Liquidity ────────────────────────────────────────────

    /// Deposit \`amount_a\` of token A and \`amount_b\` of token B.
    ///
    /// The amounts must preserve the current pool ratio (or the pool is empty).
    /// LP shares are minted to \`provider\` proportional to the contribution.
    ///
    /// Returns the number of LP shares minted.
    pub fn deposit(
        env: Env,
        provider: Address,
        amount_a: i128,
        amount_b: i128,
    ) -> i128 {
        provider.require_auth();
        assert!(amount_a > 0 && amount_b > 0, "amounts must be positive");

        let reserve_a: i128 = env.storage().instance().get(&DataKey::ReserveA).unwrap();
        let reserve_b: i128 = env.storage().instance().get(&DataKey::ReserveB).unwrap();
        let total_shares: i128 = env.storage().instance().get(&DataKey::TotalShares).unwrap();

        // Enforce pool ratio if there are existing reserves.
        if reserve_a > 0 || reserve_b > 0 {
            // a / b must equal reserve_a / reserve_b
            // → amount_a * reserve_b == amount_b * reserve_a
            assert!(
                amount_a * reserve_b == amount_b * reserve_a,
                "deposit ratio must match pool ratio"
            );
        }

        // Transfer tokens from the provider into the contract.
        let token_a_addr: Address = env.storage().instance().get(&DataKey::TokenA).unwrap();
        let token_b_addr: Address = env.storage().instance().get(&DataKey::TokenB).unwrap();
        token::Client::new(&env, &token_a_addr)
            .transfer(&provider, &env.current_contract_address(), &amount_a);
        token::Client::new(&env, &token_b_addr)
            .transfer(&provider, &env.current_contract_address(), &amount_b);

        // Mint shares using geometric-mean formula (Uniswap v2 style).
        let shares_minted = if total_shares == 0 {
            // First deposit: shares = sqrt(amount_a * amount_b)
            integer_sqrt(amount_a.checked_mul(amount_b).expect("overflow"))
        } else {
            // Subsequent deposits: proportional to existing supply.
            // shares = min(a/reserve_a, b/reserve_b) * total_shares
            let s_a = amount_a * total_shares / reserve_a;
            let s_b = amount_b * total_shares / reserve_b;
            s_a.min(s_b)
        };

        assert!(shares_minted > 0, "zero shares minted");

        // Persist updated state.
        env.storage().instance().set(&DataKey::ReserveA, &(reserve_a + amount_a));
        env.storage().instance().set(&DataKey::ReserveB, &(reserve_b + amount_b));
        env.storage().instance().set(&DataKey::TotalShares, &(total_shares + shares_minted));

        let prev_shares: i128 = env
            .storage()
            .instance()
            .get(&DataKey::LpShare(provider.clone()))
            .unwrap_or(0);
        env.storage()
            .instance()
            .set(&DataKey::LpShare(provider.clone()), &(prev_shares + shares_minted));

        env.events().publish(
            (Symbol::new(&env, "deposit"),),
            (provider, amount_a, amount_b, shares_minted),
        );

        shares_minted
    }

    // ── Withdraw / Remove Liquidity ────────────────────────────────────────

    /// Burn \`shares\` LP tokens and receive the proportional pool assets.
    ///
    /// Returns (amount_a, amount_b) sent back to the provider.
    pub fn withdraw(env: Env, provider: Address, shares: i128) -> (i128, i128) {
        provider.require_auth();
        assert!(shares > 0, "shares must be positive");

        let reserve_a: i128 = env.storage().instance().get(&DataKey::ReserveA).unwrap();
        let reserve_b: i128 = env.storage().instance().get(&DataKey::ReserveB).unwrap();
        let total_shares: i128 = env.storage().instance().get(&DataKey::TotalShares).unwrap();
        let provider_shares: i128 = env
            .storage()
            .instance()
            .get(&DataKey::LpShare(provider.clone()))
            .unwrap_or(0);

        assert!(provider_shares >= shares, "insufficient LP shares");
        assert!(total_shares > 0, "pool is empty");

        // Proportional redemption.
        let amount_a = shares * reserve_a / total_shares;
        let amount_b = shares * reserve_b / total_shares;
        assert!(amount_a > 0 && amount_b > 0, "zero-amount withdrawal");

        // Burn shares.
        env.storage().instance().set(
            &DataKey::LpShare(provider.clone()),
            &(provider_shares - shares),
        );
        env.storage().instance().set(&DataKey::TotalShares, &(total_shares - shares));
        env.storage().instance().set(&DataKey::ReserveA, &(reserve_a - amount_a));
        env.storage().instance().set(&DataKey::ReserveB, &(reserve_b - amount_b));

        // Send tokens back.
        let token_a_addr: Address = env.storage().instance().get(&DataKey::TokenA).unwrap();
        let token_b_addr: Address = env.storage().instance().get(&DataKey::TokenB).unwrap();
        token::Client::new(&env, &token_a_addr)
            .transfer(&env.current_contract_address(), &provider, &amount_a);
        token::Client::new(&env, &token_b_addr)
            .transfer(&env.current_contract_address(), &provider, &amount_b);

        env.events().publish(
            (Symbol::new(&env, "withdraw"),),
            (provider, shares, amount_a, amount_b),
        );

        (amount_a, amount_b)
    }

    // ── Swap ───────────────────────────────────────────────────────────────

    /// Swap an exact \`amount_in\` of \`token_in\` for as many of the other token
    /// as the constant-product formula allows, subject to a 0.3 % fee.
    ///
    /// \`min_amount_out\` guards against excessive slippage (set to 1 to disable).
    ///
    /// Returns the amount of the output token transferred to \`recipient\`.
    pub fn swap(
        env: Env,
        caller: Address,
        token_in: Address,
        amount_in: i128,
        min_amount_out: i128,
        recipient: Address,
    ) -> i128 {
        caller.require_auth();
        assert!(amount_in > 0, "amount_in must be positive");
        assert!(min_amount_out >= 0, "min_amount_out must be non-negative");

        let token_a_addr: Address = env.storage().instance().get(&DataKey::TokenA).unwrap();
        let token_b_addr: Address = env.storage().instance().get(&DataKey::TokenB).unwrap();

        let (reserve_in_key, reserve_out_key, token_out_addr) =
            if token_in == token_a_addr {
                (DataKey::ReserveA, DataKey::ReserveB, token_b_addr.clone())
            } else if token_in == token_b_addr {
                (DataKey::ReserveB, DataKey::ReserveA, token_a_addr.clone())
            } else {
                panic!("token_in is not part of this pool");
            };

        let reserve_in: i128 = env.storage().instance().get(&reserve_in_key).unwrap();
        let reserve_out: i128 = env.storage().instance().get(&reserve_out_key).unwrap();
        assert!(reserve_in > 0 && reserve_out > 0, "pool has no liquidity");

        // Constant-product swap with fee:
        //   amount_out = (amount_in * fee_num * reserve_out)
        //              / (reserve_in * fee_den + amount_in * fee_num)
        let amount_in_with_fee = amount_in
            .checked_mul(FEE_NUMERATOR)
            .expect("overflow");
        let numerator = amount_in_with_fee
            .checked_mul(reserve_out)
            .expect("overflow");
        let denominator = reserve_in
            .checked_mul(FEE_DENOMINATOR)
            .expect("overflow")
            .checked_add(amount_in_with_fee)
            .expect("overflow");
        let amount_out = numerator / denominator;

        assert!(amount_out >= min_amount_out, "slippage too high");
        assert!(amount_out > 0, "zero output amount");

        // Transfer input tokens into the pool.
        token::Client::new(&env, &token_in)
            .transfer(&caller, &env.current_contract_address(), &amount_in);

        // Transfer output tokens to the recipient.
        token::Client::new(&env, &token_out_addr)
            .transfer(&env.current_contract_address(), &recipient, &amount_out);

        // Update reserves.
        env.storage()
            .instance()
            .set(&reserve_in_key, &(reserve_in + amount_in));
        env.storage()
            .instance()
            .set(&reserve_out_key, &(reserve_out - amount_out));

        env.events().publish(
            (Symbol::new(&env, "swap"),),
            (caller, token_in, amount_in, amount_out, recipient),
        );

        amount_out
    }

    // ── Read-only getters ──────────────────────────────────────────────────

    pub fn get_reserves(env: Env) -> (i128, i128) {
        let a: i128 = env.storage().instance().get(&DataKey::ReserveA).unwrap_or(0);
        let b: i128 = env.storage().instance().get(&DataKey::ReserveB).unwrap_or(0);
        (a, b)
    }

    pub fn get_total_shares(env: Env) -> i128 {
        env.storage().instance().get(&DataKey::TotalShares).unwrap_or(0)
    }

    pub fn get_lp_shares(env: Env, provider: Address) -> i128 {
        env.storage()
            .instance()
            .get(&DataKey::LpShare(provider))
            .unwrap_or(0)
    }

    /// Quote: how many output tokens will \`amount_in\` of token A buy?
    pub fn quote_swap_a_to_b(env: Env, amount_in: i128) -> i128 {
        let reserve_a: i128 = env.storage().instance().get(&DataKey::ReserveA).unwrap_or(0);
        let reserve_b: i128 = env.storage().instance().get(&DataKey::ReserveB).unwrap_or(0);
        if reserve_a == 0 || reserve_b == 0 {
            return 0;
        }
        let num = amount_in * FEE_NUMERATOR * reserve_b;
        let den = reserve_a * FEE_DENOMINATOR + amount_in * FEE_NUMERATOR;
        num / den
    }
}

// ─── Math helpers ──────────────────────────────────────────────────────────

/// Integer square root via Newton–Raphson (floor).
fn integer_sqrt(n: i128) -> i128 {
    if n <= 0 {
        return 0;
    }
    let mut x = n;
    let mut y = (x + 1) / 2;
    while y < x {
        x = y;
        y = (x + n / x) / 2;
    }
    x
}

mod test;
`,
      },
      {
        name: "test.rs",
        type: "file",
        language: "rust",
        content: `#![cfg(test)]

use super::*;
use soroban_sdk::{
    testutils::{Address as _, Events as _},
    token, Address, Env, IntoVal,
};

// ─── Helpers ──────────────────────────────────────────────────────────────

fn create_token(env: &Env, admin: &Address) -> (Address, token::Client) {
    let addr = env.register_stellar_asset_contract(admin.clone());
    let client = token::Client::new(env, &addr);
    (addr, client)
}

fn setup() -> (Env, Address, Address, Address, LiquidityPoolAMMClient<'static>) {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let (token_a_addr, token_a) = create_token(&env, &admin);
    let (token_b_addr, token_b) = create_token(&env, &admin);

    let pool_id = env.register_contract(None, LiquidityPoolAMM);
    let pool = LiquidityPoolAMMClient::new(&env, &pool_id);

    pool.initialize(&token_a_addr, &token_b_addr);

    (env, token_a_addr, token_b_addr, pool_id, pool)
}

// ─── Deposit tests ────────────────────────────────────────────────────────

#[test]
fn test_first_deposit_mints_shares() {
    let (env, token_a_addr, token_b_addr, pool_id, pool) = setup();
    let provider = Address::generate(&env);

    // Fund provider.
    let ta = token::StellarAssetClient::new(&env, &token_a_addr);
    let tb = token::StellarAssetClient::new(&env, &token_b_addr);
    ta.mint(&provider, &1_000_000);
    tb.mint(&provider, &1_000_000);

    // Deposit 100 A + 400 B  →  sqrt(100 * 400) = 200 shares.
    let shares = pool.deposit(&provider, &100_i128, &400_i128);
    assert_eq!(shares, 200, "first deposit should mint geometric-mean shares");
    assert_eq!(pool.get_total_shares(), 200);

    let (ra, rb) = pool.get_reserves();
    assert_eq!(ra, 100);
    assert_eq!(rb, 400);
}

#[test]
fn test_subsequent_deposit_proportional() {
    let (env, token_a_addr, token_b_addr, pool_id, pool) = setup();
    let p1 = Address::generate(&env);
    let p2 = Address::generate(&env);

    let ta = token::StellarAssetClient::new(&env, &token_a_addr);
    let tb = token::StellarAssetClient::new(&env, &token_b_addr);
    ta.mint(&p1, &1_000_000);
    tb.mint(&p1, &1_000_000);
    ta.mint(&p2, &1_000_000);
    tb.mint(&p2, &1_000_000);

    // First deposit: 100 A + 100 B → 100 shares.
    pool.deposit(&p1, &100_i128, &100_i128);
    // Second deposit: same ratio → proportional shares.
    let shares2 = pool.deposit(&p2, &50_i128, &50_i128);
    assert_eq!(shares2, 50);
    assert_eq!(pool.get_total_shares(), 150);
}

// ─── Swap tests ───────────────────────────────────────────────────────────

#[test]
fn test_swap_constant_product() {
    let (env, token_a_addr, token_b_addr, pool_id, pool) = setup();
    let lp = Address::generate(&env);
    let trader = Address::generate(&env);

    let ta = token::StellarAssetClient::new(&env, &token_a_addr);
    let tb = token::StellarAssetClient::new(&env, &token_b_addr);
    ta.mint(&lp, &1_000_000);
    tb.mint(&lp, &1_000_000);
    ta.mint(&trader, &100_000);

    // Seed pool: 10 000 A + 10 000 B.
    pool.deposit(&lp, &10_000_i128, &10_000_i128);

    // Swap 1 000 A → B.
    // Expected out ≈ (1000 * 997 * 10000) / (10000 * 1000 + 1000 * 997)
    //              = 9_970_000 / 10_997_000 * 10000 ≈ 906
    let token_b_client = token::Client::new(&env, &token_b_addr);
    let before = token_b_client.balance(&trader);
    let out = pool.swap(&trader, &token_a_addr, &1_000_i128, &1_i128, &trader);
    let after = token_b_client.balance(&trader);

    assert_eq!(after - before, out);
    assert!(out > 900 && out < 1000, "output should respect 0.3% fee");

    // k should be non-decreasing (fees stay in pool).
    let (ra, rb) = pool.get_reserves();
    assert!(ra * rb >= 10_000 * 10_000, "invariant k must not decrease");
}

#[test]
fn test_swap_slippage_guard() {
    let (env, token_a_addr, token_b_addr, pool_id, pool) = setup();
    let lp = Address::generate(&env);
    let trader = Address::generate(&env);

    let ta = token::StellarAssetClient::new(&env, &token_a_addr);
    let tb = token::StellarAssetClient::new(&env, &token_b_addr);
    ta.mint(&lp, &1_000_000);
    tb.mint(&lp, &1_000_000);
    ta.mint(&trader, &100_000);

    pool.deposit(&lp, &1_000_i128, &1_000_i128);

    // Demand an unrealistically large output → should panic with slippage error.
    let result = std::panic::catch_unwind(|| {
        pool.swap(&trader, &token_a_addr, &100_i128, &999_i128, &trader)
    });
    assert!(result.is_err(), "should panic on slippage violation");
}

// ─── Withdraw tests ───────────────────────────────────────────────────────

#[test]
fn test_withdraw_returns_proportional_assets() {
    let (env, token_a_addr, token_b_addr, pool_id, pool) = setup();
    let provider = Address::generate(&env);

    let ta_client = token::StellarAssetClient::new(&env, &token_a_addr);
    let tb_client = token::StellarAssetClient::new(&env, &token_b_addr);
    ta_client.mint(&provider, &1_000_000);
    tb_client.mint(&provider, &1_000_000);

    let shares = pool.deposit(&provider, &1_000_i128, &2_000_i128);

    let ta = token::Client::new(&env, &token_a_addr);
    let tb = token::Client::new(&env, &token_b_addr);
    let a_before = ta.balance(&provider);
    let b_before = tb.balance(&provider);

    // Withdraw half of shares.
    let (ret_a, ret_b) = pool.withdraw(&provider, &(shares / 2));

    assert_eq!(ret_a, 500);
    assert_eq!(ret_b, 1000);
    assert_eq!(ta.balance(&provider) - a_before, 500);
    assert_eq!(tb.balance(&provider) - b_before, 1000);
}

// ─── Quote tests ──────────────────────────────────────────────────────────

#[test]
fn test_quote_is_consistent_with_swap() {
    let (env, token_a_addr, token_b_addr, pool_id, pool) = setup();
    let lp = Address::generate(&env);
    let trader = Address::generate(&env);

    let ta = token::StellarAssetClient::new(&env, &token_a_addr);
    let tb = token::StellarAssetClient::new(&env, &token_b_addr);
    ta.mint(&lp, &1_000_000);
    tb.mint(&lp, &1_000_000);
    ta.mint(&trader, &100_000);

    pool.deposit(&lp, &10_000_i128, &10_000_i128);

    let quoted = pool.quote_swap_a_to_b(&500_i128);
    let actual = pool.swap(&trader, &token_a_addr, &500_i128, &1_i128, &trader);

    assert_eq!(quoted, actual, "quote must match actual swap output");
}
`,
      },
      {
        name: "Cargo.toml",
        type: "file",
        language: "toml",
        content: `[package]
name = "liquidity-pool-amm"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib"]

[dependencies]
soroban-sdk = { workspace = true }

[dev-dependencies]
soroban-sdk = { workspace = true, features = ["testutils"] }
`,
      },
    ],
  },
  // ── DAO Governance Voting ─────────────────────────────────────────────────
  {
    name: "dao_voting",
    type: "folder",
    children: [
      {
        name: "lib.rs",
        type: "file",
        language: "rust",
        content: `#![no_std]

//! DAO Governance Voting — minimal proposal + voting reference example.
//!
//! Showcases:
//!   * One-time admin initialisation
//!   * Admin-only proposal creation with a deadline (unix-seconds)
//!   * One-vote-per-voter enforcement via HasVoted(proposal_id, voter)
//!   * Yes / No / Abstain tallies stored on the proposal record itself
//!   * Explicit \`require_auth\` on every state-changing call
//!
//! Security notes:
//!   * Voters must sign — \`voter.require_auth()\` is the only guard against
//!     ballot-stuffing by a third party.
//!   * Deadline is checked with strict \`<\` so a vote arriving exactly at the
//!     deadline is rejected.
//!   * Once finalised, no further votes are accepted even before the deadline.
//!   * Proposal records live in persistent storage with TTL extensions so
//!     post-vote results stay queryable.

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, symbol_short,
    Address, Env, String,
};

const PROPOSAL_TTL_LEDGERS: u32 = 200_000; // ~12 days at 5s ledgers

#[contracttype]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Vote {
    Yes,
    No,
    Abstain,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct Proposal {
    pub id: u32,
    pub title: String,
    pub proposer: Address,
    pub voting_ends_at: u64,
    pub yes_count: u32,
    pub no_count: u32,
    pub abstain_count: u32,
    pub finalized: bool,
}

#[contracttype]
pub enum DataKey {
    Admin,
    NextProposalId,
    Proposal(u32),
    HasVoted(u32, Address),
}

#[contracterror]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
#[repr(u32)]
pub enum DaoError {
    NotInitialized = 1,
    AlreadyInitialized = 2,
    NotAdmin = 3,
    ProposalNotFound = 4,
    VotingClosed = 5,
    AlreadyVoted = 6,
    VotingStillOpen = 7,
    AlreadyFinalized = 8,
}

#[contract]
pub struct DaoVotingContract;

#[contractimpl]
impl DaoVotingContract {
    /// One-time setup. Stores the DAO admin and seeds the proposal counter.
    pub fn initialize(env: Env, admin: Address) -> Result<(), DaoError> {
        if env.storage().instance().has(&DataKey::Admin) {
            return Err(DaoError::AlreadyInitialized);
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::NextProposalId, &0u32);
        Ok(())
    }

    /// Admin-only. Creates a proposal with a voting window of \`duration_secs\`
    /// seconds from the current ledger close timestamp. Returns the id.
    pub fn create_proposal(
        env: Env,
        proposer: Address,
        title: String,
        duration_secs: u64,
    ) -> Result<u32, DaoError> {
        proposer.require_auth();

        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(DaoError::NotInitialized)?;
        if proposer != admin {
            return Err(DaoError::NotAdmin);
        }

        let id: u32 = env
            .storage()
            .instance()
            .get(&DataKey::NextProposalId)
            .unwrap_or(0);
        let now = env.ledger().timestamp();

        let proposal = Proposal {
            id,
            title,
            proposer: proposer.clone(),
            voting_ends_at: now + duration_secs,
            yes_count: 0,
            no_count: 0,
            abstain_count: 0,
            finalized: false,
        };
        env.storage().persistent().set(&DataKey::Proposal(id), &proposal);
        env.storage().persistent().extend_ttl(
            &DataKey::Proposal(id),
            PROPOSAL_TTL_LEDGERS,
            PROPOSAL_TTL_LEDGERS,
        );

        env.storage()
            .instance()
            .set(&DataKey::NextProposalId, &(id + 1));

        env.events()
            .publish((symbol_short!("created"), id), proposer);
        Ok(id)
    }

    /// One vote per (proposal, voter). Rejected once the deadline passes or
    /// the proposal is finalised. Requires the voter's signature.
    pub fn vote(
        env: Env,
        voter: Address,
        proposal_id: u32,
        choice: Vote,
    ) -> Result<(), DaoError> {
        voter.require_auth();

        let mut proposal: Proposal = env
            .storage()
            .persistent()
            .get(&DataKey::Proposal(proposal_id))
            .ok_or(DaoError::ProposalNotFound)?;

        if proposal.finalized {
            return Err(DaoError::AlreadyFinalized);
        }
        if env.ledger().timestamp() >= proposal.voting_ends_at {
            return Err(DaoError::VotingClosed);
        }

        let voted_key = DataKey::HasVoted(proposal_id, voter.clone());
        let already_voted: bool = env
            .storage()
            .persistent()
            .get(&voted_key)
            .unwrap_or(false);
        if already_voted {
            return Err(DaoError::AlreadyVoted);
        }

        match choice {
            Vote::Yes => proposal.yes_count += 1,
            Vote::No => proposal.no_count += 1,
            Vote::Abstain => proposal.abstain_count += 1,
        }

        env.storage()
            .persistent()
            .set(&DataKey::Proposal(proposal_id), &proposal);
        env.storage().persistent().set(&voted_key, &true);
        env.storage().persistent().extend_ttl(
            &voted_key,
            PROPOSAL_TTL_LEDGERS,
            PROPOSAL_TTL_LEDGERS,
        );

        env.events()
            .publish((symbol_short!("voted"), proposal_id), voter);
        Ok(())
    }

    /// Returns the proposal record (including current tallies).
    pub fn get_proposal(env: Env, proposal_id: u32) -> Result<Proposal, DaoError> {
        env.storage()
            .persistent()
            .get(&DataKey::Proposal(proposal_id))
            .ok_or(DaoError::ProposalNotFound)
    }

    /// Number of proposals created so far (also the next id to be assigned).
    pub fn proposal_count(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&DataKey::NextProposalId)
            .unwrap_or(0)
    }

    /// Locks the tallies once the voting window has closed. Anyone may call;
    /// idempotent up to "already finalised".
    pub fn finalize(env: Env, proposal_id: u32) -> Result<(), DaoError> {
        let mut proposal: Proposal = env
            .storage()
            .persistent()
            .get(&DataKey::Proposal(proposal_id))
            .ok_or(DaoError::ProposalNotFound)?;

        if proposal.finalized {
            return Err(DaoError::AlreadyFinalized);
        }
        if env.ledger().timestamp() < proposal.voting_ends_at {
            return Err(DaoError::VotingStillOpen);
        }

        proposal.finalized = true;
        env.storage()
            .persistent()
            .set(&DataKey::Proposal(proposal_id), &proposal);

        env.events()
            .publish((symbol_short!("final"), proposal_id), proposal.proposer.clone());
        Ok(())
    }
}

mod test;`,
      },
      {
        name: "test.rs",
        type: "file",
        language: "rust",
        content: `#![cfg(test)]

use super::*;
use soroban_sdk::testutils::{Address as _, Ledger as _};
use soroban_sdk::{Env, String};

fn setup(env: &Env) -> (DaoVotingContractClient<'static>, Address) {
    let admin = Address::generate(env);
    let contract_id = env.register_contract(None, DaoVotingContract);
    let client = DaoVotingContractClient::new(env, &contract_id);
    env.mock_all_auths();
    client.initialize(&admin);
    (client, admin)
}

#[test]
fn initialize_is_one_shot() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin) = setup(&env);
    let second = client.try_initialize(&admin);
    assert!(second.is_err(), "re-initialize must error");
}

#[test]
fn create_and_vote_tallies_correctly() {
    let env = Env::default();
    env.ledger().with_mut(|l| l.timestamp = 1_000);

    let (client, admin) = setup(&env);
    let pid = client.create_proposal(
        &admin,
        &String::from_str(&env, "Adopt SEP-41"),
        &3_600,
    );

    let voter1 = Address::generate(&env);
    let voter2 = Address::generate(&env);
    let voter3 = Address::generate(&env);

    client.vote(&voter1, &pid, &Vote::Yes);
    client.vote(&voter2, &pid, &Vote::Yes);
    client.vote(&voter3, &pid, &Vote::No);

    let p = client.get_proposal(&pid);
    assert_eq!(p.yes_count, 2);
    assert_eq!(p.no_count, 1);
    assert_eq!(p.abstain_count, 0);
}

#[test]
fn voter_cannot_vote_twice() {
    let env = Env::default();
    env.ledger().with_mut(|l| l.timestamp = 1_000);
    let (client, admin) = setup(&env);
    let pid = client.create_proposal(&admin, &String::from_str(&env, "X"), &600);

    let voter = Address::generate(&env);
    client.vote(&voter, &pid, &Vote::Yes);

    let second = client.try_vote(&voter, &pid, &Vote::No);
    assert!(second.is_err(), "double vote must error");

    let p = client.get_proposal(&pid);
    assert_eq!(p.yes_count, 1);
    assert_eq!(p.no_count, 0);
}

#[test]
fn non_admin_cannot_create_proposal() {
    let env = Env::default();
    let (client, _admin) = setup(&env);
    let intruder = Address::generate(&env);
    let result = client.try_create_proposal(
        &intruder,
        &String::from_str(&env, "Y"),
        &600,
    );
    assert!(result.is_err(), "non-admin proposal must error");
}

#[test]
fn voting_closes_after_deadline() {
    let env = Env::default();
    env.ledger().with_mut(|l| l.timestamp = 0);
    let (client, admin) = setup(&env);
    let pid = client.create_proposal(
        &admin,
        &String::from_str(&env, "Z"),
        &100,
    );

    env.ledger().with_mut(|l| l.timestamp = 200);
    let voter = Address::generate(&env);
    let result = client.try_vote(&voter, &pid, &Vote::Yes);
    assert!(result.is_err(), "post-deadline vote must error");
}

#[test]
fn finalize_after_deadline_locks_tallies() {
    let env = Env::default();
    env.ledger().with_mut(|l| l.timestamp = 0);
    let (client, admin) = setup(&env);
    let pid = client.create_proposal(
        &admin,
        &String::from_str(&env, "Final test"),
        &50,
    );
    let voter = Address::generate(&env);
    client.vote(&voter, &pid, &Vote::Yes);

    env.ledger().with_mut(|l| l.timestamp = 100);
    client.finalize(&pid);

    let p = client.get_proposal(&pid);
    assert!(p.finalized);
    assert_eq!(p.yes_count, 1);

    let late = client.try_vote(&Address::generate(&env), &pid, &Vote::No);
    assert!(late.is_err(), "voting after finalize must error");
}

#[test]
fn finalize_before_deadline_errors() {
    let env = Env::default();
    env.ledger().with_mut(|l| l.timestamp = 0);
    let (client, admin) = setup(&env);
    let pid = client.create_proposal(
        &admin,
        &String::from_str(&env, "Open"),
        &1_000,
    );

    let result = client.try_finalize(&pid);
    assert!(result.is_err(), "early finalize must error");
}

#[test]
fn proposal_count_reflects_creations() {
    let env = Env::default();
    let (client, admin) = setup(&env);
    assert_eq!(client.proposal_count(), 0);
    client.create_proposal(&admin, &String::from_str(&env, "A"), &600);
    client.create_proposal(&admin, &String::from_str(&env, "B"), &600);
    assert_eq!(client.proposal_count(), 2);
}

#[test]
fn three_choice_tally_counts_each_bucket() {
    let env = Env::default();
    env.ledger().with_mut(|l| l.timestamp = 0);
    let (client, admin) = setup(&env);
    let pid = client.create_proposal(
        &admin,
        &String::from_str(&env, "Three-way"),
        &1_000,
    );

    for _ in 0..3 {
        client.vote(&Address::generate(&env), &pid, &Vote::Yes);
    }
    for _ in 0..2 {
        client.vote(&Address::generate(&env), &pid, &Vote::No);
    }
    client.vote(&Address::generate(&env), &pid, &Vote::Abstain);

    let p = client.get_proposal(&pid);
    assert_eq!(p.yes_count, 3);
    assert_eq!(p.no_count, 2);
    assert_eq!(p.abstain_count, 1);
}`,
      },
      {
        name: "Cargo.toml",
        type: "file",
        language: "toml",
        content: `[package]
name = "dao-voting"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib"]

[dependencies]
soroban-sdk = { workspace = true }

[dev-dependencies]
soroban-sdk = { workspace = true, features = ["testutils"] }
`,
      },
    ],
  },
];

export function findFile(nodes: FileNode[], path: string[]): FileNode | null {
  for (const node of nodes) {
    if (node.name === path[0]) {
      if (path.length === 1) return node;
      if (node.children) return findFile(node.children, path.slice(1));
    }
  }
  return null;
}
