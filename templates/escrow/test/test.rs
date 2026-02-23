#![cfg(test)]

use escrow_contract::{EscrowContract, EscrowContractClient, EscrowStatus};
use soroban_sdk::{testutils::{Address as _, Ledger as _}, Address, Env};

// --- Helpers ---

fn setup<'a>(env: &'a Env) -> (EscrowContractClient<'a>, Address, Address, Address) {
    env.mock_all_auths();
    let contract_id = env.register_contract(None, EscrowContract);
    let client = EscrowContractClient::new(env, &contract_id);
    let payer   = Address::generate(env);
    let payee   = Address::generate(env);
    let arbiter = Address::generate(env);
    (client, payer, payee, arbiter)
}

/// Advance the ledger timestamp by `seconds`.
fn advance_time(env: &Env, seconds: u64) {
    let now = env.ledger().timestamp();
    env.ledger().with_mut(|li| li.timestamp = now + seconds);
}

/// Create a standard escrow (release_after = current time, required_approvals = 1).
fn create_escrow(client: &EscrowContractClient, payer: &Address, payee: &Address, arbiter: &Address, amount: u128, release_after: u64, approvals: u32) -> u64 {
    client.deposit(payer, payee, arbiter, &amount, &release_after, &approvals)
}

// =====================
// DEPOSIT TESTS
// =====================

#[test]
fn test_deposit_creates_escrow() {
    let env = Env::default();
    let (client, payer, payee, arbiter) = setup(&env);
    let now = env.ledger().timestamp();

    let id = create_escrow(&client, &payer, &payee, &arbiter, 1000, now, 1);

    assert_eq!(id, 1);
    let escrow = client.get_escrow(&id);
    assert_eq!(escrow.payer,   payer);
    assert_eq!(escrow.payee,   payee);
    assert_eq!(escrow.arbiter, arbiter);
    assert_eq!(escrow.amount,  1000);
    assert_eq!(escrow.status,  EscrowStatus::Pending);
    assert_eq!(escrow.release_approvers.len(), 0);
    assert_eq!(escrow.refund_approvers.len(),  0);
}

#[test]
fn test_deposit_increments_count() {
    let env = Env::default();
    let (client, payer, payee, arbiter) = setup(&env);
    let now = env.ledger().timestamp();

    create_escrow(&client, &payer, &payee, &arbiter, 100, now, 1);
    create_escrow(&client, &payer, &payee, &arbiter, 200, now, 1);
    create_escrow(&client, &payer, &payee, &arbiter, 300, now, 1);

    assert_eq!(client.escrow_count(), 3);
}

#[test]
#[should_panic(expected = "amount must be greater than zero")]
fn test_deposit_zero_amount_panics() {
    let env = Env::default();
    let (client, payer, payee, arbiter) = setup(&env);
    let now = env.ledger().timestamp();
    create_escrow(&client, &payer, &payee, &arbiter, 0, now, 1);
}

#[test]
#[should_panic(expected = "payer and payee must differ")]
fn test_deposit_payer_equals_payee_panics() {
    let env = Env::default();
    let (client, payer, _, arbiter) = setup(&env);
    let now = env.ledger().timestamp();
    create_escrow(&client, &payer, &payer, &arbiter, 100, now, 1);
}

#[test]
#[should_panic(expected = "payer and arbiter must differ")]
fn test_deposit_payer_equals_arbiter_panics() {
    let env = Env::default();
    let (client, payer, payee, _) = setup(&env);
    let now = env.ledger().timestamp();
    create_escrow(&client, &payer, &payee, &payer, 100, now, 1);
}

#[test]
#[should_panic(expected = "required approvals must be between 1 and 3")]
fn test_deposit_invalid_approvals_zero_panics() {
    let env = Env::default();
    let (client, payer, payee, arbiter) = setup(&env);
    let now = env.ledger().timestamp();
    create_escrow(&client, &payer, &payee, &arbiter, 100, now, 0);
}

#[test]
#[should_panic(expected = "required approvals must be between 1 and 3")]
fn test_deposit_invalid_approvals_over_3_panics() {
    let env = Env::default();
    let (client, payer, payee, arbiter) = setup(&env);
    let now = env.ledger().timestamp();
    create_escrow(&client, &payer, &payee, &arbiter, 100, now, 4);
}

// =====================
// RELEASE TESTS
// =====================

#[test]
fn test_release_after_time_with_1_of_1_approval() {
    let env = Env::default();
    let (client, payer, payee, arbiter) = setup(&env);
    let now = env.ledger().timestamp();

    let id = create_escrow(&client, &payer, &payee, &arbiter, 500, now, 1);

    // release_after = now, so time condition is already met
    client.release(&id, &payer);

    assert_eq!(client.get_escrow(&id).status, EscrowStatus::Released);
}

#[test]
#[should_panic(expected = "release time not reached")]
fn test_release_requires_time_to_pass() {
    let env = Env::default();
    let (client, payer, payee, arbiter) = setup(&env);
    let now = env.ledger().timestamp();

    // release_after is 1 hour in the future
    let id = create_escrow(&client, &payer, &payee, &arbiter, 100, now + 3600, 1);

    // Time hasn't advanced so release should panic
    client.release(&id, &payer);
}

#[test]
fn test_release_requires_2_of_3_approvals() {
    let env = Env::default();
    let (client, payer, payee, arbiter) = setup(&env);
    let now = env.ledger().timestamp();

    let id = create_escrow(&client, &payer, &payee, &arbiter, 1000, now, 2);

    // First approval - still Pending
    client.release(&id, &payer);
    assert_eq!(client.get_escrow(&id).status, EscrowStatus::Pending);

    // Second approval - now Released
    client.release(&id, &payee);
    assert_eq!(client.get_escrow(&id).status, EscrowStatus::Released);
}

#[test]
#[should_panic(expected = "approver must be payer, payee, or arbiter")]
fn test_release_outsider_cannot_approve() {
    let env = Env::default();
    let (client, payer, payee, arbiter) = setup(&env);
    let now = env.ledger().timestamp();

    let id = create_escrow(&client, &payer, &payee, &arbiter, 100, now, 1);

    let outsider = Address::generate(&env);
    client.release(&id, &outsider);
}

#[test]
#[should_panic(expected = "duplicate approval")]
fn test_duplicate_release_approval_panics() {
    let env = Env::default();
    let (client, payer, payee, arbiter) = setup(&env);
    let now = env.ledger().timestamp();

    let id = create_escrow(&client, &payer, &payee, &arbiter, 100, now, 2);

    client.release(&id, &payer);
    // Payer approves again - should panic
    client.release(&id, &payer);
}

#[test]
#[should_panic(expected = "escrow not pending")]
fn test_release_already_released_panics() {
    let env = Env::default();
    let (client, payer, payee, arbiter) = setup(&env);
    let now = env.ledger().timestamp();

    let id = create_escrow(&client, &payer, &payee, &arbiter, 100, now, 1);

    // Release once (threshold met)
    client.release(&id, &payer);
    assert_eq!(client.get_escrow(&id).status, EscrowStatus::Released);

    // Attempt to release again
    client.release(&id, &payee);
}

// =====================
// REFUND TESTS
// =====================

#[test]
fn test_refund_with_1_of_1_approval() {
    let env = Env::default();
    let (client, payer, payee, arbiter) = setup(&env);
    let now = env.ledger().timestamp();

    // Refund has no time constraint
    let id = create_escrow(&client, &payer, &payee, &arbiter, 500, now + 9999, 1);

    client.refund(&id, &payer);

    assert_eq!(client.get_escrow(&id).status, EscrowStatus::Refunded);
}

#[test]
fn test_refund_requires_2_of_3_approvals() {
    let env = Env::default();
    let (client, payer, payee, arbiter) = setup(&env);
    let now = env.ledger().timestamp();

    let id = create_escrow(&client, &payer, &payee, &arbiter, 1000, now + 9999, 2);

    // First refund approval - still Pending
    client.refund(&id, &payer);
    assert_eq!(client.get_escrow(&id).status, EscrowStatus::Pending);

    // Second refund approval - now Refunded
    client.refund(&id, &payee);
    assert_eq!(client.get_escrow(&id).status, EscrowStatus::Refunded);
}

#[test]
#[should_panic(expected = "approver must be payer, payee, or arbiter")]
fn test_refund_outsider_cannot_approve() {
    let env = Env::default();
    let (client, payer, payee, arbiter) = setup(&env);
    let now = env.ledger().timestamp();

    let id = create_escrow(&client, &payer, &payee, &arbiter, 100, now + 9999, 1);

    let outsider = Address::generate(&env);
    client.refund(&id, &outsider);
}

#[test]
#[should_panic(expected = "duplicate approval")]
fn test_duplicate_refund_approval_panics() {
    let env = Env::default();
    let (client, payer, payee, arbiter) = setup(&env);
    let now = env.ledger().timestamp();

    let id = create_escrow(&client, &payer, &payee, &arbiter, 100, now + 9999, 2);

    client.refund(&id, &payer);
    // Payer tries to refund again
    client.refund(&id, &payer);
}

#[test]
#[should_panic(expected = "escrow not pending")]
fn test_refund_already_refunded_panics() {
    let env = Env::default();
    let (client, payer, payee, arbiter) = setup(&env);
    let now = env.ledger().timestamp();

    let id = create_escrow(&client, &payer, &payee, &arbiter, 100, now + 9999, 1);

    client.refund(&id, &payer);
    assert_eq!(client.get_escrow(&id).status, EscrowStatus::Refunded);

    // Attempt to refund again
    client.refund(&id, &payee);
}

// =====================
// MULTI-PARTY SCENARIOS
// =====================

#[test]
fn test_arbiter_breaks_deadlock_for_release() {
    // In a 2-of-3, payer and arbiter can release even without payee.
    let env = Env::default();
    let (client, payer, payee, arbiter) = setup(&env);
    let now = env.ledger().timestamp();

    let id = create_escrow(&client, &payer, &payee, &arbiter, 500, now, 2);

    // Payer approves release
    client.release(&id, &payer);
    assert_eq!(client.get_escrow(&id).status, EscrowStatus::Pending);

    // Arbiter breaks deadlock
    client.release(&id, &arbiter);
    assert_eq!(client.get_escrow(&id).status, EscrowStatus::Released);
}

#[test]
fn test_arbiter_breaks_deadlock_for_refund() {
    // In a 2-of-3, payee and arbiter can trigger a refund.
    let env = Env::default();
    let (client, payer, payee, arbiter) = setup(&env);
    let now = env.ledger().timestamp();

    let id = create_escrow(&client, &payer, &payee, &arbiter, 500, now + 9999, 2);

    // Payee approves refund
    client.refund(&id, &payee);
    assert_eq!(client.get_escrow(&id).status, EscrowStatus::Pending);

    // Arbiter breaks deadlock
    client.refund(&id, &arbiter);
    assert_eq!(client.get_escrow(&id).status, EscrowStatus::Refunded);
}

// =====================
// EDGE CASES
// =====================

#[test]
#[should_panic(expected = "escrow not found")]
fn test_get_escrow_nonexistent_panics() {
    let env = Env::default();
    let (client, _, _, _) = setup(&env);
    client.get_escrow(&999u64);
}
