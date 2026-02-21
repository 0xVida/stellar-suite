use multisig_wallet::{MultisigWallet, MultisigWalletClient, ProposalAction, ProposalStatus};
use soroban_sdk::{testutils::Address as _, Address, Env, Vec};

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
