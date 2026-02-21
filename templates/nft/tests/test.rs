#![cfg(test)]

use nft_contract::{NftContract, NftContractClient};
use soroban_sdk::{testutils::Address as _, Address, Env, String};

#[test]
fn test_nft_minting_and_metadata() {
    let env = Env::default();
    env.mock_all_auths();
    
    let contract_id = env.register_contract(None, NftContract);
    let client = NftContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    
    // Initialize
    let name = String::from_str(&env, "Test NFT");
    let symbol = String::from_str(&env, "TNFT");
    let base_uri = String::from_str(&env, "ipfs://baseuri/");
    client.initialize(&admin, &name, &symbol, &base_uri);
    
    // Mint
    let receiver = Address::generate(&env);
    let token_uri = String::from_str(&env, "ipfs://tokenuri/1");
    let token_id = client.mint(&receiver, &token_uri);

    assert_eq!(token_id, 1);
    
    // Check owner
    assert_eq!(client.get_owner(&token_id), receiver);
    
    // Check metadata
    let metadata = client.get_metadata(&token_id);
    assert_eq!(metadata.name, name);
    assert_eq!(metadata.symbol, symbol);
    assert_eq!(metadata.uri, token_uri);
    
    // Transfer
    let new_receiver = Address::generate(&env);
    client.transfer(&receiver, &new_receiver, &token_id);
    assert_eq!(client.get_owner(&token_id), new_receiver);
    
    // Royalty
    let royalty_receiver = Address::generate(&env);
    client.set_royalty(&royalty_receiver, &500); // 5% global royalty
    
    let (r_addr, amount) = client.get_royalty(&token_id, &1000); // Sale price 1000
    assert_eq!(r_addr, royalty_receiver);
    assert_eq!(amount, 50); // 5% of 1000
    
    // Token specific royalty
    let specific_receiver = Address::generate(&env);
    client.set_token_royalty(&token_id, &specific_receiver, &1000); // 10%
    
    let (r_addr2, amount2) = client.get_royalty(&token_id, &1000);
    assert_eq!(r_addr2, specific_receiver);
    assert_eq!(amount2, 100); // 10% of 1000
}
