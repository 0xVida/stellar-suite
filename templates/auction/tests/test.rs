#![cfg(test)]

use auction_contract::{AuctionContract, AuctionContractClient, AuctionDetails};
use soroban_sdk::{testutils::{Address as _, Ledger}, token, Address, Env};

fn setup_test(env: &Env) -> (Address, Address, Address, token::Client, token::Client, AuctionContractClient) {
    env.mock_all_auths();

    let seller = Address::generate(env);
    let asset_owner = Address::generate(env);
    let bidder1 = Address::generate(env);
    let bidder2 = Address::generate(env);
    
    // Create Asset Token (e.g., NFT or specific Token)
    let asset_token_id = env.register_stellar_asset_contract(asset_owner.clone());
    let asset_token = token::Client::new(env, &asset_token_id);
    
    // Create Bid Token (e.g., native XLM)
    let bid_token_id = env.register_stellar_asset_contract(Address::generate(env));
    let bid_token = token::Client::new(env, &bid_token_id);

    // Register auction contract
    let contract_id = env.register_contract(None, AuctionContract);
    let client = AuctionContractClient::new(env, &contract_id);

    (seller, bidder1, bidder2, asset_token, bid_token, client)
}

#[test]
fn test_successful_auction_flow() {
    let env = Env::default();
    let (seller, bidder1, bidder2, asset_token, bid_token, client) = setup_test(&env);

    // Mint asset to seller
    asset_token.mint(&seller, &1);
    
    // Create auction: 1 asset, reserve 10, duration 3600s
    client.create_auction(&seller, &asset_token.address, &1, &bid_token.address, &10, &3600);

    // Bidder 1 bids 15
    bid_token.mint(&bidder1, &100);
    client.place_bid(&bidder1, &15);
    assert_eq!(bid_token.balance(&bidder1), 85);

    // Bidder 2 bids 20
    bid_token.mint(&bidder2, &100);
    client.place_bid(&bidder2, &20);
    
    // Bidder 1 should be refunded automatically
    assert_eq!(bid_token.balance(&bidder1), 100);
    assert_eq!(bid_token.balance(&bidder2), 80);

    // Advance time beyond end
    env.ledger().with_mut(|li| li.timestamp += 3601);
    
    client.settle();

    // Seller gets highest bid (20)
    assert_eq!(bid_token.balance(&seller), 20);
    // Bidder 2 gets asset (1)
    assert_eq!(asset_token.balance(&bidder2), 1);
}

#[test]
#[should_panic(expected = "Bid lower than reserve price")]
fn test_bid_lower_than_reserve() {
    let env = Env::default();
    let (seller, bidder1, _, asset_token, bid_token, client) = setup_test(&env);

    asset_token.mint(&seller, &1);
    client.create_auction(&seller, &asset_token.address, &1, &bid_token.address, &100, &3600);

    bid_token.mint(&bidder1, &50);
    client.place_bid(&bidder1, &50);
}

#[test]
#[should_panic(expected = "Auction has ended")]
fn test_bid_after_end() {
    let env = Env::default();
    let (seller, bidder1, _, asset_token, bid_token, client) = setup_test(&env);

    asset_token.mint(&seller, &1);
    client.create_auction(&seller, &asset_token.address, &1, &bid_token.address, &10, &3600);

    env.ledger().with_mut(|li| li.timestamp += 3601);
    
    bid_token.mint(&bidder1, &50);
    client.place_bid(&bidder1, &50);
}

#[test]
fn test_settle_with_no_bids() {
    let env = Env::default();
    let (seller, _, _, asset_token, bid_token, client) = setup_test(&env);

    asset_token.mint(&seller, &1);
    client.create_auction(&seller, &asset_token.address, &1, &bid_token.address, &10, &3600);

    env.ledger().with_mut(|li| li.timestamp += 3601);
    client.settle();

    // Asset returned to seller
    assert_eq!(asset_token.balance(&seller), 1);
}

#[test]
#[should_panic(expected = "Auction has not ended yet")]
fn test_settle_too_early() {
    let env = Env::default();
    let (seller, _, _, asset_token, bid_token, client) = setup_test(&env);

    asset_token.mint(&seller, &1);
    client.create_auction(&seller, &asset_token.address, &1, &bid_token.address, &10, &3600);

    client.settle();
}
