#![cfg(test)]

use auction_contract::{AuctionContract, AuctionContractClient};
use soroban_sdk::{testutils::{Address as _, Ledger}, token, Address, Env};

fn setup_test(
    env: &Env,
) -> (
    Address,
    Address,
    Address,
    Address,
    Address,
    token::Client<'_>,
    token::Client<'_>,
    AuctionContractClient<'_>,
) {
    env.mock_all_auths();

    let seller = Address::generate(env);
    let asset_owner = Address::generate(env);
    let bidder1 = Address::generate(env);
    let bidder2 = Address::generate(env);

    let asset_token_id = env.register_stellar_asset_contract_v2(asset_owner.clone()).address();
    let asset_token = token::Client::new(env, &asset_token_id);

    let bid_token_id = env.register_stellar_asset_contract_v2(Address::generate(env)).address();
    let bid_token = token::Client::new(env, &bid_token_id);

    let contract_id = env.register(AuctionContract, ());
    let client = AuctionContractClient::new(env, &contract_id);

    (
        seller,
        bidder1,
        bidder2,
        asset_token_id,
        bid_token_id,
        asset_token,
        bid_token,
        client,
    )
}

fn mint_stellar(env: &Env, token_id: &Address, to: &Address, amount: i128) {
    token::StellarAssetClient::new(env, token_id).mint(to, &amount);
}

#[test]
fn test_successful_auction_flow() {
    let env = Env::default();
    let (seller, bidder1, bidder2, asset_token_id, bid_token_id, asset_token, bid_token, client) =
        setup_test(&env);

    mint_stellar(&env, &asset_token_id, &seller, 1);
    client.create_auction(&seller, &asset_token_id, &1, &bid_token_id, &10, &3600);

    mint_stellar(&env, &bid_token_id, &bidder1, 100);
    client.place_bid(&bidder1, &15);
    assert_eq!(bid_token.balance(&bidder1), 85);

    mint_stellar(&env, &bid_token_id, &bidder2, 100);
    client.place_bid(&bidder2, &20);

    assert_eq!(bid_token.balance(&bidder1), 100);
    assert_eq!(bid_token.balance(&bidder2), 80);

    env.ledger().with_mut(|li| li.timestamp += 3601);
    client.settle();

    assert_eq!(bid_token.balance(&seller), 20);
    assert_eq!(asset_token.balance(&bidder2), 1);
}

#[test]
#[should_panic(expected = "Bid lower than reserve price")]
fn test_bid_lower_than_reserve() {
    let env = Env::default();
    let (seller, bidder1, _, asset_token_id, bid_token_id, _asset_token, _bid_token, client) =
        setup_test(&env);

    mint_stellar(&env, &asset_token_id, &seller, 1);
    client.create_auction(&seller, &asset_token_id, &1, &bid_token_id, &100, &3600);

    mint_stellar(&env, &bid_token_id, &bidder1, 50);
    client.place_bid(&bidder1, &50);
}

#[test]
#[should_panic(expected = "Auction has ended")]
fn test_bid_after_end() {
    let env = Env::default();
    let (seller, bidder1, _, asset_token_id, bid_token_id, _asset_token, _bid_token, client) =
        setup_test(&env);

    mint_stellar(&env, &asset_token_id, &seller, 1);
    client.create_auction(&seller, &asset_token_id, &1, &bid_token_id, &10, &3600);

    env.ledger().with_mut(|li| li.timestamp += 3601);

    mint_stellar(&env, &bid_token_id, &bidder1, 50);
    client.place_bid(&bidder1, &50);
}

#[test]
fn test_settle_with_no_bids() {
    let env = Env::default();
    let (seller, _, _, asset_token_id, bid_token_id, asset_token, _bid_token, client) =
        setup_test(&env);

    mint_stellar(&env, &asset_token_id, &seller, 1);
    client.create_auction(&seller, &asset_token_id, &1, &bid_token_id, &10, &3600);

    env.ledger().with_mut(|li| li.timestamp += 3601);
    client.settle();

    assert_eq!(asset_token.balance(&seller), 1);
}

#[test]
#[should_panic(expected = "Auction has not ended yet")]
fn test_settle_too_early() {
    let env = Env::default();
    let (seller, _, _, asset_token_id, bid_token_id, _asset_token, _bid_token, client) =
        setup_test(&env);

    mint_stellar(&env, &asset_token_id, &seller, 1);
    client.create_auction(&seller, &asset_token_id, &1, &bid_token_id, &10, &3600);

    client.settle();
}
