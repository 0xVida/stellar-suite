//! Comprehensive test suite for the Voting/Governance contract
//!
//! Tests cover:
//! - Contract initialization
//! - Proposal creation
//! - Voting mechanisms
//! - Vote delegation
//! - Quorum and threshold logic
//! - Proposal execution
//! - Edge cases and error handling
//!
//! Run tests with: cargo test

#![cfg(test)]

use soroban_sdk::{
    symbol_short, testutils::{Address as _, Ledger, LedgerInfo}, token, Address, Env, String,
};

mod voting_contract {
    soroban_sdk::contractimport!(
        file = "../../target/wasm32-unknown-unknown/release/voting_contract.wasm"
    );
}

use voting_contract::{ProposalStatus, VoteType, VotingContractClient};

/// Helper function to create and initialize a mock token contract
fn create_token_contract<'a>(env: &Env, admin: &Address) -> (Address, token::Client<'a>) {
    let token_address = env.register_stellar_asset_contract(admin.clone());
    let token = token::Client::new(env, &token_address);
    
    token
}

/// Helper function to mint tokens to an address
fn mint_tokens(token: &token::Client, admin: &Address, to: &Address, amount: i128) {
    token.mint(to, &amount);
}

#[test]
fn test_initialize_contract() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let (token_address, _token) = create_token_contract(&env, &admin);
    
    let contract_id = env.register_contract(None, voting_contract::VotingContract);
    let client = VotingContractClient::new(&env, &contract_id);

    // Initialize the contract
    client.initialize(
        &admin,
        &token_address,
        &1000,  // quorum threshold
        &51,    // 51% pass threshold
        &86400, // 1 day voting period
    );

    // Verify initialization by checking proposal count
    let proposal_count = client.get_proposal_count();
    assert_eq!(proposal_count, 0);
}

#[test]
#[should_panic(expected = "Pass threshold must be <= 100")]
fn test_initialize_invalid_threshold() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let (token_address, _token) = create_token_contract(&env, &admin);
    
    let contract_id = env.register_contract(None, voting_contract::VotingContract);
    let client = VotingContractClient::new(&env, &contract_id);

    // Try to initialize with invalid threshold (> 100)
    client.initialize(
        &admin,
        &token_address,
        &1000,
        &150,   // Invalid: > 100
        &86400,
    );
}

#[test]
fn test_create_proposal() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let proposer = Address::generate(&env);
    let (token_address, _token) = create_token_contract(&env, &admin);
    
    let contract_id = env.register_contract(None, voting_contract::VotingContract);
    let client = VotingContractClient::new(&env, &contract_id);

    // Initialize
    client.initialize(&admin, &token_address, &1000, &51, &86400);

    // Create a proposal
    let description = String::from_str(&env, "Proposal to increase funding");
    let proposal_id = client.create_proposal(&proposer, &description);

    assert_eq!(proposal_id, 0);

    // Verify proposal was created
    let proposal = client.get_proposal(&proposal_id);
    assert_eq!(proposal.id, 0);
    assert_eq!(proposal.proposer, proposer);
    assert_eq!(proposal.description, description);
    assert_eq!(proposal.yes_votes, 0);
    assert_eq!(proposal.no_votes, 0);
    assert_eq!(proposal.abstain_votes, 0);
    assert_eq!(proposal.status, ProposalStatus::Active);
    assert_eq!(proposal.executed, false);
}

#[test]
fn test_vote_on_proposal() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let proposer = Address::generate(&env);
    let voter = Address::generate(&env);
    let (token_address, token) = create_token_contract(&env, &admin);
    
    // Mint tokens to voter (voting power)
    mint_tokens(&token, &admin, &voter, 100);

    let contract_id = env.register_contract(None, voting_contract::VotingContract);
    let client = VotingContractClient::new(&env, &contract_id);

    // Initialize
    client.initialize(&admin, &token_address, &50, &51, &86400);

    // Create a proposal
    let description = String::from_str(&env, "Test proposal");
    let proposal_id = client.create_proposal(&proposer, &description);

    // Vote on the proposal
    client.vote(&voter, &proposal_id, &VoteType::Yes);

    // Check vote count
    let (yes_votes, no_votes, abstain_votes) = client.get_vote_count(&proposal_id);
    assert_eq!(yes_votes, 100);
    assert_eq!(no_votes, 0);
    assert_eq!(abstain_votes, 0);
}

#[test]
#[should_panic(expected = "Already voted on this proposal")]
fn test_cannot_vote_twice() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let proposer = Address::generate(&env);
    let voter = Address::generate(&env);
    let (token_address, token) = create_token_contract(&env, &admin);
    
    mint_tokens(&token, &admin, &voter, 100);

    let contract_id = env.register_contract(None, voting_contract::VotingContract);
    let client = VotingContractClient::new(&env, &contract_id);

    client.initialize(&admin, &token_address, &50, &51, &86400);

    let description = String::from_str(&env, "Test proposal");
    let proposal_id = client.create_proposal(&proposer, &description);

    // First vote
    client.vote(&voter, &proposal_id, &VoteType::Yes);

    // Try to vote again - should panic
    client.vote(&voter, &proposal_id, &VoteType::No);
}

#[test]
fn test_vote_delegation() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let delegator = Address::generate(&env);
    let delegate = Address::generate(&env);
    let (token_address, token) = create_token_contract(&env, &admin);
    
    // Mint tokens to delegator
    mint_tokens(&token, &admin, &delegator, 200);

    let contract_id = env.register_contract(None, voting_contract::VotingContract);
    let client = VotingContractClient::new(&env, &contract_id);

    client.initialize(&admin, &token_address, &50, &51, &86400);

    // Delegate voting power
    client.delegate_vote(&delegator, &delegate);

    // Verify delegation
    let delegated_to = client.get_delegate(&delegator);
    assert!(delegated_to.is_some());
    assert_eq!(delegated_to.unwrap(), delegate);
}

#[test]
fn test_execute_passed_proposal() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let proposer = Address::generate(&env);
    let voter1 = Address::generate(&env);
    let voter2 = Address::generate(&env);
    let (token_address, token) = create_token_contract(&env, &admin);
    
    // Mint tokens to voters
    mint_tokens(&token, &admin, &voter1, 600);
    mint_tokens(&token, &admin, &voter2, 400);

    let contract_id = env.register_contract(None, voting_contract::VotingContract);
    let client = VotingContractClient::new(&env, &contract_id);

    // Initialize with 500 quorum and 51% threshold
    client.initialize(&admin, &token_address, &500, &51, &100);

    // Create a proposal
    let description = String::from_str(&env, "Test proposal");
    let proposal_id = client.create_proposal(&proposer, &description);

    // Vote - voter1 votes yes (600), voter2 votes no (400)
    client.vote(&voter1, &proposal_id, &VoteType::Yes);
    client.vote(&voter2, &proposal_id, &VoteType::No);

    // Fast forward time past voting period
    env.ledger().set(LedgerInfo {
        timestamp: env.ledger().timestamp() + 101,
        protocol_version: 20,
        sequence_number: env.ledger().sequence(),
        network_id: Default::default(),
        base_reserve: 10,
        min_temp_entry_ttl: 10,
        min_persistent_entry_ttl: 10,
        max_entry_ttl: 3110400,
    });

    // Execute proposal
    client.execute_proposal(&admin, &proposal_id);

    // Verify proposal passed (quorum met: 1000 >= 500, yes%: 60% >= 51%)
    let proposal = client.get_proposal(&proposal_id);
    assert_eq!(proposal.status, ProposalStatus::Passed);
    assert_eq!(proposal.executed, true);
}

#[test]
fn test_execute_rejected_proposal_no_quorum() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let proposer = Address::generate(&env);
    let voter = Address::generate(&env);
    let (token_address, token) = create_token_contract(&env, &admin);
    
    // Mint only small amount - won't meet quorum
    mint_tokens(&token, &admin, &voter, 100);

    let contract_id = env.register_contract(None, voting_contract::VotingContract);
    let client = VotingContractClient::new(&env, &contract_id);

    // Initialize with high quorum requirement
    client.initialize(&admin, &token_address, &1000, &51, &100);

    // Create and vote
    let description = String::from_str(&env, "Test proposal");
    let proposal_id = client.create_proposal(&proposer, &description);
    client.vote(&voter, &proposal_id, &VoteType::Yes);

    // Fast forward time
    env.ledger().set(LedgerInfo {
        timestamp: env.ledger().timestamp() + 101,
        protocol_version: 20,
        sequence_number: env.ledger().sequence(),
        network_id: Default::default(),
        base_reserve: 10,
        min_temp_entry_ttl: 10,
        min_persistent_entry_ttl: 10,
        max_entry_ttl: 3110400,
    });

    // Execute proposal
    client.execute_proposal(&admin, &proposal_id);

    // Verify proposal rejected due to quorum not met
    let proposal = client.get_proposal(&proposal_id);
    assert_eq!(proposal.status, ProposalStatus::Rejected);
}

#[test]
fn test_execute_rejected_proposal_threshold_not_met() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let proposer = Address::generate(&env);
    let voter1 = Address::generate(&env);
    let voter2 = Address::generate(&env);
    let (token_address, token) = create_token_contract(&env, &admin);
    
    mint_tokens(&token, &admin, &voter1, 400);
    mint_tokens(&token, &admin, &voter2, 600);

    let contract_id = env.register_contract(None, voting_contract::VotingContract);
    let client = VotingContractClient::new(&env, &contract_id);

    // Initialize with 51% threshold
    client.initialize(&admin, &token_address, &500, &51, &100);

    // Create and vote - majority votes no
    let description = String::from_str(&env, "Test proposal");
    let proposal_id = client.create_proposal(&proposer, &description);
    client.vote(&voter1, &proposal_id, &VoteType::Yes);  // 400 yes
    client.vote(&voter2, &proposal_id, &VoteType::No);   // 600 no

    // Fast forward time
    env.ledger().set(LedgerInfo {
        timestamp: env.ledger().timestamp() + 101,
        protocol_version: 20,
        sequence_number: env.ledger().sequence(),
        network_id: Default::default(),
        base_reserve: 10,
        min_temp_entry_ttl: 10,
        min_persistent_entry_ttl: 10,
        max_entry_ttl: 3110400,
    });

    // Execute proposal
    client.execute_proposal(&admin, &proposal_id);

    // Verify proposal rejected (40% yes < 51% threshold)
    let proposal = client.get_proposal(&proposal_id);
    assert_eq!(proposal.status, ProposalStatus::Rejected);
}

#[test]
fn test_cancel_proposal() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let proposer = Address::generate(&env);
    let (token_address, _token) = create_token_contract(&env, &admin);
    
    let contract_id = env.register_contract(None, voting_contract::VotingContract);
    let client = VotingContractClient::new(&env, &contract_id);

    client.initialize(&admin, &token_address, &1000, &51, &86400);

    // Create a proposal
    let description = String::from_str(&env, "Test proposal");
    let proposal_id = client.create_proposal(&proposer, &description);

    // Cancel the proposal
    client.cancel_proposal(&proposer, &proposal_id);

    // Verify cancellation
    let proposal = client.get_proposal(&proposal_id);
    assert_eq!(proposal.status, ProposalStatus::Cancelled);
}

#[test]
#[should_panic(expected = "Only proposer or admin can cancel")]
fn test_cannot_cancel_others_proposal() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let proposer = Address::generate(&env);
    let other = Address::generate(&env);
    let (token_address, _token) = create_token_contract(&env, &admin);
    
    let contract_id = env.register_contract(None, voting_contract::VotingContract);
    let client = VotingContractClient::new(&env, &contract_id);

    client.initialize(&admin, &token_address, &1000, &51, &86400);

    let description = String::from_str(&env, "Test proposal");
    let proposal_id = client.create_proposal(&proposer, &description);

    // Try to cancel from unauthorized address - should panic
    client.cancel_proposal(&other, &proposal_id);
}

#[test]
fn test_abstain_vote() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let proposer = Address::generate(&env);
    let voter = Address::generate(&env);
    let (token_address, token) = create_token_contract(&env, &admin);
    
    mint_tokens(&token, &admin, &voter, 100);

    let contract_id = env.register_contract(None, voting_contract::VotingContract);
    let client = VotingContractClient::new(&env, &contract_id);

    client.initialize(&admin, &token_address, &50, &51, &86400);

    let description = String::from_str(&env, "Test proposal");
    let proposal_id = client.create_proposal(&proposer, &description);

    // Vote abstain
    client.vote(&voter, &proposal_id, &VoteType::Abstain);

    // Check vote count
    let (yes_votes, no_votes, abstain_votes) = client.get_vote_count(&proposal_id);
    assert_eq!(yes_votes, 0);
    assert_eq!(no_votes, 0);
    assert_eq!(abstain_votes, 100);
}

#[test]
fn test_proposal_count_increments() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let proposer = Address::generate(&env);
    let (token_address, _token) = create_token_contract(&env, &admin);
    
    let contract_id = env.register_contract(None, voting_contract::VotingContract);
    let client = VotingContractClient::new(&env, &contract_id);

    client.initialize(&admin, &token_address, &1000, &51, &86400);

    // Create multiple proposals
    let desc1 = String::from_str(&env, "Proposal 1");
    let desc2 = String::from_str(&env, "Proposal 2");
    let desc3 = String::from_str(&env, "Proposal 3");

    client.create_proposal(&proposer, &desc1);
    client.create_proposal(&proposer, &desc2);
    client.create_proposal(&proposer, &desc3);

    // Verify count
    let count = client.get_proposal_count();
    assert_eq!(count, 3);
}

#[test]
#[should_panic(expected = "No voting power")]
fn test_vote_without_tokens() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let proposer = Address::generate(&env);
    let voter = Address::generate(&env);
    let (token_address, _token) = create_token_contract(&env, &admin);
    
    // Don't mint any tokens to voter

    let contract_id = env.register_contract(None, voting_contract::VotingContract);
    let client = VotingContractClient::new(&env, &contract_id);

    client.initialize(&admin, &token_address, &50, &51, &86400);

    let description = String::from_str(&env, "Test proposal");
    let proposal_id = client.create_proposal(&proposer, &description);

    // Try to vote without tokens - should panic
    client.vote(&voter, &proposal_id, &VoteType::Yes);
}
