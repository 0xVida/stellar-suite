import { ContentItem } from "./content";

export const TEMPLATE_CONTENT: ContentItem[] = [
  {
    id: "template-token",
    type: "template",
    title: "Token Contract",
    description:
      "Standard fungible token with mint, transfer, burn, and allowance management.",
    tags: ["token", "fungible", "defi"],
    category: "DeFi",
    keywords: ["erc20", "mint", "transfer", "burn", "balance", "supply", "approve"],
    icon: "coin",
    codeSnippet: `pub fn mint(env: Env, admin: Address, to: Address, amount: i128) {
    admin.require_auth();
    check_nonnegative_amount(amount);
    let admin_key = DataKey::Admin;
    let stored: Address = env.storage().instance().get(&admin_key).unwrap();
    if admin != stored {
        panic!("not authorized");
    }
    receive_balance(&env, to.clone(), amount);
    TokenUtils::new(&env).events().mint(admin, to, amount);
}`,
  },
  {
    id: "template-nft",
    type: "template",
    title: "NFT Contract",
    description:
      "Non-fungible token with minting, transfers, metadata, and royalty support.",
    tags: ["nft", "collectible", "metadata"],
    category: "NFTs",
    keywords: ["non-fungible", "mint", "ownership", "royalty", "art", "collectible"],
    icon: "image",
    codeSnippet: `pub fn mint(env: Env, to: Address, token_id: u64, metadata_uri: String) {
    let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
    admin.require_auth();
    if env.storage().persistent().has(&DataKey::TokenOwner(token_id)) {
        panic!("token already exists");
    }
    env.storage().persistent().set(&DataKey::TokenOwner(token_id), &to);
    env.storage().persistent().set(&DataKey::TokenUri(token_id), &metadata_uri);
}`,
  },
  {
    id: "template-escrow",
    type: "template",
    title: "Escrow Contract",
    description:
      "Conditional payment release with dispute resolution and milestone-based escrow.",
    tags: ["escrow", "payments", "trust"],
    category: "Payments",
    keywords: ["escrow", "release", "dispute", "milestone", "conditional", "payment"],
    icon: "lock",
    codeSnippet: `pub fn release(env: Env, escrow_id: u64) {
    let escrow: EscrowData = env.storage().persistent()
        .get(&DataKey::Escrow(escrow_id)).unwrap();
    escrow.arbiter.require_auth();
    token::Client::new(&env, &escrow.token)
        .transfer(&env.current_contract_address(), &escrow.recipient, &escrow.amount);
    env.storage().persistent().set(
        &DataKey::Escrow(escrow_id),
        &EscrowData { released: true, ..escrow },
    );
}`,
  },
  {
    id: "template-voting",
    type: "template",
    title: "Voting Contract",
    description:
      "On-chain governance with proposals, delegation, quorum checks, and execution.",
    tags: ["voting", "governance", "dao"],
    category: "Governance",
    keywords: ["proposal", "vote", "delegate", "quorum", "governance", "dao"],
    icon: "vote",
    codeSnippet: `pub fn vote(env: Env, voter: Address, proposal_id: u64, support: bool) {
    voter.require_auth();
    let mut proposal: Proposal = env.storage().persistent()
        .get(&DataKey::Proposal(proposal_id)).unwrap();
    if env.ledger().timestamp() > proposal.end_time {
        panic!("voting ended");
    }
    let weight = Self::get_voting_power(&env, &voter);
    if support { proposal.for_votes += weight; }
    else { proposal.against_votes += weight; }
    env.storage().persistent().set(&DataKey::Proposal(proposal_id), &proposal);
}`,
  },
  {
    id: "template-multisig",
    type: "template",
    title: "Multisig Wallet",
    description:
      "Multi-signature wallet with configurable thresholds and proposal-based execution.",
    tags: ["multisig", "security", "wallet"],
    category: "Security",
    keywords: ["multisig", "threshold", "approval", "wallet", "multi-party"],
    icon: "shield",
    codeSnippet: `pub fn approve(env: Env, signer: Address, tx_id: u64) {
    signer.require_auth();
    let signers: Vec<Address> = env.storage().instance()
        .get(&DataKey::Signers).unwrap();
    if !signers.contains(&signer) { panic!("not a signer"); }
    let mut tx: MultisigTx = env.storage().persistent()
        .get(&DataKey::Transaction(tx_id)).unwrap();
    tx.approvals += 1;
    let threshold: u32 = env.storage().instance()
        .get(&DataKey::Threshold).unwrap();
    if tx.approvals >= threshold { tx.ready = true; }
    env.storage().persistent().set(&DataKey::Transaction(tx_id), &tx);
}`,
  },
  {
    id: "template-staking",
    type: "template",
    title: "Staking Contract",
    description:
      "Token staking with reward distribution, lockup periods, and admin controls.",
    tags: ["staking", "rewards", "defi"],
    category: "DeFi",
    keywords: ["stake", "unstake", "rewards", "yield", "lockup", "delegation"],
    icon: "layers",
    codeSnippet: `pub fn stake(env: Env, staker: Address, amount: i128) {
    staker.require_auth();
    check_nonnegative_amount(amount);
    let token = Self::staking_token(&env);
    token::Client::new(&env, &token)
        .transfer(&staker, &env.current_contract_address(), &amount);
    let key = DataKey::Stake(staker.clone());
    let existing: i128 = env.storage().persistent().get(&key).unwrap_or(0);
    env.storage().persistent().set(&key, &(existing + amount));
}`,
  },
  {
    id: "template-auction",
    type: "template",
    title: "Auction Contract",
    description:
      "English auction with bidding, settlement, and automatic outbid refunds.",
    tags: ["auction", "marketplace", "defi"],
    category: "DeFi",
    keywords: ["auction", "bid", "settle", "marketplace", "english-auction"],
    icon: "gavel",
    codeSnippet: `pub fn place_bid(env: Env, bidder: Address, auction_id: u64, amount: i128) {
    bidder.require_auth();
    let mut auction: Auction = env.storage().persistent()
        .get(&DataKey::Auction(auction_id)).unwrap();
    if amount <= auction.highest_bid { panic!("bid too low"); }
    if auction.highest_bidder != env.current_contract_address() {
        // Refund previous bidder
        token::Client::new(&env, &auction.token)
            .transfer(&env.current_contract_address(), &auction.highest_bidder, &auction.highest_bid);
    }
    auction.highest_bid = amount;
    auction.highest_bidder = bidder;
    env.storage().persistent().set(&DataKey::Auction(auction_id), &auction);
}`,
  },
];
