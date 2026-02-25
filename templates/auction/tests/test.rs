#![cfg(test)]

use auction_contract::{AuctionContract, AuctionContractClient, AuctionDetails};
use soroban_sdk::{testutils::{Address as _, Ledger}, token, Address, Env};

fn setup_test(env: &Env) -> (Address, Address, Address, token::Client, token::Client, AuctionContractClient, token::StellarAssetClient, token::StellarAssetClient) {
    env.mock_all_auths();

    let seller = Address::generate(env);
    let asset_owner = Address::generate(env);
    let bidder1 = Address::generate(env);
    let bidder2 = Address::generate(env);
    
    // Create Asset Token (e.g., NFT or specific Token)
    let asset_token_id = env.register_stellar_asset_contract(asset_owner.clone());
    let asset_token = token::Client::new(env, &asset_token_id);
    let asset_admin = token::StellarAssetClient::new(env, &asset_token_id);
    
    // Create Bid Token (e.g., native XLM)
    let bid_token_id = env.register_stellar_asset_contract(Address::generate(env));
    let bid_token = token::Client::new(env, &bid_token_id);
    let bid_admin = token::StellarAssetClient::new(env, &bid_token_id);

    // Register auction contract
    let contract_id = env.register_contract(None, AuctionContract);
    let client = AuctionContractClient::new(env, &contract_id);

    (seller, bidder1, bidder2, asset_token, bid_token, client, asset_admin, bid_admin)
}

#[test]
fn test_successful_auction_flow() {
    let env = Env::default();
    let (seller, bidder1, bidder2, asset_token, bid_token, client, asset_admin, bid_admin) = setup_test(&env);

    // Mint asset to seller
    asset_admin.mint(&seller, &1);
    
    // Create auction: 1 asset, reserve 10, duration 3600s
    client.create_auction(&seller, &asset_token.address, &1, &bid_token.address, &10, &3600);

    // Bidder 1 bids 15
    bid_admin.mint(&bidder1, &100);
    client.place_bid(&bidder1, &15);
    assert_eq!(bid_token.balance(&bidder1), 85);

    // Bidder 2 bids 20
    bid_admin.mint(&bidder2, &100);
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
    let (seller, bidder1, _, asset_token, bid_token, client, asset_admin, bid_admin) = setup_test(&env);

    asset_admin.mint(&seller, &1);
    client.create_auction(&seller, &asset_token.address, &1, &bid_token.address, &100, &3600);

    bid_admin.mint(&bidder1, &50);
    client.place_bid(&bidder1, &50);
}

#[test]
#[should_panic(expected = "Auction has ended")]
fn test_bid_after_end() {
    let env = Env::default();
    let (seller, bidder1, _, asset_token, bid_token, client, asset_admin, bid_admin) = setup_test(&env);

    asset_admin.mint(&seller, &1);
    client.create_auction(&seller, &asset_token.address, &1, &bid_token.address, &10, &3600);

    env.ledger().with_mut(|li| li.timestamp += 3601);
    
    bid_admin.mint(&bidder1, &50);
    client.place_bid(&bidder1, &50);
}

#[test]
fn test_settle_with_no_bids() {
    let env = Env::default();
    let (seller, _, _, asset_token, bid_token, client, asset_admin, _bid_admin) = setup_test(&env);

    asset_admin.mint(&seller, &1);
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
    let (seller, _, _, asset_token, bid_token, client, asset_admin, _bid_admin) = setup_test(&env);

    asset_admin.mint(&seller, &1);
    client.create_auction(&seller, &asset_token.address, &1, &bid_token.address, &10, &3600);

    client.settle();
}

#[test]
#[should_panic(expected = "Auction already exists")]
fn test_create_auction_already_exists() {
    let env = Env::default();
    let (seller, _, _, asset_token, bid_token, client, asset_admin, _bid_admin) = setup_test(&env);

    asset_admin.mint(&seller, &1);
    
    // First creation
    client.create_auction(&seller, &asset_token.address, &1, &bid_token.address, &10, &3600);
    
    // Second creation should panic
    client.create_auction(&seller, &asset_token.address, &1, &bid_token.address, &10, &3600);
}

#[test]
#[should_panic(expected = "Invalid auction parameters")]
fn test_create_auction_zero_asset() {
    let env = Env::default();
    let (seller, _, _, asset_token, bid_token, client, _asset_admin, _bid_admin) = setup_test(&env);
    client.create_auction(&seller, &asset_token.address, &0, &bid_token.address, &10, &3600);
}

#[test]
#[should_panic(expected = "Invalid auction parameters")]
fn test_create_auction_negative_reserve() {
    let env = Env::default();
    let (seller, _, _, asset_token, bid_token, client, asset_admin, _bid_admin) = setup_test(&env);
    asset_admin.mint(&seller, &1);
    client.create_auction(&seller, &asset_token.address, &1, &bid_token.address, &-1, &3600);
}

#[test]
#[should_panic(expected = "Invalid auction parameters")]
fn test_create_auction_zero_duration() {
    let env = Env::default();
    let (seller, _, _, asset_token, bid_token, client, asset_admin, _bid_admin) = setup_test(&env);
    asset_admin.mint(&seller, &1);
    client.create_auction(&seller, &asset_token.address, &1, &bid_token.address, &10, &0);
}

#[test]
fn test_get_auction_details() {
    let env = Env::default();
    let (seller, _, _, asset_token, bid_token, client, asset_admin, _bid_admin) = setup_test(&env);
    asset_admin.mint(&seller, &1);
    client.create_auction(&seller, &asset_token.address, &1, &bid_token.address, &10, &3600);

    let details = client.get_auction_details();
    assert_eq!(details.asset_amount, 1);
    assert_eq!(details.reserve_price, 10);
    assert_eq!(details.seller, seller);
}

#[test]
#[should_panic(expected = "Bid must be higher than current highest bid")]
fn test_bid_tied() {
    let env = Env::default();
    let (seller, bidder1, bidder2, asset_token, bid_token, client, asset_admin, bid_admin) = setup_test(&env);

    asset_admin.mint(&seller, &1);
    client.create_auction(&seller, &asset_token.address, &1, &bid_token.address, &10, &3600);

    bid_admin.mint(&bidder1, &50);
    client.place_bid(&bidder1, &20);
    
    bid_admin.mint(&bidder2, &50);
    client.place_bid(&bidder2, &20);
}

#[test]
fn test_multiple_bids_same_user() {
    let env = Env::default();
    let (seller, bidder1, _, asset_token, bid_token, client, asset_admin, bid_admin) = setup_test(&env);

    asset_admin.mint(&seller, &1);
    client.create_auction(&seller, &asset_token.address, &1, &bid_token.address, &10, &3600);

    bid_admin.mint(&bidder1, &100);
    client.place_bid(&bidder1, &20);
    assert_eq!(bid_token.balance(&bidder1), 80);

    // Bids again with higher
    client.place_bid(&bidder1, &30);
    
    // Balance should be 100 - 30 = 70 (previous 20 is refunded)
    assert_eq!(bid_token.balance(&bidder1), 70);
    
    let (highest_bidder, highest_bid) = client.get_highest_bid();
    assert_eq!(highest_bidder, Some(bidder1));
    assert_eq!(highest_bid, 30);
}

#[test]
#[should_panic(expected = "Auction already settled")]
fn test_bid_after_settle() {
    let env = Env::default();
    let (seller, bidder1, _, asset_token, bid_token, client, asset_admin, bid_admin) = setup_test(&env);

    asset_admin.mint(&seller, &1);
    client.create_auction(&seller, &asset_token.address, &1, &bid_token.address, &10, &3600);

    env.ledger().with_mut(|li| li.timestamp += 3601);
    client.settle();

    bid_admin.mint(&bidder1, &50);
    client.place_bid(&bidder1, &20);
}

#[test]
#[should_panic(expected = "Auction already settled")]
fn test_settle_already_settled() {
    let env = Env::default();
    let (seller, bidder1, _, asset_token, bid_token, client, asset_admin, bid_admin) = setup_test(&env);

    asset_admin.mint(&seller, &1);
    client.create_auction(&seller, &asset_token.address, &1, &bid_token.address, &10, &3600);

    bid_admin.mint(&bidder1, &50);
    client.place_bid(&bidder1, &20);

    env.ledger().with_mut(|li| li.timestamp += 3601);
    
    // Settle first time works
    client.settle();

    // Settle second time panics
    client.settle();
}

#[test]
fn test_immediate_refund_pattern_withdraw() {
    let env = Env::default();
    let (seller, _, _, asset_token, bid_token, client, asset_admin, _bid_admin) = setup_test(&env);

    asset_admin.mint(&seller, &1);
    client.create_auction(&seller, &asset_token.address, &1, &bid_token.address, &10, &3600);

    // withdraw should panic according to the implementation block
    let res = std::panic::catch_unwind(|| {
        client.withdraw(&seller);
    });
    assert!(res.is_err());
}
