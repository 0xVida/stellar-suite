import * as vscode from 'vscode';

interface SnippetDefinition {
    label: string;
    detail: string;
    documentation: string;
    insertText: string;
    sortText?: string;
}

const SOROBAN_SNIPPETS: SnippetDefinition[] = [
    // ── Contract structure ─────────────────────────────────────────────────
    {
        label: '#[contract]',
        detail: 'Soroban contract struct',
        documentation:
            'Marks a unit struct as a Soroban contract entry point. Pair with #[contractimpl] to expose public methods.',
        insertText: '#[contract]\npub struct ${1:MyContract};',
        sortText: '00_contract',
    },
    {
        label: '#[contractimpl]',
        detail: 'Soroban contract implementation block',
        documentation:
            'Exposes the `impl` block methods as callable contract functions. Every public `fn` that takes `Env` as the first argument becomes part of the contract ABI.',
        insertText:
            '#[contractimpl]\nimpl ${1:MyContract} {\n    pub fn ${2:method}(env: Env${3:, arg: Type}) -> ${4:()} {\n        ${0}\n    }\n}',
        sortText: '01_contractimpl',
    },
    {
        label: '#[contracttype]',
        detail: 'Soroban host-compatible type',
        documentation:
            'Makes a struct or enum serialisable across the host boundary so it can be stored in ledger entries or passed as function arguments.',
        insertText:
            '#[contracttype]\n#[derive(Clone)]\npub ${1|struct,enum|} ${2:DataKey} {\n    ${0}\n}',
        sortText: '02_contracttype',
    },
    {
        label: '#[contracterror]',
        detail: 'Soroban typed error enum',
        documentation:
            'Generates a u32-backed error enum that clients can decode. Variants map to structured error codes in the transaction result.',
        insertText:
            '#[contracterror]\n#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]\n#[repr(u32)]\npub enum ${1:Error} {\n    ${2:NotInitialized} = 1,\n    ${3:Unauthorized}   = 2,\n    ${4:InvalidAmount}  = 3,\n    ${0}\n}',
        sortText: '03_contracterror',
    },
    {
        label: 'contractmeta!',
        detail: 'Embed metadata into WASM',
        documentation:
            'Stores a key/value pair in the compiled WASM custom section. Commonly used for contract description, version, and repository URL.',
        insertText:
            'soroban_sdk::contractmeta!(\n    key = "${1:Description}",\n    val = "${2:Short description}"\n);',
        sortText: '04_contractmeta',
    },

    // ── Env helpers ────────────────────────────────────────────────────────
    {
        label: 'Env::default()',
        detail: 'Test environment (testutils)',
        documentation:
            'Creates an in-process Soroban test environment. Only available with the `testutils` feature. Call `mock_all_auths()` to bypass auth checks.',
        insertText: 'let env = Env::default();\nenv.mock_all_auths();',
        sortText: '10_env_default',
    },
    {
        label: 'env.register()',
        detail: 'Register contract in test env',
        documentation:
            'Registers a contract struct under test and returns a `ContractId`. Pair with `ContractClient::new(&env, &contract_id)` to invoke methods.',
        insertText:
            'let contract_id = env.register(${1:MyContract}, ());\nlet ${2:client} = ${1:MyContract}Client::new(&env, &contract_id);',
        sortText: '11_env_register',
    },
    {
        label: 'env.ledger().timestamp()',
        detail: 'Current ledger timestamp',
        documentation:
            'Returns the deterministic ledger close time in unix seconds. Use this instead of `std::time` inside contracts.',
        insertText: 'let now: u64 = env.ledger().timestamp();',
        sortText: '12_ledger_timestamp',
    },
    {
        label: 'env.ledger().sequence()',
        detail: 'Current ledger sequence',
        documentation:
            'Returns the current ledger sequence number. Useful as a commit ledger, deadline, or random-seed input.',
        insertText: 'let seq: u32 = env.ledger().sequence();',
        sortText: '13_ledger_sequence',
    },
    {
        label: 'env.events().publish()',
        detail: 'Publish a contract event',
        documentation:
            'Emits an event with one or more topic symbols and a data payload. Indexers and clients use topics to filter events.',
        insertText:
            'env.events().publish((symbol_short!("${1:topic}"),), ${2:payload});',
        sortText: '14_events_publish',
    },

    // ── Storage ────────────────────────────────────────────────────────────
    {
        label: 'env.storage().instance().set()',
        detail: 'Write to instance storage',
        documentation:
            'Writes a value to instance storage and should be followed by `extend_ttl`. Instance storage shares a single TTL for the whole contract.',
        insertText:
            'env.storage().instance().set(&${1:DataKey::Admin}, &${2:value});\nenv.storage().instance().extend_ttl(${3:50}, ${4:100});',
        sortText: '20_storage_instance_set',
    },
    {
        label: 'env.storage().instance().get()',
        detail: 'Read from instance storage',
        documentation:
            'Reads a value from instance storage. Returns `None` if the key does not exist — use `unwrap_or_default()` for a safe default.',
        insertText:
            'let ${1:value}: ${2:Type} = env.storage().instance().get(&${3:DataKey::Admin}).unwrap_or_default();',
        sortText: '21_storage_instance_get',
    },
    {
        label: 'env.storage().persistent().set()',
        detail: 'Write to persistent storage',
        documentation:
            'Writes to persistent storage. Each key has its own TTL — always extend it right after writing to prevent premature archival.',
        insertText:
            'env.storage().persistent().set(&${1:key}, &${2:value});\nenv.storage().persistent().extend_ttl(&${1:key}, ${3:50}, ${4:100});',
        sortText: '22_storage_persistent_set',
    },
    {
        label: 'env.storage().persistent().get()',
        detail: 'Read from persistent storage',
        documentation:
            'Reads a persistent ledger entry. Returns `None` on first access — prefer `unwrap_or_default()` over `unwrap()` for safer reads.',
        insertText:
            'let ${1:value}: ${2:Type} = env.storage().persistent().get(&${3:key}).unwrap_or_default();',
        sortText: '23_storage_persistent_get',
    },
    {
        label: 'env.storage().temporary().set()',
        detail: 'Write to temporary storage',
        documentation:
            'Writes to temporary storage (cheaper than persistent). Entries are permanently lost once expired — use for nonces, rate limits, or short-lived state.',
        insertText:
            'env.storage().temporary().set(&${1:key}, &${2:value});\nenv.storage().temporary().extend_ttl(&${1:key}, ${3:50}, ${4:100});',
        sortText: '24_storage_temporary_set',
    },
    {
        label: 'extend_ttl()',
        detail: 'Extend storage entry TTL',
        documentation:
            'Extends the TTL of a ledger entry. The first arg is the threshold (only bumps if current TTL < threshold); the second is the new TTL.',
        insertText:
            'env.storage().${1|persistent,temporary,instance|}().extend_ttl(&${2:key}, ${3:50}, ${4:100});',
        sortText: '25_extend_ttl',
    },

    // ── Auth ───────────────────────────────────────────────────────────────
    {
        label: 'require_auth()',
        detail: 'Assert address authorised invocation',
        documentation:
            'Panics unless the address has signed or approved the current invocation. Always call this before mutating state on behalf of a user.',
        insertText: '${1:caller}.require_auth();',
        sortText: '30_require_auth',
    },
    {
        label: 'require_auth_for_args()',
        detail: 'Assert auth for specific args',
        documentation:
            'Narrower than `require_auth()` — checks the address authorised a specific argument tuple, preventing blanket approvals.',
        insertText:
            '${1:caller}.require_auth_for_args((${2:arg1}, ${3:arg2}).into_val(&env));',
        sortText: '31_require_auth_for_args',
    },
    {
        label: 'mock_all_auths()',
        detail: 'Bypass all auth checks (tests only)',
        documentation:
            'Mocks every `require_auth` call to succeed. Use in tests where auth logic is not under test. Requires the `testutils` feature.',
        insertText: 'env.mock_all_auths();',
        sortText: '32_mock_all_auths',
    },
    {
        label: 'mock_auths()',
        detail: 'Mock specific address + args (tests only)',
        documentation:
            'Asserts that a specific address authorised a specific contract call with specific arguments. More precise than `mock_all_auths`.',
        insertText:
            'use soroban_sdk::testutils::{Address as _, MockAuth, MockAuthInvoke};\nuse soroban_sdk::IntoVal;\n\nclient\n    .mock_auths(&[MockAuth {\n        address: &${1:signer},\n        invoke: &MockAuthInvoke {\n            contract: &contract_id,\n            fn_name: "${2:method}",\n            args: (${3:arg}).into_val(&env),\n            sub_invokes: &[],\n        },\n    }])\n    .${2:method}(${3:arg});',
        sortText: '33_mock_auths',
    },

    // ── Token ──────────────────────────────────────────────────────────────
    {
        label: 'token::Client::new()',
        detail: 'Construct SEP-41 token client',
        documentation:
            'Creates a token client against a SAC or SEP-41 contract address. Use this to transfer, burn, or query balances across contracts.',
        insertText:
            'let ${1:token} = soroban_sdk::token::Client::new(&env, &${2:token_address});',
        sortText: '40_token_client',
    },
    {
        label: 'token.transfer()',
        detail: 'Transfer tokens between addresses',
        documentation:
            'Transfers `amount` from `from` to `to`. The `from` address must have called `require_auth` somewhere up the call stack.',
        insertText:
            'soroban_sdk::token::Client::new(&env, &${1:token_address})\n    .transfer(&${2:from}, &${3:to}, &${4:amount});',
        sortText: '41_token_transfer',
    },
    {
        label: 'token.balance()',
        detail: 'Query token balance',
        documentation:
            'Returns the token balance for `owner`. Returns 0 for unknown addresses — no panic.',
        insertText:
            'let balance: i128 = soroban_sdk::token::Client::new(&env, &${1:token_address}).balance(&${2:owner});',
        sortText: '42_token_balance',
    },

    // ── Symbols ────────────────────────────────────────────────────────────
    {
        label: 'symbol_short!()',
        detail: 'Compile-time short Symbol (≤9 chars)',
        documentation:
            'Creates a Symbol at compile time for names up to 9 characters. Cheaper than `Symbol::new` because it is resolved at compile time with no runtime allocation.',
        insertText: 'symbol_short!("${1:KEY}")',
        sortText: '50_symbol_short',
    },
    {
        label: 'Symbol::new()',
        detail: 'Runtime Symbol (>9 chars)',
        documentation:
            'Creates a Symbol at runtime. Use for names longer than 9 characters. Prefer `symbol_short!` when the name fits.',
        insertText: 'Symbol::new(&env, "${1:long_name}")',
        sortText: '51_symbol_new',
    },

    // ── Error helpers ──────────────────────────────────────────────────────
    {
        label: 'panic_with_error!()',
        detail: 'Panic with typed contract error',
        documentation:
            'Aborts execution with a structured error that clients can decode. Preferred over a bare `panic!` because it produces a typed status code.',
        insertText: 'panic_with_error!(&env, ${1:Error}::${2:Variant});',
        sortText: '60_panic_with_error',
    },
    {
        label: 'log!()',
        detail: 'Diagnostic log (dev only)',
        documentation:
            'Emits a diagnostic message to host output. Stripped from optimised release builds — safe to leave in code.',
        insertText: 'log!(&env, "${1:message}", ${2:value});',
        sortText: '61_log',
    },

    // ── Common patterns ────────────────────────────────────────────────────
    {
        label: 'initialize() pattern',
        detail: 'One-shot initializer',
        documentation:
            'Standard initializer that refuses to run twice. Stores an admin address and extends the instance TTL.',
        insertText:
            'pub fn initialize(env: Env, ${1:admin}: Address) -> Result<(), ${2:Error}> {\n    if env.storage().instance().has(&DataKey::Admin) {\n        return Err(${2:Error}::AlreadyInitialized);\n    }\n    env.storage().instance().set(&DataKey::Admin, &${1:admin});\n    env.storage().instance().extend_ttl(${3:50}, ${4:100});\n    Ok(())\n}',
        sortText: '70_initialize',
    },
    {
        label: 'DataKey enum',
        detail: 'Standard storage key enum',
        documentation:
            'Convention DataKey enum covering common contract storage needs: admin, paused flag, per-address balance, and allowance map.',
        insertText:
            '#[contracttype]\n#[derive(Clone)]\npub enum DataKey {\n    Admin,\n    Paused,\n    Balance(Address),\n    Allowance(Address, Address),\n    ${0}\n}',
        sortText: '71_datakey',
    },
    {
        label: 'upgrade() WASM',
        detail: 'Admin-gated WASM upgrade',
        documentation:
            'Standard upgrade function that replaces the contract WASM. Always requires admin auth — without it, anyone could swap your bytecode.',
        insertText:
            'pub fn upgrade(env: Env, new_wasm_hash: BytesN<32>) {\n    let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();\n    admin.require_auth();\n    env.deployer().update_current_contract_wasm(new_wasm_hash);\n}',
        sortText: '72_upgrade',
    },
];

export class SorobanCompletionProvider implements vscode.CompletionItemProvider {
    provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
    ): vscode.CompletionItem[] {
        const linePrefix = document
            .lineAt(position)
            .text.substring(0, position.character);

        return SOROBAN_SNIPPETS
            .filter((s) => this._matches(s.label, linePrefix))
            .map((s) => this._toCompletionItem(s));
    }

    private _matches(label: string, linePrefix: string): boolean {
        // Always show all items when triggered manually (Ctrl+Space).
        // When typing, filter by prefix match against the last word.
        const lastWord = linePrefix.match(/[\w#!:]+$/)?.[0] ?? '';
        if (!lastWord) return true;
        return label.toLowerCase().startsWith(lastWord.toLowerCase()) ||
               label.replace(/[#\[\]!:]/g, '').toLowerCase().startsWith(lastWord.toLowerCase());
    }

    private _toCompletionItem(def: SnippetDefinition): vscode.CompletionItem {
        const item = new vscode.CompletionItem(
            def.label,
            vscode.CompletionItemKind.Snippet,
        );

        item.detail = def.detail;
        item.documentation = new vscode.MarkdownString(
            `**${def.label}**\n\n${def.documentation}`,
        );
        item.insertText = new vscode.SnippetString(def.insertText);
        item.sortText = def.sortText;
        // Show this completion even when the default word-based provider would not
        item.preselect = false;
        item.filterText = def.label;

        return item;
    }
}

/**
 * Register the SorobanCompletionProvider for Rust files.
 * Call this from the extension's `activate` function.
 */
export function registerSorobanCompletionProvider(
    context: vscode.ExtensionContext,
): vscode.Disposable {
    const provider = new SorobanCompletionProvider();

    const disposable = vscode.languages.registerCompletionItemProvider(
        { language: 'rust', scheme: 'file' },
        provider,
        // Trigger characters: '#' for attributes, '.' for method chains, '!' for macros
        '#', '.', '!', ':',
    );

    context.subscriptions.push(disposable);
    return disposable;
}
