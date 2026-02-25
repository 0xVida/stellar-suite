#![cfg(test)]

use staking_contract::{StakingContract, StakingContractClient};
use soroban_sdk::{testutils::{Address as _, Ledger}, token, Address, Env};

fn setup_test(env: &Env) -> (Address, Address, Address, token::Client, StakingContractClient) {
    env.mock_all_auths();
    let admin = Address::generate(env);
    let user = Address::generate(env);
    let token_admin = Address::generate(env);
    let token_id = env.register_stellar_asset_contract(token_admin);
    let token = token::Client::new(env, &token_id);
    let contract_id = env.register_contract(None, StakingContract);
    let client = StakingContractClient::new(env, &contract_id);
    (admin, user, token_id, token, client)
}

fn mint_tokens(env: &Env, token_id: &Address, to: &Address, amount: i128) {
    let client = token::StellarAssetClient::new(env, token_id);
    client.mint(to, &amount);
}

#[test]
fn test_initialization() {
    let env = Env::default();
    let (admin, _, token_id, _, client) = setup_test(&env);
    client.initialize(&admin, &token_id, &10i128);
    assert!(client.get_position(&Address::generate(&env)).is_none());
}

#[test]
fn test_staking_and_rewards() {
    let env = Env::default();
    let (admin, user, token_id, token, client) = setup_test(&env);
    client.initialize(&admin, &token_id, &1i128);
    mint_tokens(&env, &token_id, &user, 1000);
    
    client.stake(&user, &100i128, &100u64);
    assert_eq!(token.balance(&user), 900);

    env.ledger().with_mut(|li| li.timestamp += 50);
    assert_eq!(client.get_pending_rewards(&user), 5000i128); 

    env.ledger().with_mut(|li| li.timestamp += 100);
    assert_eq!(client.get_pending_rewards(&user), 15000i128); 

    mint_tokens(&env, &token_id, &client.address, 20000);
    client.claim_rewards(&user);
    assert_eq!(token.balance(&user), 900 + 15000);
    assert_eq!(client.get_pending_rewards(&user), 0);
}

#[test]
#[should_panic(expected = "Assets are currently locked")]
fn test_unstake_locked_fail() {
    let env = Env::default();
    let (admin, user, token_id, _, client) = setup_test(&env);
    client.initialize(&admin, &token_id, &1i128);
    mint_tokens(&env, &token_id, &user, 1000);
    client.stake(&user, &500i128, &1000u64);
    env.ledger().with_mut(|li| li.timestamp += 500);
    client.unstake(&user, &100i128);
}

#[test]
fn test_unstake_partial_and_full() {
    let env = Env::default();
    let (admin, user, token_id, token, client) = setup_test(&env);
    client.initialize(&admin, &token_id, &0i128); 
    mint_tokens(&env, &token_id, &user, 1000);
    client.stake(&user, &500i128, &100u64);
    
    env.ledger().with_mut(|li| li.timestamp += 101);
    
    client.unstake(&user, &200i128);
    assert_eq!(client.get_position(&user).unwrap().amount, 300);
    assert_eq!(token.balance(&user), 700);

    client.unstake(&user, &300i128);
    assert!(client.get_position(&user).is_none());
    assert_eq!(token.balance(&user), 1000);
}

#[test]
fn test_successive_staking_lock_extension() {
    let env = Env::default();
    let (admin, user, token_id, _, client) = setup_test(&env);
    client.initialize(&admin, &token_id, &1i128);
    mint_tokens(&env, &token_id, &user, 2000);

    client.stake(&user, &500i128, &100u64);
    assert_eq!(client.get_position(&user).unwrap().lock_end_time, 100);

    env.ledger().with_mut(|li| li.timestamp = 50);
    client.stake(&user, &500i128, &200u64);
    assert_eq!(client.get_position(&user).unwrap().lock_end_time, 250);
    assert_eq!(client.get_position(&user).unwrap().amount, 1000);
    assert_eq!(client.get_position(&user).unwrap().accumulated_rewards, 25000);
}

#[test]
fn test_multi_user_distribution() {
    let env = Env::default();
    let (admin, user1, token_id, _, client) = setup_test(&env);
    let user2 = Address::generate(&env);
    
    client.initialize(&admin, &token_id, &1i128);
    mint_tokens(&env, &token_id, &user1, 1000);
    mint_tokens(&env, &token_id, &user2, 1000);

    client.stake(&user1, &100i128, &100u64);
    env.ledger().with_mut(|li| li.timestamp = 10);
    client.stake(&user2, &200i128, &100u64);

    env.ledger().with_mut(|li| li.timestamp = 20);
    assert_eq!(client.get_pending_rewards(&user1), 2000);
    assert_eq!(client.get_pending_rewards(&user2), 2000);
}

#[test]
#[should_panic(expected = "Contract is currently paused")]
fn test_pause_staking() {
    let env = Env::default();
    let (admin, user, token_id, _, client) = setup_test(&env);
    client.initialize(&admin, &token_id, &1i128);
    mint_tokens(&env, &token_id, &user, 1000);
    client.pause();
    client.stake(&user, &100i128, &100u64);
}

#[test]
fn test_admin_update_rate() {
    let env = Env::default();
    let (admin, user, token_id, _, client) = setup_test(&env);
    client.initialize(&admin, &token_id, &1i128);
    mint_tokens(&env, &token_id, &user, 1000);
    client.stake(&user, &100i128, &100u64);
    
    env.ledger().with_mut(|li| li.timestamp += 10);
    assert_eq!(client.get_pending_rewards(&user), 1000);
    
    // Trigger accrual by staking a tiny amount (or could use claim_rewards)
    mint_tokens(&env, &token_id, &user, 1);
    client.stake(&user, &1i128, &0u64);
    
    client.update_reward_rate(&5i128);
    env.ledger().with_mut(|li| li.timestamp += 10);
    // 1000 + (101 * 5 * 10) = 1000 + 5050 = 6050
    assert_eq!(client.get_pending_rewards(&user), 6050);
}

#[test]
#[should_panic(expected = "Staking amount must be greater than zero")]
fn test_stake_zero_fail() {
    let env = Env::default();
    let (admin, user, token_id, _, client) = setup_test(&env);
    client.initialize(&admin, &token_id, &1i128);
    client.stake(&user, &0i128, &100u64);
}

#[test]
fn test_large_values_no_overflow() {
    let env = Env::default();
    let (admin, user, token_id, _, client) = setup_test(&env);
    client.initialize(&admin, &token_id, &1000i128); 
    
    let large_mount = 1_000_000_000_000_000_000i128; 
    mint_tokens(&env, &token_id, &user, large_mount);
    client.stake(&user, &large_mount, &31_536_000u64); 
    
    env.ledger().with_mut(|li| li.timestamp += 3600); 
    let rewards = client.get_pending_rewards(&user);
    assert!(rewards > 0);
}
