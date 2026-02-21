export interface MockRpcResponse {
    status: number;
    body: any;
    headers?: Record<string, string>;
    delay?: number;
}

export interface MockRpcRequest {
    url: string;
    method: string;
    headers: Record<string, string>;
    body: any;
}

export class MockRpcServer {
    private responses: MockRpcResponse[] = [];
    private defaultResponse: MockRpcResponse = {
        status: 200,
        body: { jsonrpc: '2.0', id: 1, result: { status: 'ok' } }
    };
    private requestLog: MockRpcRequest[] = [];
    private responseIndex = 0;
    private routeHandlers: Map<string, (req: MockRpcRequest) => MockRpcResponse> = new Map();

    public setDefaultResponse(response: MockRpcResponse): void {
        this.defaultResponse = response;
    }

    public enqueueResponse(response: MockRpcResponse): void {
        this.responses.push(response);
    }

    public enqueueResponses(responses: MockRpcResponse[]): void {
        this.responses.push(...responses);
    }

    public addRoute(urlPattern: string, handler: (req: MockRpcRequest) => MockRpcResponse): void {
        this.routeHandlers.set(urlPattern, handler);
    }

    public getRequests(): MockRpcRequest[] {
        return [...this.requestLog];
    }

    public getRequestCount(): number {
        return this.requestLog.length;
    }

    public getLastRequest(): MockRpcRequest | undefined {
        return this.requestLog[this.requestLog.length - 1];
    }

    public reset(): void {
        this.responses = [];
        this.requestLog = [];
        this.responseIndex = 0;
        this.routeHandlers.clear();
        this.defaultResponse = {
            status: 200,
            body: { jsonrpc: '2.0', id: 1, result: { status: 'ok' } }
        };
    }

    public createFetchHandler(): (url: RequestInfo | URL, init?: RequestInit) => Promise<Response> {
        return async (url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
            const urlStr = String(url);
            const method = init?.method || 'GET';
            const headers: Record<string, string> = {};

            if (init?.headers) {
                if (init.headers instanceof Headers) {
                    init.headers.forEach((value, key) => {
                        headers[key] = value;
                    });
                } else if (typeof init.headers === 'object') {
                    Object.assign(headers, init.headers);
                }
            }

            let body: any = undefined;
            if (init?.body) {
                try {
                    body = JSON.parse(String(init.body));
                } catch {
                    body = String(init.body);
                }
            }

            const request: MockRpcRequest = { url: urlStr, method, headers, body };
            this.requestLog.push(request);

            // Check route handlers first
            for (const [pattern, handler] of this.routeHandlers) {
                if (urlStr.includes(pattern)) {
                    const mockResponse = handler(request);
                    if (mockResponse.delay) {
                        await this.delay(mockResponse.delay);
                    }
                    return this.buildResponse(mockResponse);
                }
            }

            // Use queued responses if available
            let mockResponse: MockRpcResponse;
            if (this.responseIndex < this.responses.length) {
                mockResponse = this.responses[this.responseIndex];
                this.responseIndex++;
            } else {
                mockResponse = this.defaultResponse;
            }

            if (mockResponse.delay) {
                await this.delay(mockResponse.delay);
            }

            return this.buildResponse(mockResponse);
        };
    }

    private buildResponse(mock: MockRpcResponse): Response {
        const responseHeaders = new Headers();
        responseHeaders.set('Content-Type', 'application/json');
        if (mock.headers) {
            for (const [key, value] of Object.entries(mock.headers)) {
                responseHeaders.set(key, value);
            }
        }

        return new Response(
            JSON.stringify(mock.body),
            {
                status: mock.status,
                statusText: this.statusText(mock.status),
                headers: responseHeaders
            }
        );
    }

    private statusText(code: number): string {
        const texts: Record<number, string> = {
            200: 'OK',
            400: 'Bad Request',
            401: 'Unauthorized',
            403: 'Forbidden',
            404: 'Not Found',
            429: 'Too Many Requests',
            500: 'Internal Server Error',
            502: 'Bad Gateway',
            503: 'Service Unavailable',
            504: 'Gateway Timeout'
        };
        return texts[code] || 'Unknown';
    }

    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

export function createSimulationSuccessResponse(returnValue: any = 'test_result'): MockRpcResponse {
    return {
        status: 200,
        body: {
            jsonrpc: '2.0',
            id: 1,
            result: {
                returnValue,
                resourceUsage: {
                    cpuInstructions: 12500,
                    memoryBytes: 4096
                }
            }
        }
    };
}

export function createSimulationErrorResponse(message: string, code?: number): MockRpcResponse {
    return {
        status: 200,
        body: {
            jsonrpc: '2.0',
            id: 1,
            error: {
                code: code || -32000,
                message
            }
        }
    };
}

export function createHttpErrorResponse(status: number, message?: string): MockRpcResponse {
    return {
        status,
        body: { error: message || `HTTP ${status} error` }
    };
}

export function createHealthResponse(healthy: boolean): MockRpcResponse {
    return {
        status: healthy ? 200 : 503,
        body: { status: healthy ? 'healthy' : 'unhealthy' }
    };
}

export function createRateLimitResponse(retryAfterSeconds?: number): MockRpcResponse {
    const headers: Record<string, string> = {};
    if (retryAfterSeconds !== undefined) {
        headers['Retry-After'] = String(retryAfterSeconds);
    }
    return {
        status: 429,
        body: { error: 'Too Many Requests' },
        headers
    };
}
