//! # Escrow Contract Template
//!
//! A configurable escrow contract for Soroban supporting:
//! - Deposits by a payer into escrow cases
//! - Time-based release constraints
//! - Conditional release or refund by authorized parties
//! - Multi-party approver requirements
//!
//! Template: escrow
//! Category: escrow
//! Version: 0.1.0

#![no_std]

use soroban_sdk::{contract, contractimpl, contracttype, Address, Env, Vec};

#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum EscrowStatus {
    Pending,
    Released,
    Refunded,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EscrowCase {
    pub id: u64,
    pub payer: Address,
    pub payee: Address,
    pub arbiter: Address,
    pub amount: u128,
    pub release_after: u64,
    pub required_approvals: u32,
    pub release_approvers: Vec<Address>,
    pub refund_approvers: Vec<Address>,
    pub status: EscrowStatus,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AdminView {
    pub admin: Address,
    pub pending_admin: Option<Address>,
}

#[contracttype]
#[derive(Clone)]
enum StorageKey {
    Admin,
    PendingAdmin,
    EscrowCount,
    Escrow(u64),
}

#[contract]
pub struct EscrowContract;

#[contractimpl]
impl EscrowContract {
    /// Initialize the contract with an admin address.
    pub fn initialize(env: Env, admin: Address) {
        if env.storage().instance().has(&StorageKey::Admin) {
            panic!("already initialized");
        }

        admin.require_auth();
        env.storage().instance().set(&StorageKey::Admin, &admin);
    }

    /// Return the active admin and any pending admin transfer.
    pub fn admin(env: Env) -> AdminView {
        AdminView {
            admin: Self::read_admin(&env),
            pending_admin: env.storage().instance().get(&StorageKey::PendingAdmin),
        }
    }

    /// Start transferring admin authority to a new address.
    pub fn transfer_admin(env: Env, admin: Address, new_admin: Address) {
        let current_admin = Self::read_admin(&env);
        admin.require_auth();
        if admin != current_admin {
            panic!("not admin");
        }

        env.storage()
            .instance()
            .set(&StorageKey::PendingAdmin, &new_admin);
    }

    /// Accept a pending admin transfer.
    pub fn accept_admin(env: Env, pending_admin: Address) {
        pending_admin.require_auth();
        let expected_admin: Address = env
            .storage()
            .instance()
            .get(&StorageKey::PendingAdmin)
            .expect("not pending admin");

        if pending_admin != expected_admin {
            panic!("not pending admin");
        }

        env.storage()
            .instance()
            .set(&StorageKey::Admin, &pending_admin);
        env.storage().instance().remove(&StorageKey::PendingAdmin);
    }

    /// Create a new escrow case and deposit funds into it.
    ///
    /// # Arguments
    /// * `payer` - Account providing escrowed funds
    /// * `payee` - Account receiving funds on release
    /// * `arbiter` - Neutral account that may approve release/refund
    /// * `amount` - Escrow amount tracked by this contract
    /// * `release_after` - Earliest ledger timestamp for release (seconds)
    /// * `required_approvals` - Minimum approvals from payer/payee/arbiter for release/refund
    ///
    /// # Returns
    /// * `u64` - New escrow case ID
    pub fn deposit(
        env: Env,
        payer: Address,
        payee: Address,
        arbiter: Address,
        amount: u128,
        release_after: u64,
        required_approvals: u32,
    ) -> u64 {
        payer.require_auth();
        assert!(amount > 0, "amount must be greater than zero");
        assert!(payer != payee, "payer and payee must differ");
        assert!(payer != arbiter, "payer and arbiter must differ");
        assert!(payee != arbiter, "payee and arbiter must differ");
        assert!(
            required_approvals > 0 && required_approvals <= 3,
            "required approvals must be between 1 and 3"
        );

        let escrow_id = Self::escrow_count(env.clone()) + 1;

        let now = env.ledger().timestamp();
        assert!(release_after >= now, "release_after cannot be in the past");

        let escrow = EscrowCase {
            id: escrow_id,
            payer,
            payee,
            arbiter,
            amount,
            release_after,
            required_approvals,
            release_approvers: Vec::new(&env),
            refund_approvers: Vec::new(&env),
            status: EscrowStatus::Pending,
        };

        env.storage()
            .persistent()
            .set(&StorageKey::Escrow(escrow_id), &escrow);
        env.storage()
            .instance()
            .set(&StorageKey::EscrowCount, &escrow_id);

        escrow_id
    }

    /// Approve and execute release to payee when approval and time conditions are satisfied.
    pub fn release(env: Env, escrow_id: u64, approver: Address) {
        approver.require_auth();

        let mut escrow = Self::get_escrow(env.clone(), escrow_id);
        assert_eq!(escrow.status, EscrowStatus::Pending, "escrow not pending");
        assert!(
            env.ledger().timestamp() >= escrow.release_after,
            "release time not reached"
        );

        Self::assert_is_party(&escrow, &approver);
        Self::add_unique_approver(&env, &mut escrow.release_approvers, approver);

        if escrow.release_approvers.len() as u32 >= escrow.required_approvals {
            escrow.status = EscrowStatus::Released;
        }

        env.storage()
            .persistent()
            .set(&StorageKey::Escrow(escrow_id), &escrow);
    }

    /// Approve and execute refund to payer when approval threshold is met.
    pub fn refund(env: Env, escrow_id: u64, approver: Address) {
        approver.require_auth();

        let mut escrow = Self::get_escrow(env.clone(), escrow_id);
        assert_eq!(escrow.status, EscrowStatus::Pending, "escrow not pending");

        Self::assert_is_party(&escrow, &approver);
        Self::add_unique_approver(&env, &mut escrow.refund_approvers, approver);

        if escrow.refund_approvers.len() as u32 >= escrow.required_approvals {
            escrow.status = EscrowStatus::Refunded;
        }

        env.storage()
            .persistent()
            .set(&StorageKey::Escrow(escrow_id), &escrow);
    }

    /// Get full escrow case details by ID.
    pub fn get_escrow(env: Env, escrow_id: u64) -> EscrowCase {
        env.storage()
            .persistent()
            .get(&StorageKey::Escrow(escrow_id))
            .expect("escrow not found")
    }

    /// Return total number of escrow cases created.
    pub fn escrow_count(env: Env) -> u64 {
        env.storage()
            .instance()
            .get(&StorageKey::EscrowCount)
            .unwrap_or(0)
    }

    fn read_admin(env: &Env) -> Address {
        env.storage()
            .instance()
            .get(&StorageKey::Admin)
            .expect("not initialized")
    }

    fn assert_is_party(escrow: &EscrowCase, addr: &Address) {
        assert!(
            *addr == escrow.payer || *addr == escrow.payee || *addr == escrow.arbiter,
            "approver must be payer, payee, or arbiter"
        );
    }

    fn add_unique_approver(env: &Env, approvers: &mut Vec<Address>, approver: Address) {
        for existing in approvers.iter() {
            if existing == approver {
                panic!("duplicate approval");
            }
        }
        approvers.push_back(approver);

        // Extend instance TTL to encourage persistence in longer-running test scenarios.
        env.storage().instance().extend_ttl(100, 1000);
    }
}
