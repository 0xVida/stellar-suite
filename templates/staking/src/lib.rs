#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, token, Address, Env, log};

/// Storage keys for the contract
#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    Token,
    RewardRate,   // Reward units per staked unit per second (scaled)
    IsPaused,
    Position(Address),
    TotalStaked,
}

/// User's staking data
#[contracttype]
#[derive(Clone, Debug)]
pub struct StakingPosition {
    pub amount: i128,
    pub lock_end_time: u64,
    pub last_accrual_time: u64,
    pub accumulated_rewards: i128,
}

#[contract]
pub struct StakingContract;

#[contractimpl]
impl StakingContract {
    /// Initialize the contract with an admin, staking token, and base reward rate
    pub fn initialize(env: Env, admin: Address, token: Address, reward_rate: i128) {
        if env.storage().persistent().has(&DataKey::Admin) {
            panic!("Contract already initialized");
        }
        env.storage().persistent().set(&DataKey::Admin, &admin);
        env.storage().persistent().set(&DataKey::Token, &token);
        env.storage().persistent().set(&DataKey::RewardRate, &reward_rate);
        env.storage().persistent().set(&DataKey::IsPaused, &false);
        env.storage().persistent().set(&DataKey::TotalStaked, &0i128);
    }

    /// Stake assets for a specific duration (in seconds)
    /// Reward multipliers can be applied based on length (handled by caller or via specific tiers)
    pub fn stake(env: Env, user: Address, amount: i128, lock_duration: u64) {
        user.require_auth();
        Self::ensure_not_paused(&env);

        if amount <= 0 {
            panic!("Staking amount must be greater than zero");
        }

        // Transfer tokens from user to contract
        let token_addr = Self::get_token(&env);
        let client = token::Client::new(&env, &token_addr);
        client.transfer(&user, &env.current_contract_address(), &amount);

        let mut position = Self::get_position(env.clone(), user.clone()).unwrap_or(StakingPosition {
            amount: 0,
            lock_end_time: 0,
            last_accrual_time: env.ledger().timestamp(),
            accumulated_rewards: 0,
        });

        // Accrue pending rewards before adding new stake
        if position.amount > 0 {
            position.accumulated_rewards = Self::calculate_pending_rewards(&env, &position);
        }
        
        position.amount += amount;
        position.last_accrual_time = env.ledger().timestamp();
        
        // Update lock time if new lock is longer than existing
        let new_lock_end = env.ledger().timestamp().checked_add(lock_duration).expect("Time overflow");
        if new_lock_end > position.lock_end_time {
            position.lock_end_time = new_lock_end;
        }

        // Update global state
        let total_staked = env.storage().persistent().get::<_, i128>(&DataKey::TotalStaked).unwrap_or(0);
        env.storage().persistent().set(&DataKey::TotalStaked, &(total_staked + amount));
        
        env.storage().persistent().set(&DataKey::Position(user.clone()), &position);
        
        log!(&env, "Staked amount: {}, user: {}, lock_end: {}", amount, user, position.lock_end_time);
    }

    /// Unstake assets. Only possible after lock_end_time has passed.
    pub fn unstake(env: Env, user: Address, amount: i128) {
        user.require_auth();
        
        let mut position = Self::get_position(env.clone(), user.clone()).expect("No staking position found");
        
        if amount <= 0 || amount > position.amount {
            panic!("Invalid unstake amount");
        }

        if env.ledger().timestamp() < position.lock_end_time {
            panic!("Assets are currently locked until {} (current time: {})", position.lock_end_time, env.ledger().timestamp());
        }

        // Final accrual before withdrawal
        position.accumulated_rewards = Self::calculate_pending_rewards(&env, &position);
        position.last_accrual_time = env.ledger().timestamp();
        
        position.amount -= amount;

        // Transfer tokens back to user
        let token_addr = Self::get_token(&env);
        let client = token::Client::new(&env, &token_addr);
        client.transfer(&env.current_contract_address(), &user, &amount);

        // Update global state
        let total_staked = env.storage().persistent().get::<_, i128>(&DataKey::TotalStaked).unwrap_or(0);
        env.storage().persistent().set(&DataKey::TotalStaked, &(total_staked - amount));

        if position.amount == 0 && position.accumulated_rewards == 0 {
            env.storage().persistent().remove(&DataKey::Position(user.clone()));
        } else {
            env.storage().persistent().set(&DataKey::Position(user.clone()), &position);
        }

        log!(&env, "Unstaked amount: {}, user: {}", amount, user);
    }

    /// Claim accrued rewards without unstaking
    pub fn claim_rewards(env: Env, user: Address) {
        user.require_auth();

        let mut position = Self::get_position(env.clone(), user.clone()).expect("No staking position found");
        
        let total_rewards = Self::calculate_pending_rewards(&env, &position);
        if total_rewards <= 0 {
            panic!("No rewards to claim");
        }

        position.accumulated_rewards = 0;
        position.last_accrual_time = env.ledger().timestamp();
        env.storage().persistent().set(&DataKey::Position(user.clone()), &position);

        let token_addr = Self::get_token(&env);
        let client = token::Client::new(&env, &token_addr);
        client.transfer(&env.current_contract_address(), &user, &total_rewards);

        log!(&env, "Claimed rewards: {}, user: {}", total_rewards, user);
    }

    /// Admin: Update the global reward rate
    pub fn update_reward_rate(env: Env, new_rate: i128) {
        Self::ensure_admin(&env);
        if new_rate < 0 {
            panic!("Reward rate cannot be negative");
        }
        env.storage().persistent().set(&DataKey::RewardRate, &new_rate);
        log!(&env, "Reward rate updated to: {}", new_rate);
    }

    /// Admin: Pause the contract deposit/staking functions
    pub fn pause(env: Env) {
        Self::ensure_admin(&env);
        env.storage().persistent().set(&DataKey::IsPaused, &true);
        log!(&env, "Contract paused");
    }

    /// Admin: Unpause the contract
    pub fn unpause(env: Env) {
        Self::ensure_admin(&env);
        env.storage().persistent().set(&DataKey::IsPaused, &false);
        log!(&env, "Contract unpaused");
    }

    /// View: Get staking position of a user
    pub fn get_position(env: Env, user: Address) -> Option<StakingPosition> {
        env.storage().persistent().get(&DataKey::Position(user))
    }

    /// View: Get current pending rewards for a user (unclaimed)
    pub fn get_pending_rewards(env: Env, user: Address) -> i128 {
        let position = Self::get_position(env.clone(), user.clone()).unwrap_or(StakingPosition {
            amount: 0,
            lock_end_time: 0,
            last_accrual_time: 0,
            accumulated_rewards: 0,
        });
        Self::calculate_pending_rewards(&env, &position)
    }

    // Helper functions

    fn calculate_pending_rewards(env: &Env, position: &StakingPosition) -> i128 {
        let now = env.ledger().timestamp();
        if now <= position.last_accrual_time || position.amount == 0 {
            return position.accumulated_rewards;
        }

        let reward_rate = env.storage().persistent().get::<_, i128>(&DataKey::RewardRate).unwrap_or(0);
        let elapsed_time = (now - position.last_accrual_time) as i128;
        
        // Linear Reward Accrual: rewards = amount * rate * time
        // Note: In production, rate should be scaled to handle decimals (e.g. rate per 10^7 units)
        let newly_accrued = position.amount
            .checked_mul(reward_rate).expect("Multiplication overflow")
            .checked_mul(elapsed_time).expect("Time calculation overflow");

        position.accumulated_rewards.checked_add(newly_accrued).expect("Total rewards overflow")
    }

    fn ensure_admin(env: &Env) {
        let admin = env.storage().persistent().get::<_, Address>(&DataKey::Admin).expect("No admin set");
        admin.require_auth();
    }

    fn ensure_not_paused(env: &Env) {
        let paused = env.storage().persistent().get::<_, bool>(&DataKey::IsPaused).unwrap_or(false);
        if paused {
            panic!("Contract is currently paused");
        }
    }

    fn get_token(env: &Env) -> Address {
        env.storage().persistent().get::<_, Address>(&DataKey::Token).expect("Token not configured")
    }
}
