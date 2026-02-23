import * as assert from 'assert';
import {
    validateAddress,
    validateFunctionName,
    validateRequired,
    validateSorobanType,
} from '../../utils/validators/typeValidators';

describe('typeValidators', () => {
    describe('validateAddress', () => {
        it('accepts valid contract ID', () => {
            const valid = 'C' + 'A'.repeat(55);
            const result = validateAddress(valid);
            assert.strictEqual(result.valid, true);
            assert.strictEqual(result.errors.length, 0);
        });

        it('accepts contract ID with base32 chars (A-Z, 2-7)', () => {
            const valid = 'C2' + 'A'.repeat(54);
            const result = validateAddress(valid);
            assert.strictEqual(result.valid, true);
        });

        it('rejects empty string', () => {
            const result = validateAddress('');
            assert.strictEqual(result.valid, false);
            assert.ok(result.errors.some((e) => e.code === 'MISSING_VALUE'));
        });

        it('rejects null/undefined', () => {
            assert.strictEqual(validateAddress(null as any).valid, false);
            assert.strictEqual(validateAddress(undefined as any).valid, false);
        });

        it('rejects invalid format (wrong length)', () => {
            const result = validateAddress('C123');
            assert.strictEqual(result.valid, false);
            assert.ok(result.errors.some((e) => e.code === 'INVALID_ADDRESS_FORMAT' || e.code === 'MISSING_VALUE'));
        });

        it('rejects invalid format (does not start with C)', () => {
            const result = validateAddress('GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
            assert.strictEqual(result.valid, false);
        });
    });

    describe('validateFunctionName', () => {
        it('accepts valid function name', () => {
            assert.strictEqual(validateFunctionName('hello').valid, true);
            assert.strictEqual(validateFunctionName('_private').valid, true);
            assert.strictEqual(validateFunctionName('fn42').valid, true);
        });

        it('rejects empty string', () => {
            const result = validateFunctionName('');
            assert.strictEqual(result.valid, false);
            assert.ok(result.errors.some((e) => e.code === 'MISSING_VALUE'));
        });

        it('rejects names starting with number', () => {
            const result = validateFunctionName('42hello');
            assert.strictEqual(result.valid, false);
        });

        it('rejects names with invalid chars', () => {
            const result = validateFunctionName('hello-world');
            assert.strictEqual(result.valid, false);
        });
    });

    describe('validateRequired', () => {
        it('accepts non-empty string', () => {
            assert.strictEqual(validateRequired('x', 'field').valid, true);
        });

        it('rejects empty string', () => {
            const result = validateRequired('', 'myField');
            assert.strictEqual(result.valid, false);
            assert.ok(result.errors[0].message.includes('myField'));
        });

        it('rejects whitespace-only', () => {
            const result = validateRequired('   ', 'x');
            assert.strictEqual(result.valid, false);
        });
    });

    describe('validateSorobanType', () => {
        it('accepts valid address', () => {
            const result = validateSorobanType(
                'C' + 'A'.repeat(55),
                'Address',
                'addr'
            );
            assert.strictEqual(result.valid, true);
        });

        it('accepts valid u32', () => {
            assert.strictEqual(validateSorobanType('0', 'u32', 'x').valid, true);
            assert.strictEqual(validateSorobanType('4294967295', 'u32', 'x').valid, true);
            assert.strictEqual(validateSorobanType('42', 'u32', 'x').valid, true);
        });

        it('rejects u32 out of range', () => {
            const result = validateSorobanType('4294967296', 'u32', 'x');
            assert.strictEqual(result.valid, false);
        });

        it('accepts valid bool', () => {
            assert.strictEqual(validateSorobanType('true', 'bool', 'x').valid, true);
            assert.strictEqual(validateSorobanType('false', 'bool', 'x').valid, true);
        });

        it('rejects invalid bool', () => {
            const result = validateSorobanType('yes', 'bool', 'x');
            assert.strictEqual(result.valid, false);
        });

        it('accepts empty for optional (no required check in this fn)', () => {
            const result = validateSorobanType('', 'string', 'x');
            assert.strictEqual(result.valid, true);
        });
    });
});
