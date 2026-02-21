import { ContractFunction, FunctionParameter } from '../../services/contractInspector';

export const VALID_CONTRACT_ID = 'CABCDEFGHIJKLMNOPQRSTUVWXY1234567890ABCDEFGHIJKLMNOPQRST';
export const VALID_ACCOUNT_ID = 'GABCDEFGHIJKLMNOPQRSTUVWXY1234567890ABCDEFGHIJKLMNOPQRST';

export const SIMPLE_HELP_OUTPUT = `Usage: stellar contract invoke [OPTIONS] -- <COMMAND>

Commands:
  hello          Say hello to someone
  get_count      Get the current counter value
  increment      Increment the counter by the given amount

Options:
  --id <CONTRACT_ID>      Contract ID
  --source <SOURCE>       Source account
`;

export const HELP_OUTPUT_WITH_SUBCOMMANDS = `Usage: stellar contract invoke [OPTIONS] -- <COMMAND>

Subcommands:
  transfer       Transfer tokens between accounts
  balance        Get token balance for an address
  approve        Approve spender for tokens
  mint           Mint new tokens
  burn           Burn tokens from an account

Global Options:
  --help         Print help information
`;

export const HELP_OUTPUT_USAGE_FORMAT = `Usage: deposit [OPTIONS]

Some contract description here.

Usage: withdraw [OPTIONS]

Another description.
`;

export const EMPTY_HELP_OUTPUT = '';

export const HELP_OUTPUT_NO_FUNCTIONS = `Usage: stellar contract invoke [OPTIONS]

Options:
  --id <CONTRACT_ID>      Contract ID
  --help                  Print help information
`;

export const FUNCTION_HELP_TRANSFER = `Transfer tokens between two accounts

Arguments:
  --from <Address>  The sender account address
  --to <Address>  The recipient account address
  --amount <i128>  The number of tokens to transfer
`;

export const FUNCTION_HELP_OPTIONAL_PARAMS = `Initialize the contract with configuration

Parameters:
  --admin <Address>  The admin account address
  --name <String>  Token name [optional]
  --symbol <String>  Token symbol (default: "XLM")
  --decimals <u32>  Number of decimal places [optional]
`;

export const FUNCTION_HELP_NO_PARAMS = `Get the current counter value
`;

export const FUNCTION_HELP_MIXED_REQUIRED = `Perform a swap operation

Arguments:
  --token_a <Address>  First token contract address
  --token_b <Address>  Second token contract address
  --amount_a <i128>  Amount of token A to swap
  --min_b <i128>  Minimum amount of token B to receive
  --deadline <u64>  Transaction deadline timestamp [optional]
  --recipient <Address>  Recipient address (default: sender)
`;

export function makeFunction(
    name: string,
    params: Array<{ name: string; type?: string; required?: boolean; description?: string }>
): ContractFunction {
    return {
        name,
        parameters: params.map(p => ({
            name: p.name,
            type: p.type,
            required: p.required !== false,
            description: p.description || ''
        }))
    };
}

export function makeTransferFunction(): ContractFunction {
    return makeFunction('transfer', [
        { name: 'from', type: 'Address', required: true },
        { name: 'to', type: 'Address', required: true },
        { name: 'amount', type: 'i128', required: true }
    ]);
}

export function makeMintFunction(): ContractFunction {
    return makeFunction('mint', [
        { name: 'to', type: 'Address', required: true },
        { name: 'amount', type: 'i128', required: true }
    ]);
}

export function makeBalanceFunction(): ContractFunction {
    return makeFunction('balance', [
        { name: 'id', type: 'Address', required: true }
    ]);
}

export function makeInitializeFunction(): ContractFunction {
    return makeFunction('initialize', [
        { name: 'admin', type: 'Address', required: true },
        { name: 'name', type: 'String', required: true },
        { name: 'symbol', type: 'String', required: true },
        { name: 'decimals', type: 'u32', required: true }
    ]);
}

export function makeNoParamFunction(): ContractFunction {
    return makeFunction('get_count', []);
}

export function makeComplexFunction(): ContractFunction {
    return makeFunction('swap', [
        { name: 'token_a', type: 'Address', required: true },
        { name: 'token_b', type: 'Address', required: true },
        { name: 'amount_a', type: 'i128', required: true },
        { name: 'min_b', type: 'i128', required: true },
        { name: 'deadline', type: 'u64', required: false },
        { name: 'recipient', type: 'Address', required: false }
    ]);
}

export function makeAllTypeParamsFunction(): ContractFunction {
    return makeFunction('test_types', [
        { name: 'flag', type: 'bool', required: true },
        { name: 'label', type: 'String', required: true },
        { name: 'count', type: 'u32', required: true },
        { name: 'signed_count', type: 'i64', required: true },
        { name: 'items', type: 'Vec<u32>', required: true },
        { name: 'metadata', type: 'Map<Address, u32>', required: true },
        { name: 'addr', type: 'Address', required: true },
        { name: 'sym', type: 'Symbol', required: false }
    ]);
}

export function makeTokenContractFunctions(): ContractFunction[] {
    return [
        makeInitializeFunction(),
        makeTransferFunction(),
        makeMintFunction(),
        makeBalanceFunction(),
        makeFunction('burn', [
            { name: 'from', type: 'Address', required: true },
            { name: 'amount', type: 'i128', required: true }
        ]),
        makeFunction('approve', [
            { name: 'from', type: 'Address', required: true },
            { name: 'spender', type: 'Address', required: true },
            { name: 'amount', type: 'i128', required: true },
            { name: 'expiration_ledger', type: 'u32', required: true }
        ])
    ];
}
