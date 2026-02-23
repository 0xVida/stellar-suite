use multisig_wallet::{MultisigWallet, MultisigWalletClient, ProposalAction, ProposalStatus};
use soroban_sdk::{testutils::{Address as _, Ledger as _}, Address, Env, Vec};

fn setup_env<'a>(env: &'a Env) -> (MultisigWalletClient<'a>, Address, Address, Address) {
    env.mock_all_auths();
    let contract_id = env.register_contract(None, MultisigWallet);
    let client = MultisigWalletClient::new(env, &contract_id);
    let s1 = Address::generate(env);
    let s2 = Address::generate(env);
    let s3 = Address::generate(env);
    (client, s1, s2, s3)
}

fn make_signers(env: &Env, addrs: &[Address]) -> Vec<Address> {
    let mut v = Vec::new(env);
    for a in addrs {
        v.push_back(a.clone());
    }
    v
}

// --- Initialization ---

#[test]
fn test_initialize_2_of_3() {
    let env = Env::default();
    let (client, s1, s2, s3) = setup_env(&env);
    client.initialize(&make_signers(&env, &[s1, s2, s3]), &2);

    assert_eq!(client.get_threshold(), 2);
    assert_eq!(client.get_signers().len(), 3);
}

#[test]
fn test_initialize_1_of_1() {
    let env = Env::default();
    let (client, s1, _, _) = setup_env(&env);
    client.initialize(&make_signers(&env, &[s1]), &1);

    assert_eq!(client.get_threshold(), 1);
    assert_eq!(client.get_signers().len(), 1);
}

#[test]
#[should_panic(expected = "Error(Contract, #1)")]
fn test_double_initialize_fails() {
    let env = Env::default();
    let (client, s1, s2, _) = setup_env(&env);
    let signers = make_signers(&env, &[s1, s2]);
    client.initialize(&signers, &2);
    client.initialize(&signers, &2);
}

#[test]
#[should_panic(expected = "Error(Contract, #3)")]
fn test_threshold_zero_fails() {
    let env = Env::default();
    let (client, s1, _, _) = setup_env(&env);
    client.initialize(&make_signers(&env, &[s1]), &0);
}

#[test]
#[should_panic(expected = "Error(Contract, #3)")]
fn test_threshold_exceeds_signers_fails() {
    let env = Env::default();
    let (client, s1, s2, _) = setup_env(&env);
    client.initialize(&make_signers(&env, &[s1, s2]), &3);
}

#[test]
#[should_panic(expected = "Error(Contract, #12)")]
fn test_empty_signers_fails() {
    let env = Env::default();
    let (client, _, _, _) = setup_env(&env);
    client.initialize(&Vec::new(&env), &1);
}

#[test]
#[should_panic(expected = "Error(Contract, #11)")]
fn test_duplicate_signers_fails() {
    let env = Env::default();
    let (client, s1, _, _) = setup_env(&env);
    client.initialize(&make_signers(&env, &[s1.clone(), s1]), &1);
}

// --- Proposal creation ---

#[test]
fn test_create_proposal() {
    let env = Env::default();
    let (client, s1, s2, s3) = setup_env(&env);
    client.initialize(&make_signers(&env, &[s1.clone(), s2, s3]), &2);

    let recipient = Address::generate(&env);
    let action = ProposalAction::Transfer(recipient, 1000);
    let id = client.create_proposal(&s1, &action, &1000u64);

    assert_eq!(id, 1);
    let proposal = client.get_proposal(&1);
    assert_eq!(proposal.proposer, s1);
    assert_eq!(proposal.status, ProposalStatus::Active);
    assert_eq!(proposal.approvals.len(), 0);
}

#[test]
fn test_proposal_count_increments() {
    let env = Env::default();
    let (client, s1, s2, _) = setup_env(&env);
    client.initialize(&make_signers(&env, &[s1.clone(), s2.clone()]), &1);

    let action = ProposalAction::Transfer(Address::generate(&env), 100);
    client.create_proposal(&s1, &action, &1000u64);
    client.create_proposal(&s2, &action, &1000u64);

    assert_eq!(client.get_proposal_count(), 2);
}

#[test]
#[should_panic(expected = "Error(Contract, #4)")]
fn test_non_signer_cannot_propose() {
    let env = Env::default();
    let (client, s1, s2, _) = setup_env(&env);
    client.initialize(&make_signers(&env, &[s1, s2]), &2);

    let outsider = Address::generate(&env);
    let action = ProposalAction::Transfer(Address::generate(&env), 100);
    client.create_proposal(&outsider, &action, &1000u64);
}

// --- Approvals ---

#[test]
fn test_approve_proposal() {
    let env = Env::default();
    let (client, s1, s2, s3) = setup_env(&env);
    client.initialize(&make_signers(&env, &[s1.clone(), s2.clone(), s3]), &2);

    let action = ProposalAction::Transfer(Address::generate(&env), 500);
    let id = client.create_proposal(&s1, &action, &1000u64);

    client.approve(&s1, &id);
    client.approve(&s2, &id);

    assert_eq!(client.get_proposal(&id).approvals.len(), 2);
}

#[test]
#[should_panic(expected = "Error(Contract, #6)")]
fn test_double_approval_fails() {
    let env = Env::default();
    let (client, s1, s2, _) = setup_env(&env);
    client.initialize(&make_signers(&env, &[s1.clone(), s2]), &2);

    let action = ProposalAction::Transfer(Address::generate(&env), 100);
    let id = client.create_proposal(&s1, &action, &1000u64);

    client.approve(&s1, &id);
    client.approve(&s1, &id);
}

#[test]
#[should_panic(expected = "Error(Contract, #4)")]
fn test_non_signer_cannot_approve() {
    let env = Env::default();
    let (client, s1, s2, _) = setup_env(&env);
    client.initialize(&make_signers(&env, &[s1.clone(), s2]), &2);

    let action = ProposalAction::Transfer(Address::generate(&env), 100);
    let id = client.create_proposal(&s1, &action, &1000u64);

    let outsider = Address::generate(&env);
    client.approve(&outsider, &id);
}

// --- Revoke ---

#[test]
fn test_revoke_approval() {
    let env = Env::default();
    let (client, s1, s2, s3) = setup_env(&env);
    client.initialize(&make_signers(&env, &[s1.clone(), s2, s3]), &2);

    let action = ProposalAction::Transfer(Address::generate(&env), 100);
    let id = client.create_proposal(&s1, &action, &1000u64);

    client.approve(&s1, &id);
    assert_eq!(client.get_proposal(&id).approvals.len(), 1);

    client.revoke_approval(&s1, &id);
    assert_eq!(client.get_proposal(&id).approvals.len(), 0);
}

#[test]
#[should_panic(expected = "Error(Contract, #7)")]
fn test_revoke_without_approval_fails() {
    let env = Env::default();
    let (client, s1, s2, _) = setup_env(&env);
    client.initialize(&make_signers(&env, &[s1.clone(), s2.clone()]), &2);

    let action = ProposalAction::Transfer(Address::generate(&env), 100);
    let id = client.create_proposal(&s1, &action, &1000u64);

    client.revoke_approval(&s2, &id);
}

// --- Execution ---

#[test]
#[should_panic(expected = "Error(Contract, #8)")]
fn test_execute_below_threshold_fails() {
    let env = Env::default();
    let (client, s1, s2, s3) = setup_env(&env);
    client.initialize(&make_signers(&env, &[s1.clone(), s2, s3]), &2);

    let action = ProposalAction::Transfer(Address::generate(&env), 100);
    let id = client.create_proposal(&s1, &action, &1000u64);

    client.approve(&s1, &id);
    client.execute(&s1, &id);
}

#[test]
fn test_update_signers_via_proposal() {
    let env = Env::default();
    let (client, s1, s2, s3) = setup_env(&env);
    client.initialize(&make_signers(&env, &[s1.clone(), s2.clone(), s3]), &2);

    let new_signer = Address::generate(&env);
    let new_signers = make_signers(&env, &[s1.clone(), new_signer]);
    let action = ProposalAction::UpdateSigners(new_signers, 1);
    let id = client.create_proposal(&s1, &action, &1000u64);

    client.approve(&s1, &id);
    client.approve(&s2, &id);
    client.execute(&s1, &id);

    assert_eq!(client.get_threshold(), 1);
    assert_eq!(client.get_signers().len(), 2);
}

#[test]
#[should_panic(expected = "Error(Contract, #9)")]
fn test_execute_already_executed_fails() {
    let env = Env::default();
    let (client, s1, s2, s3) = setup_env(&env);
    client.initialize(&make_signers(&env, &[s1.clone(), s2.clone(), s3]), &2);

    let new_signers = make_signers(&env, &[s1.clone()]);
    let action = ProposalAction::UpdateSigners(new_signers, 1);
    let id = client.create_proposal(&s1, &action, &1000u64);

    client.approve(&s1, &id);
    client.approve(&s2, &id);
    client.execute(&s1, &id);
    client.execute(&s1, &id);
}

#[test]
#[should_panic(expected = "Error(Contract, #5)")]
fn test_get_nonexistent_proposal_fails() {
    let env = Env::default();
    let (client, s1, s2, _) = setup_env(&env);
    client.initialize(&make_signers(&env, &[s1, s2]), &1);

    client.get_proposal(&999);
}

#[test]
#[should_panic(expected = "Error(Contract, #4)")]
fn test_non_signer_cannot_execute() {
    let env = Env::default();
    let (client, s1, s2, _) = setup_env(&env);
    client.initialize(&make_signers(&env, &[s1.clone(), s2]), &1);

    let action = ProposalAction::Transfer(Address::generate(&env), 100);
    let id = client.create_proposal(&s1, &action, &1000u64);
    client.approve(&s1, &id);

    let outsider = Address::generate(&env);
    client.execute(&outsider, &id);
}

// --- View functions before init ---

#[test]
#[should_panic(expected = "Error(Contract, #2)")]
fn test_get_signers_before_init_fails() {
    let env = Env::default();
    let (client, _, _, _) = setup_env(&env);
    client.get_signers();
}

#[test]
#[should_panic(expected = "Error(Contract, #2)")]
fn test_get_threshold_before_init_fails() {
    let env = Env::default();
    let (client, _, _, _) = setup_env(&env);
    client.get_threshold();
}

// --- Threshold Combinations ---

#[test]
fn test_initialize_3_of_5() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register_contract(None, MultisigWallet);
    let client = MultisigWalletClient::new(&env, &contract_id);
    let s1 = Address::generate(&env);
    let s2 = Address::generate(&env);
    let s3 = Address::generate(&env);
    let s4 = Address::generate(&env);
    let s5 = Address::generate(&env);

    client.initialize(&make_signers(&env, &[s1, s2, s3, s4, s5]), &3);

    assert_eq!(client.get_threshold(), 3);
    assert_eq!(client.get_signers().len(), 5);
}

#[test]
fn test_execute_exact_threshold() {
    // Proposal executes with exactly the threshold number of approvals, no more.
    let env = Env::default();
    let (client, s1, s2, s3) = setup_env(&env);
    client.initialize(&make_signers(&env, &[s1.clone(), s2.clone(), s3]), &2);

    let new_signers = make_signers(&env, &[s1.clone(), s2.clone()]);
    let action = ProposalAction::UpdateSigners(new_signers, 1);
    let id = client.create_proposal(&s1, &action, &1000u64);

    // Approve exactly 2 times (threshold = 2)
    client.approve(&s1, &id);
    client.approve(&s2, &id);

    client.execute(&s1, &id);

    assert_eq!(client.get_proposal(&id).status, ProposalStatus::Executed);
}

// --- Approval / Revoke Flows ---

#[test]
fn test_revoke_and_re_approve() {
    // Revoke an approval, then re-approve allowing final execution.
    let env = Env::default();
    let (client, s1, s2, s3) = setup_env(&env);
    client.initialize(&make_signers(&env, &[s1.clone(), s2.clone(), s3]), &2);

    let new_signers = make_signers(&env, &[s1.clone(), s2.clone()]);
    let action = ProposalAction::UpdateSigners(new_signers, 1);
    let id = client.create_proposal(&s1, &action, &1000u64);

    client.approve(&s1, &id);
    assert_eq!(client.get_proposal(&id).approvals.len(), 1);

    // Revoke s1's approval
    client.revoke_approval(&s1, &id);
    assert_eq!(client.get_proposal(&id).approvals.len(), 0);

    // Re-approve
    client.approve(&s1, &id);
    client.approve(&s2, &id);

    // Now enough approvals -> execute should work
    client.execute(&s1, &id);
    assert_eq!(client.get_proposal(&id).status, ProposalStatus::Executed);
}

#[test]
#[should_panic(expected = "Error(Contract, #8)")]
fn test_all_signers_revoking_prevents_execution() {
    let env = Env::default();
    let (client, s1, s2, _) = setup_env(&env);
    client.initialize(&make_signers(&env, &[s1.clone(), s2.clone()]), &2);

    let action = ProposalAction::Transfer(Address::generate(&env), 500);
    let id = client.create_proposal(&s1, &action, &1000u64);

    client.approve(&s1, &id);
    client.approve(&s2, &id);
    client.revoke_approval(&s1, &id);
    client.revoke_approval(&s2, &id);

    // No approvals left, executing should fail with ThresholdNotMet (#8)
    client.execute(&s1, &id);
}

// --- Security Scenarios ---

#[test]
#[should_panic(expected = "Error(Contract, #4)")]
fn test_outsider_cannot_revoke_others_approval() {
    let env = Env::default();
    let (client, s1, s2, _) = setup_env(&env);
    client.initialize(&make_signers(&env, &[s1.clone(), s2]), &2);

    let action = ProposalAction::Transfer(Address::generate(&env), 200);
    let id = client.create_proposal(&s1, &action, &1000u64);
    client.approve(&s1, &id);

    // A random outsider tries to revoke - should fail with NotASigner (#4)
    let outsider = Address::generate(&env);
    client.revoke_approval(&outsider, &id);
}

#[test]
#[should_panic(expected = "Error(Contract, #4)")]
fn test_outsider_cannot_call_set_token() {
    let env = Env::default();
    let (client, s1, s2, _) = setup_env(&env);
    client.initialize(&make_signers(&env, &[s1, s2]), &2);

    // A random outsider tries to set the token address
    let outsider = Address::generate(&env);
    let token_addr = Address::generate(&env);
    client.set_token(&outsider, &token_addr);
}

// --- Expired Proposal Edge Cases ---

#[test]
#[should_panic(expected = "Error(Contract, #10)")]
fn test_expired_proposal_cannot_be_approved() {
    let env = Env::default();
    let (client, s1, s2, _) = setup_env(&env);
    client.initialize(&make_signers(&env, &[s1.clone(), s2]), &2);

    // Create proposal that expires at ledger sequence 5
    let action = ProposalAction::Transfer(Address::generate(&env), 100);
    let id = client.create_proposal(&s1, &action, &5u64);

    // Advance ledger sequence past expiry
    env.ledger().with_mut(|li| li.sequence_number = 6);

    // Approving should fail with ProposalExpired (#10)
    client.approve(&s1, &id);
}

#[test]
#[should_panic(expected = "Error(Contract, #10)")]
fn test_expired_proposal_cannot_be_executed() {
    let env = Env::default();
    let (client, s1, s2, _) = setup_env(&env);
    client.initialize(&make_signers(&env, &[s1.clone(), s2.clone()]), &2);

    // Create proposal that expires at ledger sequence 5
    let action = ProposalAction::Transfer(Address::generate(&env), 100);
    let id = client.create_proposal(&s1, &action, &5u64);

    // Approve before expiry
    client.approve(&s1, &id);
    client.approve(&s2, &id);

    // Advance ledger sequence past expiry
    env.ledger().with_mut(|li| li.sequence_number = 6);

    // Executing should fail with ProposalExpired (#10)
    client.execute(&s1, &id);
}

// --- UpdateSigners Edge Cases ---

#[test]
#[should_panic(expected = "Error(Contract, #12)")]
fn test_update_to_empty_signers_fails() {
    // An UpdateSigners proposal that sets an empty signer list should fail on execute.
    let env = Env::default();
    let (client, s1, s2, _) = setup_env(&env);
    client.initialize(&make_signers(&env, &[s1.clone(), s2.clone()]), &1);

    let empty: Vec<Address> = Vec::new(&env);
    let action = ProposalAction::UpdateSigners(empty, 1);
    let id = client.create_proposal(&s1, &action, &1000u64);

    client.approve(&s1, &id);
    client.execute(&s1, &id);
}

#[test]
#[should_panic(expected = "Error(Contract, #3)")]
fn test_update_invalid_threshold_fails() {
    // An UpdateSigners proposal that sets threshold > new signer count should fail on execute.
    let env = Env::default();
    let (client, s1, s2, _) = setup_env(&env);
    client.initialize(&make_signers(&env, &[s1.clone(), s2.clone()]), &1);

    let new_signers = make_signers(&env, &[s1.clone()]);
    // threshold of 5 with only 1 signer is invalid
    let action = ProposalAction::UpdateSigners(new_signers, 5);
    let id = client.create_proposal(&s1, &action, &1000u64);

    client.approve(&s1, &id);
    client.execute(&s1, &id);
}

#[test]
fn test_multiple_proposals_independent() {
    // Two proposals exist concurrently and can be independently approved/executed.
    let env = Env::default();
    let (client, s1, s2, s3) = setup_env(&env);
    client.initialize(&make_signers(&env, &[s1.clone(), s2.clone(), s3]), &1);

    let action_a = ProposalAction::Transfer(Address::generate(&env), 100);
    let action_b = ProposalAction::Transfer(Address::generate(&env), 200);

    let id_a = client.create_proposal(&s1, &action_a, &1000u64);
    let id_b = client.create_proposal(&s2, &action_b, &1000u64);

    // Approve only proposal A
    client.approve(&s1, &id_a);

    // Proposal B still has 0 approvals
    assert_eq!(client.get_proposal(&id_a).approvals.len(), 1);
    assert_eq!(client.get_proposal(&id_b).approvals.len(), 0);
    assert_eq!(client.get_proposal_count(), 2);
}
