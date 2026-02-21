# Voting/Governance Contract Template

> A comprehensive decentralized governance smart contract for on-chain proposal management, voting, and execution.

## Overview

This template provides a production-ready governance system that enables decentralized decision-making through on-chain proposals and voting. It includes essential governance features like quorum requirements, vote delegation, and flexible threshold configurations.

**Category:** voting  
**Version:** 0.1.0  
**Author:** Stellar Suite  
**License:** Apache-2.0

### Key Features

- ✅ **Proposal Creation & Management** - Create proposals with descriptions and track their lifecycle
- ✅ **Flexible Voting** - Support for Yes/No/Abstain votes
- ✅ **Vote Delegation** - Delegate voting power to trusted representatives
- ✅ **Quorum Requirements** - Ensure minimum participation levels
- ✅ **Threshold Logic** - Configurable passing thresholds (e.g., 51% majority)
- ✅ **Token-Based Voting Power** - Voting weight determined by token balance
- ✅ **Proposal States** - Track proposals through their lifecycle (Pending, Active, Passed, Rejected, Executed, Cancelled)
- ✅ **Security Controls** - Prevent double voting, unauthorized execution, and invalid configurations

---

## Prerequisites

Before using this template, ensure you have:

- Rust toolchain installed (`rustup`)
- WASM target: `rustup target add wasm32-unknown-unknown`
- Stellar CLI installed (`cargo install --locked stellar-cli`)
- Soroban SDK `20.0.0` or compatible
- A deployed token contract for voting power (or use existing Stellar assets)

---

## Folder Structure

```
voting/
├── template.json       # Template metadata and configuration
├── Cargo.toml          # Rust project dependencies
├── README.md           # This file
├── src/
│   └── lib.rs          # Governance contract implementation
└── tests/
    └── test.rs         # Comprehensive test suite
```

---

## Contract Functions

### Initialization

| Function | Parameters | Returns | Description |
|---|---|---|---|
| `initialize` | `admin: Address`<br>`voting_token: Address`<br>`quorum_threshold: u128`<br>`pass_threshold_percent: u32`<br>`voting_period: u64` | - | Initialize the governance contract with admin, voting token, quorum requirements, pass threshold percentage (0-100), and voting period duration in seconds. |

### Proposal Management

| Function | Parameters | Returns | Description |
|---|---|---|---|
| `create_proposal` | `proposer: Address`<br>`description: String` | `u64` | Create a new governance proposal. Returns the proposal ID. Description must be ≤500 characters. |
| `get_proposal` | `proposal_id: u64` | `Proposal` | Retrieve complete proposal details including votes, status, and timing. |
| `get_proposal_count` | - | `u64` | Get the total number of proposals created. |
| `cancel_proposal` | `caller: Address`<br>`proposal_id: u64` | - | Cancel an active proposal. Only the proposer or contract admin can cancel. |

### Voting

| Function | Parameters | Returns | Description |
|---|---|---|---|
| `vote` | `voter: Address`<br>`proposal_id: u64`<br>`vote_type: VoteType` | - | Cast a vote on an active proposal. Vote types: `Yes`, `No`, `Abstain`. Requires voting power (token balance + delegated power). Each address can only vote once per proposal. |
| `delegate_vote` | `delegator: Address`<br>`delegate: Address` | - | Delegate your voting power to another address. The delegate receives your token balance as additional voting power. |
| `get_delegate` | `delegator: Address` | `Option<Address>` | Check if an address has delegated their voting power and to whom. |
| `get_vote_count` | `proposal_id: u64` | `(u128, u128, u128)` | Get vote counts for a proposal as tuple: (yes_votes, no_votes, abstain_votes). |
| `get_voting_power` | `voter: Address` | `u128` | Get total voting power for an address (token balance + delegated power). |

### Execution

| Function | Parameters | Returns | Description |
|---|---|---|---|
| `execute_proposal` | `caller: Address`<br>`proposal_id: u64` | - | Finalize and execute a proposal after the voting period ends. Checks quorum and threshold requirements. Updates status to Passed or Rejected. |

---

## Data Structures

### Proposal

```rust
pub struct Proposal {
    pub id: u64,                    // Unique proposal identifier
    pub proposer: Address,          // Address that created the proposal
    pub description: String,        // Proposal description (max 500 chars)
    pub yes_votes: u128,           // Total yes votes
    pub no_votes: u128,            // Total no votes
    pub abstain_votes: u128,       // Total abstain votes
    pub start_time: u64,           // Voting start timestamp
    pub end_time: u64,             // Voting end timestamp
    pub status: ProposalStatus,    // Current status
    pub executed: bool,            // Whether proposal was executed
}
```

### ProposalStatus

```rust
pub enum ProposalStatus {
    Pending,   // Created but voting not started
    Active,    // Voting period is active
    Passed,    // Proposal passed all requirements
    Rejected,  // Proposal failed to meet requirements
    Executed,  // Proposal executed successfully
    Cancelled, // Proposal cancelled by proposer/admin
}
```

### VoteType

```rust
pub enum VoteType {
    Yes,      // Vote in favor
    No,       // Vote against
    Abstain,  // Abstain from voting (counts toward quorum)
}
```

---

## Building

Build the contract to WASM:

```bash
cargo build --target wasm32-unknown-unknown --release
```

The compiled `.wasm` file will be output to:
```
target/wasm32-unknown-unknown/release/voting_contract.wasm
```

Optimize the WASM (optional but recommended):

```bash
stellar contract optimize --wasm target/wasm32-unknown-unknown/release/voting_contract.wasm
```

---

## Testing

Run the comprehensive test suite:

```bash
cargo test
```

### Test Coverage

The test suite includes:
- ✅ Contract initialization and configuration validation
- ✅ Proposal creation and retrieval
- ✅ Voting mechanisms (yes/no/abstain)
- ✅ Vote delegation functionality
- ✅ Quorum and threshold calculations
- ✅ Proposal execution and finalization
- ✅ Edge cases (double voting, unauthorized actions, insufficient voting power)
- ✅ Proposal cancellation
- ✅ Status transitions

---

## Deployment

Deploy the contract using Stellar CLI:

```bash
# Deploy the contract
stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/voting_contract.wasm \
  --source <YOUR_SECRET_KEY> \
  --network testnet

# Initialize the governance contract
stellar contract invoke \
  --id <CONTRACT_ID> \
  --source <ADMIN_SECRET_KEY> \
  --network testnet \
  -- initialize \
  --admin <ADMIN_ADDRESS> \
  --voting_token <TOKEN_CONTRACT_ADDRESS> \
  --quorum_threshold 1000000 \
  --pass_threshold_percent 51 \
  --voting_period 604800
```

---

## Usage Examples

### Example 1: Simple DAO Governance

Create a basic DAO where token holders vote on proposals:

```bash
# 1. Initialize with 51% passing threshold, 10% quorum, 7-day voting
stellar contract invoke --id <CONTRACT_ID> --network testnet -- initialize \
  --admin <ADMIN_ADDR> \
  --voting_token <TOKEN_ADDR> \
  --quorum_threshold 100000 \
  --pass_threshold_percent 51 \
  --voting_period 604800

# 2. Create a proposal
stellar contract invoke --id <CONTRACT_ID> --network testnet -- create_proposal \
  --proposer <PROPOSER_ADDR> \
  --description "Increase community fund allocation by 10%"

# 3. Vote on the proposal (proposal_id = 0)
stellar contract invoke --id <CONTRACT_ID> --network testnet -- vote \
  --voter <VOTER_ADDR> \
  --proposal_id 0 \
  --vote_type '{"Yes":[]}'

# 4. After voting period, execute the proposal
stellar contract invoke --id <CONTRACT_ID> --network testnet -- execute_proposal \
  --caller <ANY_ADDR> \
  --proposal_id 0
```

### Example 2: High-Security Governance

For critical decisions requiring supermajority:

```bash
# Initialize with 67% threshold and 30% quorum
stellar contract invoke --id <CONTRACT_ID> --network testnet -- initialize \
  --admin <ADMIN_ADDR> \
  --voting_token <TOKEN_ADDR> \
  --quorum_threshold 300000 \
  --pass_threshold_percent 67 \
  --voting_period 1209600  # 14 days
```

### Example 3: Vote Delegation

Delegate voting power to a trusted representative:

```bash
# Delegate your voting power
stellar contract invoke --id <CONTRACT_ID> --network testnet -- delegate_vote \
  --delegator <YOUR_ADDR> \
  --delegate <REPRESENTATIVE_ADDR>

# Check delegation
stellar contract invoke --id <CONTRACT_ID> --network testnet -- get_delegate \
  --delegator <YOUR_ADDR>

# The delegate can now vote with your power
stellar contract invoke --id <CONTRACT_ID> --network testnet -- vote \
  --voter <REPRESENTATIVE_ADDR> \
  --proposal_id 0 \
  --vote_type '{"Yes":[]}'
```

### Example 4: Query Proposal Status

Check the current state of a proposal:

```bash
# Get proposal details
stellar contract invoke --id <CONTRACT_ID> --network testnet -- get_proposal \
  --proposal_id 0

# Get vote counts
stellar contract invoke --id <CONTRACT_ID> --network testnet -- get_vote_count \
  --proposal_id 0

# Check voting power
stellar contract invoke --id <CONTRACT_ID> --network testnet -- get_voting_power \
  --voter <ADDR>
```

---

## Governance Patterns

### Pattern 1: Simple Majority DAO

**Use Case:** Community treasury decisions, parameter updates  
**Configuration:**
- Quorum: 10-20% of total supply
- Threshold: 51% yes votes
- Voting Period: 3-7 days

**Example:**
```rust
quorum_threshold: 100_000      // 10% of 1M total supply
pass_threshold_percent: 51     // Simple majority
voting_period: 259_200         // 3 days
```

### Pattern 2: Supermajority Governance

**Use Case:** Protocol upgrades, critical changes  
**Configuration:**
- Quorum: 25-40% of total supply
- Threshold: 67-75% yes votes
- Voting Period: 7-14 days

**Example:**
```rust
quorum_threshold: 300_000      // 30% of 1M total supply
pass_threshold_percent: 67     // Supermajority
voting_period: 604_800         // 7 days
```

### Pattern 3: Emergency Fast-Track

**Use Case:** Time-sensitive security responses  
**Configuration:**
- Quorum: 5-10% of total supply
- Threshold: 75% yes votes
- Voting Period: 24-48 hours

**Example:**
```rust
quorum_threshold: 50_000       // 5% of 1M total supply
pass_threshold_percent: 75     // High threshold for fast decisions
voting_period: 86_400          // 1 day
```

### Pattern 4: Delegative Democracy

**Use Case:** Complex technical decisions  
**Configuration:**
- Enable delegation to expert voters
- Moderate quorum and threshold
- Longer voting period for research

**Example:**
```rust
quorum_threshold: 150_000      // 15% of 1M total supply
pass_threshold_percent: 60     // Moderate supermajority
voting_period: 604_800         // 7 days
// Encourage delegation to technical experts
```

---

## Security Considerations

### Vote Integrity

- ✅ Each address can only vote once per proposal
- ✅ Votes cannot be changed after submission
- ✅ Voting power calculated at vote time (token balance + delegated power)

### Access Control

- ✅ Only proposer or admin can cancel proposals
- ✅ Proposals can only be executed after voting period ends
- ✅ Execution validates quorum and threshold requirements

### Edge Cases Handled

- ✅ **Tied Votes:** Handled by threshold logic (50/50 requires >50% to pass)
- ✅ **Zero Votes:** Proposals with no votes are rejected (quorum not met)
- ✅ **Expired Proposals:** Can only be executed after voting period
- ✅ **Invalid Thresholds:** Initialization validates threshold ≤ 100%
- ✅ **No Voting Power:** Prevents voting without tokens

---

## Customization Ideas

### Extend for Your Use Case

1. **Add Proposal Types**
   - Different voting rules for different proposal categories
   - Example: Budget proposals vs. protocol changes

2. **Implement Execution Logic**
   - Currently marks proposals as executed
   - Add actual on-chain execution of approved actions

3. **Time-Lock Execution**
   - Add delay between approval and execution
   - Provides safety window for veto or review

4. **Vote Weighting**
   - Quadratic voting (√tokens = voting power)
   - Reputation-based multipliers
   - Time-locked token bonuses

5. **Advanced Delegation**
   - Category-specific delegation
   - Delegation with expiry
   - Partial delegation

---

## Integration with Stellar Suite

To register this template for automatic detection in the Stellar Suite sidebar, add the following entry to your workspace's `stellar-suite.templates.json`:

```json
{
  "version": "1",
  "templates": [
    {
      "id": "voting-governance",
      "displayName": "Voting/Governance Contract",
      "category": "voting",
      "description": "Decentralized governance with proposals, voting, and delegation",
      "keywords": ["governance", "voting", "dao", "proposal", "quorum", "delegation"],
      "dependencies": ["soroban-sdk"],
      "actions": [
        {
          "id": "create-proposal",
          "label": "Create Proposal"
        },
        {
          "id": "vote",
          "label": "Cast Vote"
        },
        {
          "id": "delegate",
          "label": "Delegate Vote"
        }
      ]
    }
  ]
}
```

---

## Common Issues & Troubleshooting

### "No voting power" Error

**Cause:** Voter has no tokens and no delegated voting power  
**Solution:** Ensure voters have token balance or receive delegated power

### "Already voted on this proposal" Error

**Cause:** Address attempting to vote twice on same proposal  
**Solution:** Each address can only vote once; use a different address or delegate

### Proposal Not Passing

**Cause:** Either quorum not met or threshold not reached  
**Solution:** 
- Check vote counts with `get_vote_count`
- Verify total votes ≥ quorum_threshold
- Verify yes_votes/total_votes ≥ pass_threshold_percent

### "Voting has ended" Error

**Cause:** Attempting to vote after voting period expired  
**Solution:** Votes must be cast within the voting period

---

## Resources

- [Soroban Documentation](https://soroban.stellar.org/docs)
- [Stellar CLI Guide](https://developers.stellar.org/docs/tools/developer-tools)
- [Governance Best Practices](https://soroban.stellar.org/docs/learn/best-practices)
- [Token Interface Standard](https://soroban.stellar.org/docs/reference/interfaces/token-interface)

---

## License

Apache-2.0

---

## Contributing

This template is part of the Stellar Suite project. Contributions and improvements are welcome! Follow Stellar/Soroban best practices and include tests for new features.
