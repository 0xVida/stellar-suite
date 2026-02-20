import {
    CliOutputStreamingService,
    CliOutputStreamingRequest,
    CliOutputStreamingResult,
    CliOutputChunk
} from '../../services/cliOutputStreamingService';

export interface MockCliResponse {
    exitCode: number | null;
    stdout: string;
    stderr: string;
    delayMs?: number;
    timedOut?: boolean;
    cancelled?: boolean;
    error?: string;
}

export class MockCliOutputStreamingService extends CliOutputStreamingService {
    private responses: Map<string, MockCliResponse> = new Map();
    private defaultResponse: MockCliResponse = {
        exitCode: 0,
        stdout: 'Success',
        stderr: '',
    };
    public lastRequest?: CliOutputStreamingRequest;
    public callCount = 0;

    public setResponse(argsInclude: string, response: MockCliResponse): void {
        this.responses.set(argsInclude, response);
    }

    public setDefaultResponse(response: MockCliResponse): void {
        this.defaultResponse = response;
    }

    public override async run(request: CliOutputStreamingRequest): Promise<CliOutputStreamingResult> {
        this.callCount++;
        this.lastRequest = request;
        const startedAt = Date.now();

        // Find matching response based on arguments
        let response = this.defaultResponse;
        for (const [key, value] of this.responses.entries()) {
            if (request.args.join(' ').includes(key)) {
                response = value;
                break;
            }
        }

        if (response.delayMs) {
            await new Promise(resolve => setTimeout(resolve, response.delayMs));
        }

        const combinedOutput = [response.stdout, response.stderr].filter(Boolean).join('\n');

        // Simulate streaming
        if (request.onStdout && response.stdout) {
            request.onStdout(response.stdout);
        }
        if (request.onStderr && response.stderr) {
            request.onStderr(response.stderr);
        }
        if (request.onChunk) {
            if (response.stdout) {
                request.onChunk({
                    stream: 'stdout',
                    text: response.stdout,
                    timestamp: new Date().toISOString()
                });
            }
            if (response.stderr) {
                request.onChunk({
                    stream: 'stderr',
                    text: response.stderr,
                    timestamp: new Date().toISOString()
                });
            }
        }

        return {
            success: response.exitCode === 0 && !response.timedOut && !response.cancelled && !response.error,
            exitCode: response.exitCode,
            signal: null,
            stdout: response.stdout,
            stderr: response.stderr,
            combinedOutput,
            durationMs: Date.now() - startedAt,
            cancelled: response.cancelled || false,
            timedOut: response.timedOut || false,
            truncated: false,
            error: response.error,
        };
    }
}
