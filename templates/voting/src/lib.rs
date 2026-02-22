//! # Voting/Governance Contract
//!
//! This contract implements a decentralized governance system with support for:
//! - Proposal creation and management
//! - Voting mechanism with yes/no/abstain options
//! - Vote counting and aggregation
//! - Quorum requirements and threshold logic
//! - Vote delegation
//! - Proposal status tracking and execution
//!
//! Template: voting
//! Category: voting
//! Version: 0.1.0

#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype, token, Address, Env, String, Vec,
};

/// Maximum description length for proposals
const MAX_DESCRIPTION_LENGTH: u32 = 500;

/// Proposal statuses
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ProposalStatus {
    Pending,   // Proposal created but voting not started
    Active,    // Voting period is active
    Passed,    // Proposal passed (met quorum and threshold)
    Rejected,  // Proposal rejected (didn't meet requirements)
    Executed,  // Proposal executed
    Cancelled, // Proposal cancelled by creator
}

/// Vote types
#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum VoteType {
    Yes,
    No,
    Abstain,
}

/// Proposal data structure
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Proposal {
    pub id: u64,
    pub proposer: Address,
    pub description: String,
    pub yes_votes: u128,
    pub no_votes: u128,
    pub abstain_votes: u128,
    pub start_time: u64,
    pub end_time: u64,
    pub status: ProposalStatus,
    pub executed: bool,
}

/// Vote record for tracking individual votes
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct VoteRecord {
    pub voter: Address,
    pub vote_type: VoteType,
    pub voting_power: u128,
    pub timestamp: u64,
}

/// Governance configuration
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct GovernanceConfig {
    pub admin: Address,
    pub voting_token: Address,      // Token used for voting power
    pub quorum_threshold: u128,     // Minimum total votes required
    pub pass_threshold_percent: u32, // Percentage of yes votes needed (0-100)
    pub voting_period: u64,         // Duration of voting in seconds
}

/// Storage keys
#[contracttype]
#[derive(Clone)]
pub enum StorageKey {
    Config,
    ProposalCount,
    Proposal(u64),
    Vote(u64, Address),          // (proposal_id, voter)
    VoterPower(Address),         // Cached voting power
    Delegation(Address),         // Delegator -> Delegate mapping
    DelegatedPower(Address),     // Total delegated power to an address
}

#[contract]
pub struct VotingContract;

#[contractimpl]
impl VotingContract {
    /// Initialize the governance contract
    ///
    /// # Arguments
    /// * `admin` - Contract administrator
    /// * `voting_token` - Token contract address used for voting power
    /// * `quorum_threshold` - Minimum votes required for proposal validity
    /// * `pass_threshold_percent` - Percentage of yes votes needed (0-100)
    /// * `voting_period` - Duration of voting period in seconds
    pub fn initialize(
        env: Env,
        admin: Address,
        voting_token: Address,
        quorum_threshold: u128,
        pass_threshold_percent: u32,
        voting_period: u64,
    ) {
        admin.require_auth();

        // Validate parameters
        assert!(
            pass_threshold_percent <= 100,
            "Pass threshold must be <= 100"
        );
        assert!(quorum_threshold > 0, "Quorum threshold must be > 0");
        assert!(voting_period > 0, "Voting period must be > 0");

        let config = GovernanceConfig {
            admin,
            voting_token,
            quorum_threshold,
            pass_threshold_percent,
            voting_period,
        };

        env.storage().instance().set(&StorageKey::Config, &config);
        env.storage().instance().set(&StorageKey::ProposalCount, &0u64);
    }

    /// Create a new proposal
    ///
    /// # Arguments
    /// * `proposer` - Address creating the proposal
    /// * `description` - Proposal description
    ///
    /// # Returns
    /// * `u64` - The proposal ID
    pub fn create_proposal(
        env: Env,
        proposer: Address,
        description: String,
    ) -> u64 {
        proposer.require_auth();

        // Validate description length
        assert!(
            description.len() <= MAX_DESCRIPTION_LENGTH,
            "Description too long"
        );

        // Get config
        let config: GovernanceConfig = env
            .storage()
            .instance()
            .get(&StorageKey::Config)
            .expect("Contract not initialized");

        // Get and increment proposal count
        let proposal_id: u64 = env
            .storage()
            .instance()
            .get(&StorageKey::ProposalCount)
            .unwrap_or(0);
        
        env.storage()
            .instance()
            .set(&StorageKey::ProposalCount, &(proposal_id + 1));

        // Create proposal
        let current_time = env.ledger().timestamp();
        let proposal = Proposal {
            id: proposal_id,
            proposer: proposer.clone(),
            description,
            yes_votes: 0,
            no_votes: 0,
            abstain_votes: 0,
            start_time: current_time,
            end_time: current_time + config.voting_period,
            status: ProposalStatus::Active,
            executed: false,
        };

        env.storage()
            .instance()
            .set(&StorageKey::Proposal(proposal_id), &proposal);

        proposal_id
    }

    /// Cast a vote on a proposal
    ///
    /// # Arguments
    /// * `voter` - Address casting the vote
    /// * `proposal_id` - ID of the proposal to vote on
    /// * `vote_type` - Type of vote (Yes/No/Abstain)
    pub fn vote(
        env: Env,
        voter: Address,
        proposal_id: u64,
        vote_type: VoteType,
    ) {
        voter.require_auth();

        // Get proposal
        let mut proposal: Proposal = env
            .storage()
            .instance()
            .get(&StorageKey::Proposal(proposal_id))
            .expect("Proposal does not exist");

        // Validate proposal is active
        let current_time = env.ledger().timestamp();
        assert!(
            proposal.status == ProposalStatus::Active,
            "Proposal is not active"
        );
        assert!(
            current_time >= proposal.start_time,
            "Voting has not started"
        );
        assert!(current_time <= proposal.end_time, "Voting has ended");

        // Check if already voted
        let vote_key = StorageKey::Vote(proposal_id, voter.clone());
        assert!(
            !env.storage().instance().has(&vote_key),
            "Already voted on this proposal"
        );

        // Get voting power (token balance + delegated power)
        let voting_power = Self::get_voting_power(&env, &voter);
        assert!(voting_power > 0, "No voting power");

        // Record vote
        let vote_record = VoteRecord {
            voter: voter.clone(),
            vote_type: vote_type.clone(),
            voting_power,
            timestamp: current_time,
        };
        env.storage().instance().set(&vote_key, &vote_record);

        // Update proposal vote counts
        match vote_type {
            VoteType::Yes => proposal.yes_votes += voting_power,
            VoteType::No => proposal.no_votes += voting_power,
            VoteType::Abstain => proposal.abstain_votes += voting_power,
        }

        env.storage()
            .instance()
            .set(&StorageKey::Proposal(proposal_id), &proposal);
    }

    /// Delegate voting power to another address
    ///
    /// # Arguments
    /// * `delegator` - Address delegating their voting power
    /// * `delegate` - Address receiving the delegated voting power
    pub fn delegate_vote(env: Env, delegator: Address, delegate: Address) {
        delegator.require_auth();

        assert!(
            delegator != delegate,
            "Cannot delegate to yourself"
        );

        // Get delegator's voting power (token balance only, not including previous delegations)
        let config: GovernanceConfig = env
            .storage()
            .instance()
            .get(&StorageKey::Config)
            .expect("Contract not initialized");

        let token_client = token::Client::new(&env, &config.voting_token);
        let delegating_power = token_client.balance(&delegator);

        // Remove old delegation if exists
        if let Some(old_delegate) = env
            .storage()
            .instance()
            .get::<StorageKey, Address>(&StorageKey::Delegation(delegator.clone()))
        {
            let old_delegated_power: u128 = env
                .storage()
                .instance()
                .get(&StorageKey::DelegatedPower(old_delegate.clone()))
                .unwrap_or(0);
            
            env.storage().instance().set(
                &StorageKey::DelegatedPower(old_delegate),
                &old_delegated_power.saturating_sub(delegating_power as u128),
            );
        }

        // Set new delegation
        env.storage()
            .instance()
            .set(&StorageKey::Delegation(delegator), &delegate);

        // Update delegated power
        let current_delegated: u128 = env
            .storage()
            .instance()
            .get(&StorageKey::DelegatedPower(delegate.clone()))
            .unwrap_or(0);
        
        env.storage().instance().set(
            &StorageKey::DelegatedPower(delegate),
            &(current_delegated + delegating_power as u128),
        );
    }

    /// Finalize and execute a proposal if it passed
    ///
    /// # Arguments
    /// * `caller` - Address calling the function
    /// * `proposal_id` - ID of the proposal to execute
    pub fn execute_proposal(env: Env, caller: Address, proposal_id: u64) {
        caller.require_auth();

        let mut proposal: Proposal = env
            .storage()
            .instance()
            .get(&StorageKey::Proposal(proposal_id))
            .expect("Proposal does not exist");

        // Check voting period has ended
        let current_time = env.ledger().timestamp();
        assert!(
            current_time > proposal.end_time,
            "Voting period not ended"
        );

        assert!(
            proposal.status == ProposalStatus::Active,
            "Proposal already finalized"
        );

        // Get config for quorum and threshold checks
        let config: GovernanceConfig = env
            .storage()
            .instance()
            .get(&StorageKey::Config)
            .expect("Contract not initialized");

        // Calculate results
        let total_votes = proposal.yes_votes + proposal.no_votes + proposal.abstain_votes;
        
        // Check quorum
        let quorum_met = total_votes >= config.quorum_threshold;

        // Check if proposal passed
        let yes_percentage = if total_votes > 0 {
            (proposal.yes_votes * 100) / total_votes
        } else {
            0
        };

        let threshold_met = yes_percentage >= config.pass_threshold_percent as u128;

        // Update proposal status
        if quorum_met && threshold_met {
            proposal.status = ProposalStatus::Passed;
            proposal.executed = true;
        } else {
            proposal.status = ProposalStatus::Rejected;
        }

        env.storage()
            .instance()
            .set(&StorageKey::Proposal(proposal_id), &proposal);
    }

    /// Get proposal details
    ///
    /// # Arguments
    /// * `proposal_id` - ID of the proposal
    ///
    /// # Returns
    /// * `Proposal` - The proposal data
    pub fn get_proposal(env: Env, proposal_id: u64) -> Proposal {
        env.storage()
            .instance()
            .get(&StorageKey::Proposal(proposal_id))
            .expect("Proposal does not exist")
    }

    /// Get vote count for a proposal
    ///
    /// # Arguments
    /// * `proposal_id` - ID of the proposal
    ///
    /// # Returns
    /// * `(u128, u128, u128)` - Tuple of (yes_votes, no_votes, abstain_votes)
    pub fn get_vote_count(env: Env, proposal_id: u64) -> (u128, u128, u128) {
        let proposal: Proposal = env
            .storage()
            .instance()
            .get(&StorageKey::Proposal(proposal_id))
            .expect("Proposal does not exist");

        (proposal.yes_votes, proposal.no_votes, proposal.abstain_votes)
    }

    /// Get total number of proposals
    ///
    /// # Returns
    /// * `u64` - The total count of proposals
    pub fn get_proposal_count(env: Env) -> u64 {
        env.storage()
            .instance()
            .get(&StorageKey::ProposalCount)
            .unwrap_or(0)
    }

    /// Get voting power for an address (token balance + delegated power)
    ///
    /// # Arguments
    /// * `voter` - Address to check voting power for
    ///
    /// # Returns
    /// * `u128` - Total voting power
    pub fn get_voting_power(env: &Env, voter: &Address) -> u128 {
        let config: GovernanceConfig = env
            .storage()
            .instance()
            .get(&StorageKey::Config)
            .expect("Contract not initialized");

        let token_client = token::Client::new(env, &config.voting_token);
        let token_balance = token_client.balance(voter);

        let delegated_power: u128 = env
            .storage()
            .instance()
            .get(&StorageKey::DelegatedPower(voter.clone()))
            .unwrap_or(0);

        token_balance as u128 + delegated_power
    }

    /// Get the delegate for an address
    ///
    /// # Arguments
    /// * `delegator` - Address to check delegation for
    ///
    /// # Returns
    /// * `Option<Address>` - The delegate address if delegated, None otherwise
    pub fn get_delegate(env: Env, delegator: Address) -> Option<Address> {
        env.storage()
            .instance()
            .get(&StorageKey::Delegation(delegator))
    }

    /// Cancel a proposal (only by proposer or admin before voting ends)
    ///
    /// # Arguments
    /// * `caller` - Address calling the function
    /// * `proposal_id` - ID of the proposal to cancel
    pub fn cancel_proposal(env: Env, caller: Address, proposal_id: u64) {
        caller.require_auth();

        let mut proposal: Proposal = env
            .storage()
            .instance()
            .get(&StorageKey::Proposal(proposal_id))
            .expect("Proposal does not exist");

        let config: GovernanceConfig = env
            .storage()
            .instance()
            .get(&StorageKey::Config)
            .expect("Contract not initialized");

        // Only proposer or admin can cancel
        assert!(
            caller == proposal.proposer || caller == config.admin,
            "Only proposer or admin can cancel"
        );

        assert!(
            proposal.status == ProposalStatus::Active,
            "Only active proposals can be cancelled"
        );

        proposal.status = ProposalStatus::Cancelled;
        
        env.storage()
            .instance()
            .set(&StorageKey::Proposal(proposal_id), &proposal);
    }
}
