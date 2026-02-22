#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, symbol_short, Address, Env, Map, Symbol,
    Vec,
};

// Storage keys
const SIGNERS: Symbol = symbol_short!("signers");
const THRESHOLD: Symbol = symbol_short!("threshold");
const PROP_COUNT: Symbol = symbol_short!("prop_cnt");
const INITIALIZED: Symbol = symbol_short!("init");

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum MultisigError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    InvalidThreshold = 3,
    NotASigner = 4,
    ProposalNotFound = 5,
    AlreadyApproved = 6,
    NotApproved = 7,
    ThresholdNotMet = 8,
    AlreadyExecuted = 9,
    ProposalExpired = 10,
    DuplicateSigner = 11,
    EmptySigners = 12,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ProposalStatus {
    Active,
    Executed,
}

// What action the proposal performs
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ProposalAction {
    // Transfer native token to recipient
    Transfer(Address, i128),
    // Update the signer set and threshold
    UpdateSigners(Vec<Address>, u32),
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Proposal {
    pub id: u32,
    pub proposer: Address,
    pub action: ProposalAction,
    pub approvals: Vec<Address>,
    pub status: ProposalStatus,
    pub expiration: u64, // ledger sequence number
}

// Helper to build per-proposal storage key
fn proposal_key(id: u32) -> (Symbol, u32) {
    (symbol_short!("proposal"), id)
}

#[contract]
pub struct MultisigWallet;

#[contractimpl]
impl MultisigWallet {
    // Set up the wallet with initial signers and approval threshold.
    // Threshold must be >= 1 and <= number of signers.
    pub fn initialize(
        env: Env,
        signers: Vec<Address>,
        threshold: u32,
    ) -> Result<(), MultisigError> {
        if env.storage().instance().has(&INITIALIZED) {
            return Err(MultisigError::AlreadyInitialized);
        }
        if signers.is_empty() {
            return Err(MultisigError::EmptySigners);
        }
        if threshold == 0 || threshold > signers.len() {
            return Err(MultisigError::InvalidThreshold);
        }

        // Check for duplicate signers
        let mut seen: Map<Address, bool> = Map::new(&env);
        for signer in signers.iter() {
            if seen.contains_key(signer.clone()) {
                return Err(MultisigError::DuplicateSigner);
            }
            seen.set(signer.clone(), true);
        }

        env.storage().instance().set(&SIGNERS, &signers);
        env.storage().instance().set(&THRESHOLD, &threshold);
        env.storage().instance().set(&PROP_COUNT, &0u32);
        env.storage().instance().set(&INITIALIZED, &true);
        Ok(())
    }

    // Create a new proposal. Only signers can propose.
    // `expiration_ledger` is the last ledger where this proposal can be executed.
    pub fn create_proposal(
        env: Env,
        proposer: Address,
        action: ProposalAction,
        expiration_ledger: u64,
    ) -> Result<u32, MultisigError> {
        Self::require_initialized(&env)?;
        proposer.require_auth();
        Self::require_signer(&env, &proposer)?;

        let id: u32 = env.storage().instance().get(&PROP_COUNT).unwrap();
        let next_id = id + 1;

        let proposal = Proposal {
            id: next_id,
            proposer: proposer.clone(),
            action,
            approvals: Vec::new(&env),
            status: ProposalStatus::Active,
            expiration: expiration_ledger,
        };

        env.storage().persistent().set(&proposal_key(next_id), &proposal);
        env.storage().instance().set(&PROP_COUNT, &next_id);
        Ok(next_id)
    }

    // Approve a proposal. Each signer can approve once.
    pub fn approve(env: Env, signer: Address, proposal_id: u32) -> Result<(), MultisigError> {
        Self::require_initialized(&env)?;
        signer.require_auth();
        Self::require_signer(&env, &signer)?;

        let mut proposal = Self::load_proposal(&env, proposal_id)?;
        Self::require_active(&env, &proposal)?;

        // Prevent double-approval
        for addr in proposal.approvals.iter() {
            if addr == signer {
                return Err(MultisigError::AlreadyApproved);
            }
        }

        proposal.approvals.push_back(signer);
        env.storage().persistent().set(&proposal_key(proposal_id), &proposal);
        Ok(())
    }

    // Revoke a previous approval. Signer can only revoke their own.
    pub fn revoke_approval(
        env: Env,
        signer: Address,
        proposal_id: u32,
    ) -> Result<(), MultisigError> {
        Self::require_initialized(&env)?;
        signer.require_auth();
        Self::require_signer(&env, &signer)?;

        let mut proposal = Self::load_proposal(&env, proposal_id)?;
        Self::require_active(&env, &proposal)?;

        let mut found = false;
        let mut new_approvals = Vec::new(&env);
        for addr in proposal.approvals.iter() {
            if addr == signer && !found {
                found = true; // skip this one (remove it)
            } else {
                new_approvals.push_back(addr);
            }
        }

        if !found {
            return Err(MultisigError::NotApproved);
        }

        proposal.approvals = new_approvals;
        env.storage().persistent().set(&proposal_key(proposal_id), &proposal);
        Ok(())
    }

    // Execute a proposal once enough approvals are collected.
    // Any signer can trigger execution.
    pub fn execute(env: Env, signer: Address, proposal_id: u32) -> Result<(), MultisigError> {
        Self::require_initialized(&env)?;
        signer.require_auth();
        Self::require_signer(&env, &signer)?;

        let mut proposal = Self::load_proposal(&env, proposal_id)?;
        Self::require_active(&env, &proposal)?;

        let threshold: u32 = env.storage().instance().get(&THRESHOLD).unwrap();
        if proposal.approvals.len() < threshold {
            return Err(MultisigError::ThresholdNotMet);
        }

        // Execute the action
        match &proposal.action {
            ProposalAction::Transfer(to, amount) => {
                // Transfer native token from contract to recipient
                let contract_addr = env.current_contract_address();
                let token = soroban_sdk::token::Client::new(
                    &env,
                    &env.storage()
                        .instance()
                        .get::<Symbol, Address>(&symbol_short!("token"))
                        .unwrap_or(contract_addr.clone()),
                );
                token.transfer(&contract_addr, to, amount);
            }
            ProposalAction::UpdateSigners(new_signers, new_threshold) => {
                // Validate new config
                if new_signers.is_empty() {
                    return Err(MultisigError::EmptySigners);
                }
                if *new_threshold == 0 || *new_threshold > new_signers.len() {
                    return Err(MultisigError::InvalidThreshold);
                }
                env.storage().instance().set(&SIGNERS, new_signers);
                env.storage().instance().set(&THRESHOLD, new_threshold);
            }
        }

        proposal.status = ProposalStatus::Executed;
        env.storage().persistent().set(&proposal_key(proposal_id), &proposal);
        Ok(())
    }

    // Set the token address used for Transfer proposals
    pub fn set_token(env: Env, signer: Address, token: Address) -> Result<(), MultisigError> {
        Self::require_initialized(&env)?;
        signer.require_auth();
        Self::require_signer(&env, &signer)?;
        env.storage().instance().set(&symbol_short!("token"), &token);
        Ok(())
    }

    // --- View functions ---

    pub fn get_proposal(env: Env, proposal_id: u32) -> Result<Proposal, MultisigError> {
        Self::load_proposal(&env, proposal_id)
    }

    pub fn get_signers(env: Env) -> Result<Vec<Address>, MultisigError> {
        Self::require_initialized(&env)?;
        Ok(env.storage().instance().get(&SIGNERS).unwrap())
    }

    pub fn get_threshold(env: Env) -> Result<u32, MultisigError> {
        Self::require_initialized(&env)?;
        Ok(env.storage().instance().get(&THRESHOLD).unwrap())
    }

    pub fn get_proposal_count(env: Env) -> Result<u32, MultisigError> {
        Self::require_initialized(&env)?;
        Ok(env.storage().instance().get(&PROP_COUNT).unwrap())
    }

    // --- Internal helpers ---

    fn require_initialized(env: &Env) -> Result<(), MultisigError> {
        if !env.storage().instance().has(&INITIALIZED) {
            return Err(MultisigError::NotInitialized);
        }
        Ok(())
    }

    fn require_signer(env: &Env, addr: &Address) -> Result<(), MultisigError> {
        let signers: Vec<Address> = env.storage().instance().get(&SIGNERS).unwrap();
        for s in signers.iter() {
            if s == *addr {
                return Ok(());
            }
        }
        Err(MultisigError::NotASigner)
    }

    fn load_proposal(env: &Env, id: u32) -> Result<Proposal, MultisigError> {
        env.storage()
            .persistent()
            .get(&proposal_key(id))
            .ok_or(MultisigError::ProposalNotFound)
    }

    fn require_active(env: &Env, proposal: &Proposal) -> Result<(), MultisigError> {
        if proposal.status == ProposalStatus::Executed {
            return Err(MultisigError::AlreadyExecuted);
        }
        let current_ledger = env.ledger().sequence() as u64;
        if current_ledger > proposal.expiration {
            return Err(MultisigError::ProposalExpired);
        }
        Ok(())
    }
}
