import * as assert from 'assert';
import * as sinon from 'sinon';
import { RpcService } from '../services/rpcService';

describe('RpcService', () => {
    let service: RpcService;
    let fetchStub: sinon.SinonStub;

    beforeEach(() => {
        service = new RpcService('https://testnet.stellar.org');
        fetchStub = sinon.stub(global, 'fetch');
    });

    afterEach(() => {
        fetchStub.restore();
    });

    describe('simulateTransaction', () => {
        it('handles successful simulation', async () => {
            const mockResponse = {
                jsonrpc: '2.0',
                id: 1,
                result: {
                    returnValue: 'success_value',
                    resourceUsage: {
                        cpuInstructions: 100,
                        memoryBytes: 200
                    }
                }
            };

            fetchStub.resolves({
                ok: true,
                json: async () => mockResponse
            } as any);

            const result = await service.simulateTransaction('C123', 'hello', []);
            
            assert.strictEqual(result.success, true);
            assert.strictEqual(result.result, 'success_value');
            assert.deepStrictEqual(result.resourceUsage, {
                cpuInstructions: 100,
                memoryBytes: 200
            });
        });

        it('handles RPC error response', async () => {
            const mockResponse = {
                jsonrpc: '2.0',
                id: 1,
                error: {
                    code: -32000,
                    message: 'Internal error'
                }
            };

            fetchStub.resolves({
                ok: true,
                json: async () => mockResponse
            } as any);

            const result = await service.simulateTransaction('C123', 'hello', []);
            
            assert.strictEqual(result.success, false);
            assert.strictEqual(result.error, 'Internal error');
        });

        it('handles HTTP error status', async () => {
            fetchStub.resolves({
                ok: false,
                status: 500,
                statusText: 'Internal Server Error'
            } as any);

            const result = await service.simulateTransaction('C123', 'hello', []);
            
            assert.strictEqual(result.success, false);
            assert.ok(result.error?.includes('500'));
        });

        it('handles network timeout', async () => {
            const abortError = new Error('Request timed out');
            abortError.name = 'AbortError';
            fetchStub.rejects(abortError);

            const result = await service.simulateTransaction('C123', 'hello', []);
            
            assert.strictEqual(result.success, false);
            assert.ok(result.error?.includes('timed out'));
        });

        it('handles fetch network error', async () => {
            fetchStub.rejects(new TypeError('Failed to fetch'));

            const result = await service.simulateTransaction('C123', 'hello', []);
            
            assert.strictEqual(result.success, false);
            assert.ok(result.error?.includes('Network error'));
        });
    });

    describe('isAvailable', () => {
        it('returns true if health check succeeds', async () => {
            fetchStub.resolves({ ok: true } as any);
            const available = await service.isAvailable();
            assert.strictEqual(available, true);
        });

        it('returns false if health check fails', async () => {
            fetchStub.rejects(new Error('Down'));
            const available = await service.isAvailable();
            assert.strictEqual(available, false);
        });

        it('falls back to getHealth if /health fails', async () => {
            fetchStub.onFirstCall().rejects(new Error('No /health'));
            fetchStub.onSecondCall().resolves({ ok: true } as any);
            
            const available = await service.isAvailable();
            assert.strictEqual(available, true);
            assert.strictEqual(fetchStub.callCount, 2);
        });
    });
});
