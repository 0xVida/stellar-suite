import * as assert from 'assert';
import * as sinon from 'sinon';
import { SorobanCliService, ExecFileFunction } from '../services/sorobanCliService';

describe('SorobanCliService', () => {
    let service: SorobanCliService;
    let execFileStub: sinon.SinonStub;

    beforeEach(() => {
        execFileStub = sinon.stub();
        service = new SorobanCliService('stellar', 'dev', execFileStub as unknown as ExecFileFunction);
    });

    describe('simulateTransaction', () => {
        it('handles successful simulation with JSON output', async () => {
            const mockOutput = JSON.stringify({
                result: 'success_value',
                resource_usage: {
                    cpu_instructions: 100,
                    memory_bytes: 200
                }
            });

            execFileStub.resolves({ stdout: mockOutput, stderr: '' });

            const result = await service.simulateTransaction('C123', 'hello', []);

            assert.strictEqual(result.success, true);
            assert.strictEqual(result.result, 'success_value');
            assert.deepStrictEqual(result.resourceUsage, {
                cpuInstructions: 100,
                memoryBytes: 200
            });
        });

        it('handles plain text output', async () => {
            execFileStub.resolves({ stdout: 'plain_result', stderr: '' });

            const result = await service.simulateTransaction('C123', 'hello', []);

            assert.strictEqual(result.success, true);
            assert.strictEqual(result.result, 'plain_result');
        });

        it('handles stderr failure', async () => {
            execFileStub.resolves({ stdout: '', stderr: 'error: something went wrong' });

            const result = await service.simulateTransaction('C123', 'hello', []);

            assert.strictEqual(result.success, false);
            assert.ok(result.error?.includes('something went wrong'));
        });

        it('handles ENOENT (CLI not found)', async () => {
            const error = new Error('spawn stellar ENOENT');
            (error as any).code = 'ENOENT';
            execFileStub.rejects(error);

            const result = await service.simulateTransaction('C123', 'hello', []);

            assert.strictEqual(result.success, false);
            assert.ok(result.error?.includes('Stellar CLI not found'));
        });

        it('handles object arguments correctly', async () => {
            execFileStub.resolves({ stdout: 'ok', stderr: '' });

            await service.simulateTransaction('C123', 'hello', [{ amount: 100, recipient: 'C456' }]);

            const lastCall = execFileStub.lastCall;
            const args = lastCall.args[1] as string[];

            assert.ok(args.includes('--amount'));
            assert.ok(args.includes('100'));
            assert.ok(args.includes('--recipient'));
            assert.ok(args.includes('C456'));
        });
    });

    describe('isAvailable', () => {
        it('returns true if --version succeeds', async () => {
            execFileStub.resolves({ stdout: 'stellar 21.0.0', stderr: '' });
            const available = await service.isAvailable();
            assert.strictEqual(available, true);
        });

        it('returns false if --version fails', async () => {
            execFileStub.rejects(new Error('fail'));
            const available = await service.isAvailable();
            assert.strictEqual(available, false);
        });
    });
});
