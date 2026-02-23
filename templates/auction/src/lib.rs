#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, token, Address, Env, log, Symbol};

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    AuctionInfo,
    HighestBidder,
    HighestBid,
    IsSettle,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct AuctionDetails {
    pub seller: Address,
    pub asset_token: Address,    // The token being auctioned
    pub asset_amount: i128,
    pub bid_token: Address,      // The token used for bidding (e.g., native XLM)
    pub reserve_price: i128,
    pub end_time: u64,
}

#[contract]
pub struct AuctionContract;

#[contractimpl]
impl AuctionContract {
    /// Initialize a new auction.
    /// The assets to be auctioned are transferred to the contract immediately.
    pub fn create_auction(
        env: Env,
        seller: Address,
        asset_token: Address,
        asset_amount: i128,
        bid_token: Address,
        reserve_price: i128,
        duration: u64,
    ) {
        if env.storage().persistent().has(&DataKey::AuctionInfo) {
            panic!("Auction already exists");
        }
        seller.require_auth();

        if asset_amount <= 0 || reserve_price < 0 || duration <= 0 {
            panic!("Invalid auction parameters");
        }

        // Lock the asset in the contract
        let asset_client = token::Client::new(&env, &asset_token);
        asset_client.transfer(&seller, &env.current_contract_address(), &asset_amount);

        let end_time = env.ledger().timestamp().checked_add(duration).expect("Time overflow");

        let details = AuctionDetails {
            seller,
            asset_token,
            asset_amount,
            bid_token,
            reserve_price,
            end_time,
        };

        env.storage().persistent().set(&DataKey::AuctionInfo, &details);
        env.storage().persistent().set(&DataKey::IsSettle, &false);
        env.storage().persistent().set(&DataKey::HighestBid, &0i128);

        log!(&env, "Auction created by {}", details.seller);
    }

    /// Place a bid on the auction.
    pub fn place_bid(env: Env, bidder: Address, amount: i128) {
        bidder.require_auth();

        let details: AuctionDetails = env.storage().persistent().get(&DataKey::AuctionInfo).expect("Auction not found");
        let is_settled: bool = env.storage().persistent().get(&DataKey::IsSettle).unwrap_or(false);

        if is_settled {
            panic!("Auction already settled");
        }

        if env.ledger().timestamp() >= details.end_time {
            panic!("Auction has ended");
        }

        if amount < details.reserve_price {
            panic!("Bid lower than reserve price");
        }

        let current_highest_bid: i128 = env.storage().persistent().get(&DataKey::HighestBid).unwrap_or(0);
        if amount <= current_highest_bid {
            panic!("Bid must be higher than current highest bid");
        }

        // Transfer funds from bidder to contract
        let bid_client = token::Client::new(&env, &details.bid_token);
        bid_client.transfer(&bidder, &env.current_contract_address(), &amount);

        // Refund the previous highest bidder
        if let Some(previous_bidder) = env.storage().persistent().get::<_, Address>(&DataKey::HighestBidder) {
            bid_client.transfer(&env.current_contract_address(), &previous_bidder, &current_highest_bid);
        }

        // Store new highest bid
        env.storage().persistent().set(&DataKey::HighestBidder, &bidder);
        env.storage().persistent().set(&DataKey::HighestBid, &amount);

        env.events().publish(
            (Symbol::new(&env, "bid"), bidder.clone()),
            amount
        );

        log!(&env, "New highest bid: {} by {}", amount, bidder);
    }

    /// Settle the auction after it has ended.
    pub fn settle(env: Env) {
        let details: AuctionDetails = env.storage().persistent().get(&DataKey::AuctionInfo).expect("Auction not found");
        let is_settled: bool = env.storage().persistent().get(&DataKey::IsSettle).unwrap_or(false);

        if is_settled {
            panic!("Auction already settled");
        }

        if env.ledger().timestamp() < details.end_time {
            panic!("Auction has not ended yet");
        }

        env.storage().persistent().set(&DataKey::IsSettle, &true);

        let highest_bidder: Option<Address> = env.storage().persistent().get(&DataKey::HighestBidder);
        let highest_bid: i128 = env.storage().persistent().get(&DataKey::HighestBid).unwrap_or(0);

        let asset_client = token::Client::new(&env, &details.asset_token);
        let bid_client = token::Client::new(&env, &details.bid_token);

        match highest_bidder {
            Some(bidder) => {
                // Transfer asset to bidder
                asset_client.transfer(&env.current_contract_address(), &bidder, &details.asset_amount);
                // Transfer bid funds to seller
                bid_client.transfer(&env.current_contract_address(), &details.seller, &highest_bid);
                log!(&env, "Auction settled. Item delivered to {} for {}", bidder, highest_bid);
            }
            None => {
                // No bids met the criteria or no bids placed. Return asset to seller.
                asset_client.transfer(&env.current_contract_address(), &details.seller, &details.asset_amount);
                log!(&env, "Auction closed with no winners. Asset returned to seller.");
            }
        }
    }

    /// Withdraw funds if the auction failed or user was outbid (alternate pattern).
    /// Note: In this implementation, outbid players are refunded automatically during place_bid.
    /// This function is a placeholder for more complex pull-patterns.
    pub fn withdraw(env: Env, _user: Address) {
        panic!("Immediate refund pattern in use. No funds to withdraw manually.");
    }

    /// Get current auction details
    pub fn get_auction_details(env: Env) -> AuctionDetails {
        env.storage().persistent().get(&DataKey::AuctionInfo).expect("No auction found")
    }

    /// Get current highest bid info
    pub fn get_highest_bid(env: Env) -> (Option<Address>, i128) {
        let bidder = env.storage().persistent().get(&DataKey::HighestBidder);
        let bid = env.storage().persistent().get(&DataKey::HighestBid).unwrap_or(0);
        (bidder, bid)
    }
}
