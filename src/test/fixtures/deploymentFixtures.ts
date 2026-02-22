export const DeploymentFixtures = {
    SUCCESSFUL_BUILD: `
Finished release [optimized] target(s) in 0.1s
Compiled contract wasm: target/wasm32-unknown-unknown/release/contract.wasm
`,
    SUCCESSFUL_DEPLOY: `
Contract ID: C1234567890123456789012345678901234567890123456789012345
Transaction hash: 1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef
`,
    MALFORMED_DEPLOY_OUTPUT: `
Some random text that doesn't contain a contract ID.
`,
    CLI_ERROR_MISSING_PASSPHRASE: `
error: Missing passphrase for key 'dev'
help: Provide a passphrase using --passphrase or set SOROBAN_PASSPHRASE
`,
    CLI_ERROR_NETWORK: `
error: network error: connection timed out
`,
    CLI_ERROR_ACCOUNT_NOT_FOUND: `
error: source account not found: GABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890
`,
};
