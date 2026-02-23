import * as assert from 'assert';
import {
    validateJsonObject,
    validateJsonValue,
    validateAddress,
} from '../../utils/validators/formatValidators';

describe('formatValidators', () => {
    describe('validateJsonObject', () => {
        it('accepts valid JSON object', () => {
            assert.strictEqual(validateJsonObject('{}').valid, true);
            assert.strictEqual(validateJsonObject('{"a":1}').valid, true);
            assert.strictEqual(validateJsonObject('{"name":"world"}').valid, true);
        });

        it('rejects JSON array', () => {
            const result = validateJsonObject('[]');
            assert.strictEqual(result.valid, false);
            assert.ok(result.errors.some((e) => e.code === 'INVALID_JSON_OBJECT'));
        });

        it('rejects JSON primitive', () => {
            const result = validateJsonObject('42');
            assert.strictEqual(result.valid, false);
        });

        it('rejects invalid JSON', () => {
            const result = validateJsonObject('{invalid}');
            assert.strictEqual(result.valid, false);
            assert.ok(result.errors.some((e) => e.code === 'INVALID_JSON'));
        });

        it('rejects empty string', () => {
            const result = validateJsonObject('');
            assert.strictEqual(result.valid, false);
        });
    });

    describe('validateJsonValue', () => {
        it('accepts valid JSON', () => {
            assert.strictEqual(validateJsonValue('{}').valid, true);
            assert.strictEqual(validateJsonValue('[]').valid, true);
            assert.strictEqual(validateJsonValue('42').valid, true);
            assert.strictEqual(validateJsonValue('"hello"').valid, true);
        });

        it('accepts empty string as valid (optional)', () => {
            assert.strictEqual(validateJsonValue('').valid, true);
        });

        it('rejects invalid JSON', () => {
            const result = validateJsonValue('{broken');
            assert.strictEqual(result.valid, false);
        });
    });

    describe('validateAddress', () => {
        it('accepts valid contract ID', () => {
            const valid = 'C' + 'A'.repeat(55);
            assert.strictEqual(validateAddress(valid).valid, true);
        });

        it('rejects invalid format', () => {
            assert.strictEqual(validateAddress('invalid').valid, false);
        });
    });
});
