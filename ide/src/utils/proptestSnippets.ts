/**
 * proptestSnippets.ts
 *
 * A typed library of proptest! macro templates for Soroban smart contracts.
 *
 * Each snippet is self-contained valid Rust that can be inserted directly into
 * a test file. The `insertText` field uses VS Code / Monaco snippet syntax
 * (tab-stops $1, $2 … and placeholders \${1:name}) so the editor can guide the
 * developer through customisation after insertion.
 *
 * Categories
 * ──────────
 *  integers   – numeric ranges for token amounts, counters, timestamps, etc.
 *  addresses  – Soroban Address generation strategies
 *  state      – contract storage / state property tests
 *  composite  – multi-argument strategies combining the above
 *  harness    – full proptest module scaffolding
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SnippetCategory =
  | "integers"
  | "addresses"
  | "state"
  | "composite"
  | "harness";

export interface PropTestSnippet {
  /** Short identifier used as the Monaco completion label. */
  readonly id: string;
  /** Human-readable name shown in the Testing sidebar. */
  readonly label: string;
  /** One-line description of what the snippet tests. */
  readonly description: string;
  /** Category for grouping in the sidebar. */
  readonly category: SnippetCategory;
  /**
   * The Rust source code to insert.
   * Uses Monaco snippet syntax: $1, $2, \${1:placeholder}.
   * $0 marks the final cursor position.
   */
  readonly insertText: string;
  /**
   * Plain-text version of insertText (tab-stops stripped) used for
   * copy-to-clipboard and preview rendering.
   */
  readonly previewText: string;
  /**
   * Cargo.toml dev-dependency lines required by this snippet.
   * Shown as a hint in the sidebar so the developer knows what to add.
   */
  readonly requiredDeps: readonly string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Strip Monaco tab-stop markers ($1, \${1:foo}) from a snippet string to
 * produce a clean preview / clipboard string.
 */
export function stripTabStops(snippet: string): string {
  return snippet
    .replace(/\$\{\d+:([^}]*)\}/g, "$1") // \${1:placeholder} → placeholder
    .replace(/\$\d+/g, "");               // $1 → ""
}

// ---------------------------------------------------------------------------
// Snippet definitions
// ---------------------------------------------------------------------------

const PROPTEST_DEPS: readonly string[] = [
  'proptest = { version = "1", default-features = false, features = ["alloc"] }',
];

const PROPTEST_SOROBAN_DEPS: readonly string[] = [
  ...PROPTEST_DEPS,
  'soroban-sdk = { workspace = true, features = ["testutils"] }',
];

// ── Integers ────────────────────────────────────────────────────────────────

const integerSnippets: PropTestSnippet[] = [
  {
    id: "proptest_token_amount",
    label: "proptest: token amount (0..100_000_000)",
    description:
      "Property test that any token amount in the valid Soroban range is handled correctly.",
    category: "integers",
    insertText: `proptest! {
    #[test]
    fn prop_\${1:fn_name}_valid_amount(amount in 0i128..=100_000_000i128) {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register(\${2:MyContract}, ());
        let client = \${2:MyContract}Client::new(&env, &contract_id);

        // Property: the function must not panic for any valid amount
        let result = client.\${3:transfer}(&amount);
        prop_assert!(result >= 0i128, "result must be non-negative, got {}", result);
        \$0
    }
}`,
    get previewText() {
      return stripTabStops(this.insertText);
    },
    requiredDeps: PROPTEST_SOROBAN_DEPS,
  },
  {
    id: "proptest_counter_range",
    label: "proptest: counter / u32 range",
    description:
      "Property test that a counter-style function stays within u32 bounds.",
    category: "integers",
    insertText: `proptest! {
    #[test]
    fn prop_\${1:counter}_bounded(increments in 1u32..=1_000u32) {
        let env = Env::default();
        let contract_id = env.register(\${2:IncrementContract}, ());
        let client = \${2:IncrementContract}Client::new(&env, &contract_id);

        let mut last = 0u32;
        for _ in 0..increments {
            last = client.increment();
        }

        prop_assert_eq!(last, increments, "counter must equal number of increments");
        \$0
    }
}`,
    get previewText() {
      return stripTabStops(this.insertText);
    },
    requiredDeps: PROPTEST_SOROBAN_DEPS,
  },
  {
    id: "proptest_timestamp_range",
    label: "proptest: ledger timestamp range",
    description:
      "Property test that time-locked logic behaves correctly across a range of timestamps.",
    category: "integers",
    insertText: `proptest! {
    #[test]
    fn prop_\${1:fn_name}_timestamp(
        base_ts   in 0u64..=1_700_000_000u64,
        delta_sec in 1u64..=86_400u64,          // 1 s – 24 h
    ) {
        let env = Env::default();
        env.mock_all_auths();
        env.ledger().with_mut(|li| li.timestamp = base_ts);

        let contract_id = env.register(\${2:MyContract}, ());
        let client = \${2:MyContract}Client::new(&env, &contract_id);

        // Advance time and assert the time-locked function behaves correctly
        env.ledger().with_mut(|li| li.timestamp = base_ts + delta_sec);
        let result = client.\${3:check_expiry}();
        prop_assert!(result, "should succeed after delta_sec={}", delta_sec);
        \$0
    }
}`,
    get previewText() {
      return stripTabStops(this.insertText);
    },
    requiredDeps: PROPTEST_SOROBAN_DEPS,
  },
  {
    id: "proptest_fee_nonzero",
    label: "proptest: fee / basis-points (1..=10_000)",
    description:
      "Property test that fee calculations never overflow for any valid basis-point value.",
    category: "integers",
    insertText: `proptest! {
    #[test]
    fn prop_\${1:fee}_no_overflow(
        amount  in 1i128..=1_000_000_000i128,
        bps     in 1u32..=10_000u32,           // 0.01 % – 100 %
    ) {
        let env = Env::default();
        let contract_id = env.register(\${2:MyContract}, ());
        let client = \${2:MyContract}Client::new(&env, &contract_id);

        let fee = client.\${3:calc_fee}(&amount, &bps);

        // Fee must be ≤ amount and non-negative
        prop_assert!(fee >= 0i128,   "fee must be non-negative");
        prop_assert!(fee <= amount,  "fee must not exceed amount");
        \$0
    }
}`,
    get previewText() {
      return stripTabStops(this.insertText);
    },
    requiredDeps: PROPTEST_SOROBAN_DEPS,
  },
];

// ── Addresses ───────────────────────────────────────────────────────────────

const addressSnippets: PropTestSnippet[] = [
  {
    id: "proptest_address_auth",
    label: "proptest: address auth (any caller)",
    description:
      "Property test that auth-gated functions reject any caller that is not the admin.",
    category: "addresses",
    insertText: `proptest! {
    /// Any address that is NOT the admin must be rejected.
    #[test]
    fn prop_\${1:fn_name}_rejects_non_admin(seed in 0u64..=u64::MAX) {
        let env = Env::default();
        env.mock_all_auths();

        // Derive a deterministic-but-arbitrary address from the seed
        env.ledger().with_mut(|li| li.sequence_number = seed);
        let attacker = Address::generate(&env);
        let admin    = Address::generate(&env);

        let contract_id = env.register(\${2:MyContract}, ());
        let client = \${2:MyContract}Client::new(&env, &contract_id);
        client.\${3:initialize}(&admin);

        // Attempt the privileged call as attacker — must panic
        let result = std::panic::catch_unwind(|| {
            client.\${4:admin_fn}(&attacker);
        });
        prop_assert!(result.is_err(), "non-admin call must panic");
        \$0
    }
}`,
    get previewText() {
      return stripTabStops(this.insertText);
    },
    requiredDeps: PROPTEST_SOROBAN_DEPS,
  },
  {
    id: "proptest_address_uniqueness",
    label: "proptest: address uniqueness",
    description:
      "Property test that Address::generate always produces distinct addresses.",
    category: "addresses",
    insertText: `proptest! {
    #[test]
    fn prop_generated_addresses_are_unique(n in 2usize..=20usize) {
        let env = Env::default();
        let addrs: Vec<Address> = (0..n).map(|_| Address::generate(&env)).collect();

        // All addresses must be pairwise distinct
        for i in 0..addrs.len() {
            for j in (i + 1)..addrs.len() {
                prop_assert_ne!(
                    &addrs[i], &addrs[j],
                    "addresses at index {} and {} must differ", i, j
                );
            }
        }
        \$0
    }
}`,
    get previewText() {
      return stripTabStops(this.insertText);
    },
    requiredDeps: PROPTEST_SOROBAN_DEPS,
  },
  {
    id: "proptest_multi_party_transfer",
    label: "proptest: multi-party token transfer",
    description:
      "Property test that token balances are conserved across any sender/receiver pair.",
    category: "addresses",
    insertText: `proptest! {
    #[test]
    fn prop_\${1:transfer}_conserves_balance(amount in 1i128..=1_000_000i128) {
        let env = Env::default();
        env.mock_all_auths();

        let sender   = Address::generate(&env);
        let receiver = Address::generate(&env);

        // Register a Stellar asset contract for the test token
        let token_admin = Address::generate(&env);
        let token_id = env
            .register_stellar_asset_contract_v2(token_admin.clone())
            .address();
        let token = token::Client::new(&env, &token_id);
        token::StellarAssetClient::new(&env, &token_id).mint(&sender, &amount);

        let contract_id = env.register(\${2:MyContract}, ());
        let client = \${2:MyContract}Client::new(&env, &contract_id);

        let before_sender   = token.balance(&sender);
        let before_receiver = token.balance(&receiver);

        client.\${3:transfer}(&sender, &receiver, &amount);

        let after_sender   = token.balance(&sender);
        let after_receiver = token.balance(&receiver);

        // Conservation: total supply must not change
        prop_assert_eq!(
            before_sender + before_receiver,
            after_sender  + after_receiver,
            "total balance must be conserved"
        );
        \$0
    }
}`,
    get previewText() {
      return stripTabStops(this.insertText);
    },
    requiredDeps: PROPTEST_SOROBAN_DEPS,
  },
];

// ── State ────────────────────────────────────────────────────────────────────

const stateSnippets: PropTestSnippet[] = [
  {
    id: "proptest_storage_roundtrip",
    label: "proptest: storage read/write round-trip",
    description:
      "Property test that any value written to contract storage is read back unchanged.",
    category: "state",
    insertText: `proptest! {
    #[test]
    fn prop_\${1:key}_storage_roundtrip(value in \${2:0u32..=u32::MAX}) {
        let env = Env::default();
        let contract_id = env.register(\${3:MyContract}, ());
        let client = \${3:MyContract}Client::new(&env, &contract_id);

        client.\${4:set_value}(&value);
        let stored = client.\${5:get_value}();

        prop_assert_eq!(stored, value, "stored value must equal written value");
        \$0
    }
}`,
    get previewText() {
      return stripTabStops(this.insertText);
    },
    requiredDeps: PROPTEST_SOROBAN_DEPS,
  },
  {
    id: "proptest_idempotent_init",
    label: "proptest: idempotent initialisation",
    description:
      "Property test that calling initialize twice always panics (no double-init).",
    category: "state",
    insertText: `proptest! {
    #[test]
    fn prop_\${1:init}_is_not_idempotent(admin_seed in 0u64..=u64::MAX) {
        let env = Env::default();
        env.mock_all_auths();
        env.ledger().with_mut(|li| li.sequence_number = admin_seed);

        let admin = Address::generate(&env);
        let contract_id = env.register(\${2:MyContract}, ());
        let client = \${2:MyContract}Client::new(&env, &contract_id);

        // First init must succeed
        client.\${3:initialize}(&admin);

        // Second init must panic
        let result = std::panic::catch_unwind(|| {
            client.\${3:initialize}(&admin);
        });
        prop_assert!(result.is_err(), "double-init must panic");
        \$0
    }
}`,
    get previewText() {
      return stripTabStops(this.insertText);
    },
    requiredDeps: PROPTEST_SOROBAN_DEPS,
  },
  {
    id: "proptest_state_monotonic",
    label: "proptest: monotonically increasing state",
    description:
      "Property test that a counter or accumulator never decreases.",
    category: "state",
    insertText: `proptest! {
    #[test]
    fn prop_\${1:counter}_is_monotonic(steps in 1usize..=50usize) {
        let env = Env::default();
        let contract_id = env.register(\${2:MyContract}, ());
        let client = \${2:MyContract}Client::new(&env, &contract_id);

        let mut prev = client.\${3:get_count}();
        for _ in 0..steps {
            client.\${4:increment}();
            let next = client.\${3:get_count}();
            prop_assert!(
                next >= prev,
                "counter must be monotonically non-decreasing: prev={} next={}",
                prev, next
            );
            prev = next;
        }
        \$0
    }
}`,
    get previewText() {
      return stripTabStops(this.insertText);
    },
    requiredDeps: PROPTEST_SOROBAN_DEPS,
  },
  {
    id: "proptest_ttl_extension",
    label: "proptest: TTL extension stays within bounds",
    description:
      "Property test that extend_ttl never sets a TTL below the minimum threshold.",
    category: "state",
    insertText: `proptest! {
    #[test]
    fn prop_\${1:ttl}_extension_bounded(
        extend_to in \${2:100u32}..=\${3:10_000u32},
    ) {
        let env = Env::default();
        let contract_id = env.register(\${4:MyContract}, ());
        let client = \${4:MyContract}Client::new(&env, &contract_id);

        client.\${5:do_work}();

        // After any operation the TTL must be at least the minimum
        let ttl = env
            .storage()
            .instance()
            .get_ttl();
        prop_assert!(
            ttl >= \${2:100u32},
            "TTL must be at least the minimum threshold, got {}",
            ttl
        );
        \$0
    }
}`,
    get previewText() {
      return stripTabStops(this.insertText);
    },
    requiredDeps: PROPTEST_SOROBAN_DEPS,
  },
];

// ── Composite ────────────────────────────────────────────────────────────────

const compositeSnippets: PropTestSnippet[] = [
  {
    id: "proptest_bid_auction",
    label: "proptest: auction bid ordering invariant",
    description:
      "Property test that the highest bid always wins regardless of bid order.",
    category: "composite",
    insertText: `proptest! {
    #[test]
    fn prop_\${1:auction}_highest_bid_wins(
        bid_a in 1i128..=500_000i128,
        bid_b in 1i128..=500_000i128,
    ) {
        let env = Env::default();
        env.mock_all_auths();

        let bidder_a = Address::generate(&env);
        let bidder_b = Address::generate(&env);
        let seller   = Address::generate(&env);

        let token_id = env
            .register_stellar_asset_contract_v2(Address::generate(&env))
            .address();
        token::StellarAssetClient::new(&env, &token_id)
            .mint(&bidder_a, &bid_a);
        token::StellarAssetClient::new(&env, &token_id)
            .mint(&bidder_b, &bid_b);

        let contract_id = env.register(\${2:AuctionContract}, ());
        let client = \${2:AuctionContract}Client::new(&env, &contract_id);

        client.\${3:create_auction}(&seller, &token_id, &1i128, &token_id, &1i128, &3600u64);
        client.\${4:place_bid}(&bidder_a, &bid_a);
        client.\${4:place_bid}(&bidder_b, &bid_b);

        env.ledger().with_mut(|li| li.timestamp += 3601);
        client.\${5:settle}();

        let expected_winner = if bid_b >= bid_a { &bidder_b } else { &bidder_a };
        let winner = client.\${6:get_winner}();
        prop_assert_eq!(&winner, expected_winner, "highest bidder must win");
        \$0
    }
}`,
    get previewText() {
      return stripTabStops(this.insertText);
    },
    requiredDeps: PROPTEST_SOROBAN_DEPS,
  },
  {
    id: "proptest_escrow_conservation",
    label: "proptest: escrow amount conservation",
    description:
      "Property test that escrow release + refund paths both conserve the locked amount.",
    category: "composite",
    insertText: `proptest! {
    #[test]
    fn prop_\${1:escrow}_amount_conserved(amount in 1u128..=1_000_000u128) {
        let env = Env::default();
        env.mock_all_auths();

        let payer   = Address::generate(&env);
        let payee   = Address::generate(&env);
        let arbiter = Address::generate(&env);

        let contract_id = env.register(\${2:EscrowContract}, ());
        let client = \${2:EscrowContract}Client::new(&env, &contract_id);

        let now = env.ledger().timestamp();
        let id = client.\${3:deposit}(&payer, &payee, &arbiter, &amount, &now, &1u32);

        // Release path: payee should receive the full amount
        client.\${4:release}(&id, &payer);
        let escrow = client.\${5:get_escrow}(&id);
        prop_assert_eq!(escrow.amount, amount, "released amount must match deposited amount");
        \$0
    }
}`,
    get previewText() {
      return stripTabStops(this.insertText);
    },
    requiredDeps: PROPTEST_SOROBAN_DEPS,
  },
];

// ── Harness ──────────────────────────────────────────────────────────────────

const harnessSnippets: PropTestSnippet[] = [
  {
    id: "proptest_module_scaffold",
    label: "proptest: full test module scaffold",
    description:
      "Complete proptest module with imports, ProptestConfig, and a starter test.",
    category: "harness",
    insertText: `#[cfg(test)]
mod prop_tests {
    use super::*;
    use proptest::prelude::*;
    use soroban_sdk::{
        testutils::{Address as _, Ledger},
        token, Address, Env,
    };

    // Limit the number of test cases in CI to keep build times reasonable.
    // Override with PROPTEST_CASES=1000 cargo test for thorough local runs.
    proptest! {
        #![proptest_config(ProptestConfig {
            cases: \${1:64},
            max_shrink_iters: \${2:512},
            ..ProptestConfig::default()
        })]

        #[test]
        fn prop_\${3:example}(value in \${4:0u32..=1_000u32}) {
            let env = Env::default();
            env.mock_all_auths();

            let contract_id = env.register(\${5:MyContract}, ());
            let client = \${5:MyContract}Client::new(&env, &contract_id);

            // call contract and assert invariants
            let result = client.\${6:my_fn}(&value);
            prop_assert!(result >= 0, "result must be non-negative");
            \$0
        }
    }
}`,
    get previewText() {
      return stripTabStops(this.insertText);
    },
    requiredDeps: PROPTEST_SOROBAN_DEPS,
  },
  {
    id: "proptest_cargo_toml",
    label: "Cargo.toml: add proptest dev-dependency",
    description:
      "The Cargo.toml snippet required to enable proptest in a Soroban contract.",
    category: "harness",
    insertText: `[dev-dependencies]
soroban-sdk = { workspace = true, features = ["testutils"] }
proptest    = { version = "\${1:1}", default-features = false, features = ["alloc"] }
$0`,
    get previewText() {
      return stripTabStops(this.insertText);
    },
    requiredDeps: [],
  },
];

// ---------------------------------------------------------------------------
// Master export
// ---------------------------------------------------------------------------

export const PROPTEST_SNIPPETS: readonly PropTestSnippet[] = [
  ...integerSnippets,
  ...addressSnippets,
  ...stateSnippets,
  ...compositeSnippets,
  ...harnessSnippets,
];

/** Look up a single snippet by its id. */
export function getSnippetById(id: string): PropTestSnippet | undefined {
  return PROPTEST_SNIPPETS.find((s) => s.id === id);
}

/** Return all snippets belonging to a given category. */
export function getSnippetsByCategory(
  category: SnippetCategory,
): PropTestSnippet[] {
  return PROPTEST_SNIPPETS.filter((s) => s.category === category);
}

/**
 * Convert a PropTestSnippet into a Monaco CompletionItem-compatible object.
 * Import type Monaco from "monaco-editor" at the call site.
 */
export function toMonacoCompletion(
  snippet: PropTestSnippet,
  monaco: {
    languages: {
      CompletionItemKind: { Snippet: number };
      CompletionItemInsertTextRule: { InsertAsSnippet: number };
    };
  },
) {
  return {
    label: snippet.label,
    kind: monaco.languages.CompletionItemKind.Snippet,
    documentation: snippet.description,
    insertText: snippet.insertText,
    insertTextRules:
      monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    detail: `proptest · ${snippet.category}`,
  };
}

/**
 * Return all snippets as Monaco completion items, ready to be spread into
 * the `suggestions` array inside `provideCompletionItems`.
 */
export function getAllMonacoCompletions(monaco: Parameters<typeof toMonacoCompletion>[1]) {
  return PROPTEST_SNIPPETS.map((s) => toMonacoCompletion(s, monaco));
}
