import * as assert from 'assert';
import {
    validateNumberRange,
    validateStringLength,
    getSorobanIntegerBounds,
} from '../../utils/validators/rangeValidators';

describe('rangeValidators', () => {
    describe('validateNumberRange', () => {
        it('accepts value within range', () => {
            assert.strictEqual(
                validateNumberRange(5, { min: 0, max: 10 }).valid,
                true
            );
        });

        it('rejects value below min', () => {
            const result = validateNumberRange(5, { min: 10, max: 20 });
            assert.strictEqual(result.valid, false);
            assert.ok(result.errors.some((e) => e.code === 'BELOW_MIN'));
        });

        it('rejects value above max', () => {
            const result = validateNumberRange(25, { min: 10, max: 20 });
            assert.strictEqual(result.valid, false);
            assert.ok(result.errors.some((e) => e.code === 'ABOVE_MAX'));
        });

        it('accepts value with only min', () => {
            assert.strictEqual(validateNumberRange(100, { min: 0 }).valid, true);
        });

        it('accepts value with only max', () => {
            assert.strictEqual(validateNumberRange(5, { max: 10 }).valid, true);
        });
    });

    describe('validateStringLength', () => {
        it('accepts string within length', () => {
            assert.strictEqual(
                validateStringLength('hello', { min: 1, max: 10 }).valid,
                true
            );
        });

        it('rejects string too short', () => {
            const result = validateStringLength('hi', { min: 5 });
            assert.strictEqual(result.valid, false);
            assert.ok(result.errors.some((e) => e.code === 'TOO_SHORT'));
        });

        it('rejects string too long', () => {
            const result = validateStringLength('hello world', { max: 5 });
            assert.strictEqual(result.valid, false);
            assert.ok(result.errors.some((e) => e.code === 'TOO_LONG'));
        });
    });

    describe('getSorobanIntegerBounds', () => {
        it('returns u32 bounds', () => {
            const bounds = getSorobanIntegerBounds('u32');
            assert.strictEqual(bounds.min, 0);
            assert.strictEqual(bounds.max, 2 ** 32 - 1);
        });

        it('returns i32 bounds', () => {
            const bounds = getSorobanIntegerBounds('i32');
            assert.strictEqual(bounds.min, -(2 ** 31));
            assert.strictEqual(bounds.max, 2 ** 31 - 1);
        });

        it('returns empty for u64/u128', () => {
            const bounds = getSorobanIntegerBounds('u64');
            assert.deepStrictEqual(bounds, {});
        });
    });
});
