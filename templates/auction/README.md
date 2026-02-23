# Auction Contract Template

A secure, fully automated auction contract for Stellar/Soroban. This template supports English auctions with reserve prices and automatic time-based closing.

## Features

- **Auction Creation**: Configurable assets, bid tokens, reserve prices, and durations.
- **English Auction Logic**: Each bid must be higher than the previous one and meet the reserve price.
- **Automatic Refunds**: When a higher bid is placed, the previous bidder is automatically refunded their funds.
- **Time-Locked Closing**: Auctions enforce strict end times and cannot be settled early.
- **Reserve Price Enforcement**: Bids are rejected if they do not meet the minimum set by the seller.
- **Safe Settlement**: On conclusion, the asset is delivered to the winner and funds to the seller. If no bids were placed, the asset is returned to the seller.

## Quick Start

### 1. Initialization
Create an auction by specifying the asset and bid token details.

```rust
// Create auction for 1 NFT (asset_token) with a reserve price of 100 XLM (bid_token)
client.create_auction(
    &seller,
    &asset_token_address,
    &1,             // asset_amount
    &bid_token_address,
    &100,           // reserve_price (e.g. 100 XLM)
    &3600           // duration in seconds (1 hour)
);
```

### 2. Placing a Bid
Bidders can place a higher bid. The previous bidder will be automatically refunded.

```rust
client.place_bid(&bidder, &150);
```

### 3. Settlement
Once the `end_time` has passed, anyone can trigger the `settle` function to finalize the asset/fund transfers.

```rust
client.settle();
```

## Configuration Options

- **Reserve Price**: Set to `0` for no minimum bid.
- **Bid Token**: Usually the native XLM, but any valid Soroban token can be used for bidding.
- **Asset**: Can be a single NFT (amount = 1) or a batch of tokens.

## Security Considerations

1. **Authorization**: `create_auction` requires the seller's signature. `place_bid` requires the bidder's signature.
2. **Atomicity**: Refunds and bid placements happen in a single transaction, ensuring no funds are lost or double-counted.
3. **Asset Locking**: Common auction vulnerability is prevented by locking the auctioned asset in the contract upon initialization.
4. **Time manipulation**: Ledger timestamp is used for enforcement, which is reliable within network consensus bounds (val_set drift).

## Auction Scenarios

### Reserve Met
If the highest bid is above or equal to the reserve price, the bidder receives the asset and the seller receives the bid amount.

### Reserve Not Met
Bids below the reserve price are rejected by the contract, ensuring the seller's floor price is respected.

### No Bids
If the auction ends without any bids, calling `settle` will return the locked asset to the seller.
