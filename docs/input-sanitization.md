# Input Sanitization

Stellar Suite sanitizes all user-supplied inputs before they are passed to CLI
commands, stored in workspace state, or displayed in the UI.  This prevents
malicious input, data corruption, and injection attacks.

---

## Service

**`src/services/inputSanitizationService.ts`** — `InputSanitizationService`

### Construction

```ts
import { InputSanitizationService } from './services/inputSanitizationService';

// Uses the built-in console logger
const sanitizer = new InputSanitizationService();

// Or supply a custom logger (e.g., one that writes to an OutputChannel)
const sanitizer = new InputSanitizationService(myLogger);
```

### Return type — `SanitizationResult<T>`

Every method returns a `SanitizationResult`:

| Field | Type | Description |
|---|---|---|
| `valid` | `boolean` | `true` if the value is safe to use |
| `sanitizedValue` | `T` | The cleaned value |
| `errors` | `string[]` | Hard errors that prevent use |
| `warnings` | `string[]` | Non-blocking warnings |
| `logs` | `SanitizationLogEntry[]` | Detailed log of every action taken |
| `wasModified` | `boolean` | `true` if the original value was changed |

---

## Methods

### `sanitizeString(value, options?)`

General-purpose string sanitization.  Applied steps (in order):

1. Null / undefined → empty string
2. Trim leading/trailing whitespace *(default: on)*
3. Strip null bytes `\0` *(default: on)*
4. Strip dangerous control characters *(default: on)*
5. Normalize Unicode to NFC form *(default: on)*
6. Enforce `minLength` / `maxLength` constraints
7. Apply custom rules

**Options** (`SanitizeStringOptions`):

| Option | Default | Description |
|---|---|---|
| `field` | `'input'` | Field name used in log messages |
| `maxLength` | `4096` | Maximum allowed length |
| `minLength` | `0` | Minimum required length |
| `trim` | `true` | Trim whitespace |
| `stripNullBytes` | `true` | Remove `\0` characters |
| `stripControlChars` | `true` | Remove ASCII control characters |
| `normalizeUnicode` | `true` | Normalize to NFC |
| `allowNewlines` | `false` | Preserve `\n` characters |
| `customRules` | `[]` | Additional `SanitizationRule` objects |

---

### `sanitizeContractId(value, options?)`

Validates a Stellar contract ID (strkey format).

- Trims and uppercases the input
- Rejects values that do not match `/^C[A-Z0-9]{55}$/`

```ts
const result = sanitizer.sanitizeContractId(rawInput, { field: 'contractId' });
if (!result.valid) {
    vscode.window.showErrorMessage(result.errors[0]);
    return;
}
const contractId = result.sanitizedValue; // safe to use
```

---

### `sanitizeNetworkName(value, options?)`

Validates a Stellar network name.

- Trims and lowercases the input
- Rejects values not in the allowed list

Default allowed networks: `testnet`, `mainnet`, `futurenet`, `local`, `standalone`

```ts
const result = sanitizer.sanitizeNetworkName(rawNetwork, {
    allowedNetworks: ['testnet', 'mainnet'],
});
```

---

### `sanitizePath(value, options?)`

Validates a file system path.

- Rejects path traversal sequences (`..`) by default
- Warns on absolute paths when `allowAbsolute: false`

```ts
const result = sanitizer.sanitizePath(rawPath, { allowAbsolute: false });
```

---

### `sanitizeJson(value, options?)`

Validates and canonicalizes a JSON string.

- Parses the JSON (rejects invalid JSON)
- Enforces `maxDepth` (default: 10) and `maxKeys` (default: 100)
- Re-serializes to canonical form (removes extra whitespace)

```ts
const result = sanitizer.sanitizeJson(rawArgs, { maxDepth: 5 });
if (result.valid) {
    const args = JSON.parse(result.sanitizedValue);
}
```

---

### `sanitizeFunctionName(value, options?)`

Validates a Soroban contract function name.

- Must match `/^[a-zA-Z_][a-zA-Z0-9_]*$/`

---

### `sanitizeEnvVarName(value, options?)`

Validates an environment variable name.

- Normalizes to uppercase
- Must match `/^[A-Z_][A-Z0-9_]*$/`

---

### `sanitizeEnvVarValue(value, options?)`

Sanitizes an environment variable value.

- Strips null bytes
- Warns (non-blocking) if the value contains shell metacharacters

---

### `sanitizeFormFields(fields, perFieldOptions?)`

Batch-sanitizes a record of form fields.

```ts
const results = sanitizer.sanitizeFormFields(
    { contractId: rawId, network: rawNetwork },
    { contractId: { maxLength: 56 } },
);

if (!InputSanitizationService.allValid(results)) {
    const errors = InputSanitizationService.collectErrors(results);
    vscode.window.showErrorMessage(errors.join('\n'));
    return;
}
```

---

## Custom Sanitization Rules

Implement the `SanitizationRule` interface to add project-specific rules:

```ts
import { SanitizationRule } from './services/inputSanitizationService';

const noSqlInjectionRule: SanitizationRule = {
    id: 'no-sql-injection',
    description: 'Reject SQL injection patterns',
    apply(value: string, field: string): string {
        if (/('|--|;|\/\*|\*\/)/.test(value)) {
            throw new Error('Input contains SQL injection patterns');
        }
        return value;
    },
};

const result = sanitizer.sanitizeString(rawInput, {
    customRules: [noSqlInjectionRule],
});
```

---

## Integration Points

The sanitization service is integrated into the following commands:

| Command | Fields sanitized |
|---|---|
| `simulateTransaction` | Contract ID, function name, JSON arguments |
| `registerEnvVariableCommands` | Env var name, env var value |

---

## Logging

Every sanitization action is logged.  By default, logs go to the console.
Supply a custom `SanitizationLogger` to redirect logs to a VS Code
`OutputChannel`:

```ts
import { SanitizationLogger } from './services/inputSanitizationService';

class OutputChannelLogger implements SanitizationLogger {
    constructor(private readonly channel: vscode.OutputChannel) {}
    info(msg: string) { this.channel.appendLine(`[INFO] ${msg}`); }
    warn(msg: string) { this.channel.appendLine(`[WARN] ${msg}`); }
    error(msg: string) { this.channel.appendLine(`[ERROR] ${msg}`); }
}

const sanitizer = new InputSanitizationService(
    new OutputChannelLogger(outputChannel),
);
```

---

## Tests

Unit tests are located at `src/test/inputSanitizationService.test.ts` and
cover all public methods with both valid and invalid inputs.
