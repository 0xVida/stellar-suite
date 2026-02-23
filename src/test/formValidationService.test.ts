import * as assert from 'assert';
import {
    FormValidationService,
    getFormValidationService,
} from '../services/formValidationService';
import type { FunctionParameter } from '../services/contractInspector';

describe('FormValidationService', () => {
    let service: FormValidationService;

    beforeEach(() => {
        service = new FormValidationService();
    });

    describe('validateContractId', () => {
        it('accepts valid contract ID', () => {
            const result = service.validateContractId('C' + 'A'.repeat(55));
            assert.strictEqual(result.valid, true);
        });

        it('rejects empty contract ID', () => {
            const result = service.validateContractId('');
            assert.strictEqual(result.valid, false);
        });
    });

    describe('validateFunctionName', () => {
        it('accepts valid function name', () => {
            assert.strictEqual(service.validateFunctionName('hello').valid, true);
        });

        it('rejects empty function name', () => {
            const result = service.validateFunctionName('');
            assert.strictEqual(result.valid, false);
        });
    });

    describe('validateParameter', () => {
        it('rejects empty required parameter', () => {
            const param: FunctionParameter = {
                name: 'foo',
                required: true,
            };
            const result = service.validateParameter('', param);
            assert.strictEqual(result.valid, false);
            assert.ok(result.errors[0].message.includes('required'));
        });

        it('accepts empty optional parameter', () => {
            const param: FunctionParameter = {
                name: 'foo',
                required: false,
            };
            const result = service.validateParameter('', param);
            assert.strictEqual(result.valid, true);
        });

        it('validates u32 parameter', () => {
            const param: FunctionParameter = {
                name: 'amount',
                type: 'u32',
                required: true,
            };
            assert.strictEqual(service.validateParameter('100', param).valid, true);
            const bad = service.validateParameter('not a number', param);
            assert.strictEqual(bad.valid, false);
        });

        it('validates address parameter', () => {
            const param: FunctionParameter = {
                name: 'addr',
                type: 'address',
                required: true,
            };
            const valid = service.validateParameter('C' + 'A'.repeat(55), param);
            assert.strictEqual(valid.valid, true);
        });
    });

    describe('validateParameterValues', () => {
        it('validates batch of parameters', () => {
            const params: FunctionParameter[] = [
                { name: 'a', required: true },
                { name: 'b', required: true },
            ];
            const result = service.validateParameterValues(params, {
                a: '',
                b: 'value',
            });
            assert.strictEqual(result.valid, false);
            assert.ok(result.errors.some((e) => e.field === 'a'));
        });

        it('accepts valid batch', () => {
            const params: FunctionParameter[] = [
                { name: 'a', required: true },
                { name: 'b', required: false },
            ];
            const result = service.validateParameterValues(params, {
                a: 'x',
                b: '',
            });
            assert.strictEqual(result.valid, true);
        });
    });

    describe('validateJsonArgs', () => {
        it('accepts valid JSON object', () => {
            assert.strictEqual(service.validateJsonArgs('{}').valid, true);
            assert.strictEqual(service.validateJsonArgs('{"x":1}').valid, true);
        });

        it('rejects invalid JSON', () => {
            const result = service.validateJsonArgs('{invalid}');
            assert.strictEqual(result.valid, false);
        });

        it('rejects JSON array', () => {
            const result = service.validateJsonArgs('[]');
            assert.strictEqual(result.valid, false);
        });
    });

    describe('toValidateInputMessage', () => {
        it('returns undefined for valid result', () => {
            const msg = service.toValidateInputMessage({
                valid: true,
                issues: [],
                errors: [],
                warnings: [],
            });
            assert.strictEqual(msg, undefined);
        });

        it('returns first error message for invalid result', () => {
            const msg = service.toValidateInputMessage({
                valid: false,
                issues: [{ severity: 'error', code: 'X', message: 'Error 1' }],
                errors: [{ severity: 'error', code: 'X', message: 'Error 1' }],
                warnings: [],
            });
            assert.strictEqual(msg, 'Error 1');
        });
    });

    describe('getFormValidationService', () => {
        it('returns singleton instance', () => {
            const a = getFormValidationService();
            const b = getFormValidationService();
            assert.strictEqual(a, b);
        });
    });
});
