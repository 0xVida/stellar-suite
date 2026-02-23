# Form Validation

Stellar Suite validates all form inputs for contract simulation and deployment before submission. This prevents invalid contract calls and provides immediate feedback via type checking, range validation, and format validation.

---

## Overview

Form validation is implemented through:

- **FormValidationService** – Central service used by commands
- **Type validators** – Address, function name, Soroban types (u32, i128, bool, etc.)
- **Range validators** – Numeric and string length bounds
- **Format validators** – JSON object structure

---

## FormValidationService

**Location:** `src/services/formValidationService.ts`

### Construction

```ts
import { getFormValidationService } from './services/formValidationService';

const formValidation = getFormValidationService();
```

### Methods

| Method | Description |
|--------|-------------|
| `validateContractId(value)` | Validates Stellar contract ID (C[A-Z2-7]{55}) |
| `validateFunctionName(value)` | Validates Soroban function name (identifier) |
| `validateParameter(value, param)` | Validates a single parameter against FunctionParameter metadata |
| `validateParameterValues(params, values)` | Batch validation for all parameters |
| `validateJsonArgs(value)` | Validates raw JSON arguments input (must be object) |
| `getContractIdValidator()` | Returns VS Code `validateInput` callback for contract ID |
| `getFunctionNameValidator()` | Returns VS Code `validateInput` callback for function name |
| `getParameterValidator(param)` | Returns VS Code `validateInput` callback for a parameter |
| `getJsonArgsValidator()` | Returns VS Code `validateInput` callback for JSON args |

### VS Code Integration

The service provides `validateInput`-compatible callbacks for `vscode.window.showInputBox`:

```ts
const contractId = await vscode.window.showInputBox({
  prompt: 'Enter contract ID',
  validateInput: formValidation.getContractIdValidator(),
});
```

---

## Validators

### Type Validators (`src/utils/validators/typeValidators.ts`)

| Function | Description |
|----------|-------------|
| `validateAddress(value)` | Stellar contract ID format `C[A-Z2-7]{55}` |
| `validateFunctionName(value)` | Identifier: `^[a-zA-Z_][a-zA-Z0-9_]*$` |
| `validateRequired(value, fieldName)` | Ensures non-empty value |
| `validateSorobanType(value, type, fieldName)` | Validates against Soroban type (Address, u32, i128, bool, etc.) |

### Range Validators (`src/utils/validators/rangeValidators.ts`)

| Function | Description |
|----------|-------------|
| `validateNumberRange(value, { min, max })` | Numeric bounds |
| `validateStringLength(value, { min, max })` | String length bounds |
| `getSorobanIntegerBounds(type)` | Returns min/max for u32, i32 |

### Format Validators (`src/utils/validators/formatValidators.ts`)

| Function | Description |
|----------|-------------|
| `validateJsonObject(value)` | Valid JSON that parses to object (not array) |
| `validateJsonValue(value)` | Valid JSON (any value) |

---

## Soroban Type Mapping

| CLI Type | Validation |
|----------|------------|
| Address / address | Stellar contract format `C[A-Z2-7]{55}` |
| u32, u64, u128 | Non-negative integer, in range |
| i32, i64, i128 | Signed integer, in range |
| String / string | Any non-empty string |
| Bool / bool | JSON `true` or `false` |
| Symbol / symbol | Non-empty string |
| Unknown | Accepts any non-empty value |

---

## Integration Points

| Command | Usage |
|---------|-------|
| `simulateTransaction` | Contract ID, function name, per-parameter values, raw JSON args |

---

## Error Display

- **Inline validation:** VS Code `showInputBox` `validateInput` returns error message; VS Code shows it beneath the field.
- **Field highlighting:** Invalid fields display the validation message; user cannot submit until valid.
- **Pre-submission check:** `validateJsonArgs` runs before parsing JSON args; errors shown via `showErrorMessage`.

---

## Tests

Unit tests are in:

- `src/test/formValidationService.test.ts`
- `src/test/validators/typeValidators.test.ts`
- `src/test/validators/rangeValidators.test.ts`
- `src/test/validators/formatValidators.test.ts`

Run with: `npm test`
