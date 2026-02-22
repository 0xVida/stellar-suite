use soroban_sdk::{testutils::Address as _, Address, Env};
use token_contract::{TokenContract, TokenContractClient};

fn setup<'a>(env: &'a Env) -> (TokenContractClient<'a>, Address, Address, Address) {
    env.mock_all_auths();
    let contract_id = env.register_contract(None, TokenContract);
    let client = TokenContractClient::new(env, &contract_id);

    let admin = Address::generate(env);
    let alice = Address::generate(env);
    let bob = Address::generate(env);

    client.initialize(&admin);
    (client, admin, alice, bob)
}

#[test]
fn test_initialize_sets_admin_and_supply() {
    let env = Env::default();
    let (client, admin, _, _) = setup(&env);

    assert_eq!(client.admin(), admin);
    assert_eq!(client.total_supply(), 0);
}

#[test]
fn test_mint_increases_balance_and_total_supply() {
    let env = Env::default();
    let (client, admin, alice, _) = setup(&env);

    client.mint(&admin, &alice, &1000);

    assert_eq!(client.balance(&alice), 1000);
    assert_eq!(client.total_supply(), 1000);
}

#[test]
fn test_transfer_moves_tokens_between_accounts() {
    let env = Env::default();
    let (client, admin, alice, bob) = setup(&env);

    client.mint(&admin, &alice, &1000);
    client.transfer(&alice, &bob, &400);

    assert_eq!(client.balance(&alice), 600);
    assert_eq!(client.balance(&bob), 400);
    assert_eq!(client.total_supply(), 1000);
}

#[test]
fn test_burn_reduces_balance_and_total_supply() {
    let env = Env::default();
    let (client, admin, alice, _) = setup(&env);

    client.mint(&admin, &alice, &1000);
    client.burn(&alice, &250);

    assert_eq!(client.balance(&alice), 750);
    assert_eq!(client.total_supply(), 750);
}

#[test]
#[should_panic(expected = "not admin")]
fn test_non_admin_cannot_mint() {
    let env = Env::default();
    let (client, _admin, alice, bob) = setup(&env);

    client.mint(&alice, &bob, &50);
}

#[test]
#[should_panic(expected = "insufficient balance")]
fn test_transfer_fails_with_insufficient_balance() {
    let env = Env::default();
    let (client, _admin, alice, bob) = setup(&env);

    client.transfer(&alice, &bob, &1);
}

#[test]
#[should_panic(expected = "insufficient balance")]
fn test_burn_fails_with_insufficient_balance() {
    let env = Env::default();
    let (client, _admin, alice, _) = setup(&env);

    client.burn(&alice, &1);
}
