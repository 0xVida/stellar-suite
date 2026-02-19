import * as vscode from 'vscode';

export enum LogLevel {
    DEBUG = 'DEBUG',
    INFO = 'INFO',
    WARN = 'WARN',
    ERROR = 'ERROR',
}

export interface RpcLog {
    id: string;
    timestamp: number;
    level: LogLevel;
    type: 'request' | 'response' | 'error' | 'timing' | 'info';
    method?: string;
    url?: string;
    requestBody?: any;
    responseBody?: any;
    statusCode?: number;
    duration?: number; // milliseconds
    error?: string;
    sensitiveDataMasked: boolean;
}

export interface RpcLogFilter {
    level?: LogLevel[];
    type?: ('request' | 'response' | 'error' | 'timing' | 'info')[];
    method?: string;
    startTime?: number;
    endTime?: number;
    minDuration?: number;
    maxDuration?: number;
}

export interface RpcLoggerConfig {
    maxLogs?: number;
    level?: LogLevel;
    maskSensitiveData?: boolean;
    enableConsoleOutput?: boolean;
    context?: vscode.ExtensionContext;
}

/**
 * Comprehensive RPC request/response logging service
 * Handles logging of RPC operations with timing, filtering, export, and sensitive data masking
 */
export class RpcLogger {
    private logs: RpcLog[] = [];
    private requestTimings: Map<string, number> = new Map();
    private maxLogs: number;
    private logLevel: LogLevel;
    private maskSensitiveData: boolean;
    private enableConsoleOutput: boolean;
    private logCounter: number = 0;
    private readonly storageKey = 'rpcLogs';
    private context?: vscode.ExtensionContext;

    constructor(config: RpcLoggerConfig = {}) {
        this.maxLogs = config.maxLogs ?? 500;
        this.logLevel = config.level ?? LogLevel.INFO;
        this.maskSensitiveData = config.maskSensitiveData ?? true;
        this.enableConsoleOutput = config.enableConsoleOutput ?? true;
        this.context = config.context;
    }

    /**
     * Load logs from storage
     */
    public async loadLogs(): Promise<void> {
        if (!this.context) return;

        try {
            const stored = this.context.workspaceState.get<RpcLog[]>(this.storageKey);
            if (stored) {
                this.logs = stored.slice(-this.maxLogs); // Keep only recent logs
            }
        } catch (error) {
            console.error('[RpcLogger] Error loading logs:', error);
        }
    }

    /**
     * Save logs to storage
     */
    public async saveLogs(): Promise<void> {
        if (!this.context) return;

        try {
            const logsToSave = this.logs.slice(-this.maxLogs);
            await this.context.workspaceState.update(this.storageKey, logsToSave);
        } catch (error) {
            console.error('[RpcLogger] Error saving logs:', error);
        }
    }

    /**
     * Log an RPC request
     */
    public logRequest(method: string, url: string, requestBody: any): string {
        const id = this.generateId();
        const timestamp = Date.now();

        if (this.shouldLog(LogLevel.INFO)) {
            const maskedBody = this.maskSensitiveData ? this.maskData(requestBody) : requestBody;
            
            this.logs.push({
                id,
                timestamp,
                level: LogLevel.INFO,
                type: 'request',
                method,
                url,
                requestBody: maskedBody,
                sensitiveDataMasked: this.maskSensitiveData,
            });

            this.enforceMaxLogs();
            this.consoleLog(LogLevel.INFO, `RPC Request: ${method} to ${url}`, { id });
        }

        // Start timing for this request
        this.requestTimings.set(id, timestamp);

        return id;
    }

    /**
     * Log an RPC response
     */
    public logResponse(
        requestId: string,
        method: string,
        statusCode: number,
        responseBody: any
    ): void {
        const timestamp = Date.now();
        const duration = this.requestTimings.get(requestId)
            ? timestamp - this.requestTimings.get(requestId)!
            : undefined;

        if (duration !== undefined) {
            this.requestTimings.delete(requestId);
        }

        if (this.shouldLog(LogLevel.INFO)) {
            const maskedBody = this.maskSensitiveData ? this.maskData(responseBody) : responseBody;

            this.logs.push({
                id: this.generateId(),
                timestamp,
                level: LogLevel.INFO,
                type: 'response',
                method,
                statusCode,
                responseBody: maskedBody,
                duration,
                sensitiveDataMasked: this.maskSensitiveData,
            });

            this.enforceMaxLogs();
            this.consoleLog(LogLevel.INFO, `RPC Response: ${method} (${statusCode}) - ${duration}ms`, {
                requestId,
                duration,
            });
        }

        // Log timing separately
        if (duration !== undefined) {
            this.logTiming(requestId, method, duration);
        }
    }

    /**
     * Log an RPC error
     */
    public logError(requestId: string, method: string, error: Error | string): void {
        const timestamp = Date.now();
        const duration = this.requestTimings.get(requestId)
            ? timestamp - this.requestTimings.get(requestId)!
            : undefined;

        if (duration !== undefined) {
            this.requestTimings.delete(requestId);
        }

        if (this.shouldLog(LogLevel.ERROR)) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            const errorStack = error instanceof Error ? error.stack : undefined;

            this.logs.push({
                id: this.generateId(),
                timestamp,
                level: LogLevel.ERROR,
                type: 'error',
                method,
                error: `${errorMessage}${errorStack ? `\n${errorStack}` : ''}`,
                duration,
                sensitiveDataMasked: false,
            });

            this.enforceMaxLogs();
            this.consoleLog(LogLevel.ERROR, `RPC Error: ${method} - ${errorMessage}`, {
                requestId,
                duration,
            });
        }
    }

    /**
     * Log timing information
     */
    private logTiming(requestId: string, method: string, duration: number): void {
        if (this.shouldLog(LogLevel.DEBUG)) {
            this.logs.push({
                id: this.generateId(),
                timestamp: Date.now(),
                level: LogLevel.DEBUG,
                type: 'timing',
                method,
                duration,
                sensitiveDataMasked: false,
            });

            this.enforceMaxLogs();
            this.consoleLog(LogLevel.DEBUG, `RPC Timing: ${method} took ${duration}ms`, {
                requestId,
            });
        }
    }

    /**
     * Log info message
     */
    public logInfo(message: string, data?: any): void {
        if (this.shouldLog(LogLevel.INFO)) {
            this.logs.push({
                id: this.generateId(),
                timestamp: Date.now(),
                level: LogLevel.INFO,
                type: 'info',
                error: message,
                sensitiveDataMasked: false,
            });

            this.enforceMaxLogs();
            this.consoleLog(LogLevel.INFO, message, data);
        }
    }

    /**
     * Get all logs
     */
    public getLogs(): RpcLog[] {
        return [...this.logs];
    }

    /**
     * Get filtered logs
     */
    public getFilteredLogs(filter: RpcLogFilter): RpcLog[] {
        return this.logs.filter(log => {
            if (filter.level && !filter.level.includes(log.level)) {
                return false;
            }
            if (filter.type && !filter.type.includes(log.type)) {
                return false;
            }
            if (filter.method && log.method !== filter.method) {
                return false;
            }
            if (filter.startTime && log.timestamp < filter.startTime) {
                return false;
            }
            if (filter.endTime && log.timestamp > filter.endTime) {
                return false;
            }
            if (filter.minDuration && (!log.duration || log.duration < filter.minDuration)) {
                return false;
            }
            if (filter.maxDuration && (!log.duration || log.duration > filter.maxDuration)) {
                return false;
            }
            return true;
        });
    }

    /**
     * Get logs by method
     */
    public getLogsByMethod(method: string): RpcLog[] {
        return this.logs.filter(log => log.method === method);
    }

    /**
     * Get logs by level
     */
    public getLogsByLevel(level: LogLevel): RpcLog[] {
        return this.logs.filter(log => log.level === level);
    }

    /**
     * Get timing statistics
     */
    public getTimingStats(): {
        method: string;
        count: number;
        avgDuration: number;
        minDuration: number;
        maxDuration: number;
    }[] {
        const stats = new Map<
            string,
            { count: number; total: number; min: number; max: number }
        >();

        this.logs
            .filter(log => log.duration !== undefined && log.method)
            .forEach(log => {
                const method = log.method!;
                const duration = log.duration!;

                if (!stats.has(method)) {
                    stats.set(method, { count: 0, total: 0, min: duration, max: duration });
                }

                const stat = stats.get(method)!;
                stat.count++;
                stat.total += duration;
                stat.min = Math.min(stat.min, duration);
                stat.max = Math.max(stat.max, duration);
            });

        return Array.from(stats.entries()).map(([method, stat]) => ({
            method,
            count: stat.count,
            avgDuration: Math.round(stat.total / stat.count),
            minDuration: stat.min,
            maxDuration: stat.max,
        }));
    }

    /**
     * Get error statistics
     */
    public getErrorStats(): { method: string; count: number; errors: string[] }[] {
        const stats = new Map<string, { count: number; errors: Set<string> }>();

        this.logs
            .filter(log => log.type === 'error' && log.method)
            .forEach(log => {
                const method = log.method!;
                const errorMsg = log.error || 'Unknown error';

                if (!stats.has(method)) {
                    stats.set(method, { count: 0, errors: new Set() });
                }

                const stat = stats.get(method)!;
                stat.count++;
                stat.errors.add(errorMsg.split('\n')[0]); // Get first line only
            });

        return Array.from(stats.entries()).map(([method, stat]) => ({
            method,
            count: stat.count,
            errors: Array.from(stat.errors),
        }));
    }

    /**
     * Clear old logs
     */
    public clearOldLogs(olderThanMs: number): number {
        const cutoffTime = Date.now() - olderThanMs;
        const initialCount = this.logs.length;
        this.logs = this.logs.filter(log => log.timestamp > cutoffTime);
        return initialCount - this.logs.length;
    }

    /**
     * Clear all logs
     */
    public clearAll(): void {
        this.logs = [];
        this.requestTimings.clear();
        this.logCounter = 0;
    }

    /**
     * Export logs as JSON
     */
    public exportAsJson(): string {
        return JSON.stringify(this.logs, null, 2);
    }

    /**
     * Export logs as CSV
     */
    public exportAsCsv(): string {
        if (this.logs.length === 0) {
            return 'id,timestamp,level,type,method,statusCode,duration,error\n';
        }

        const headers = ['id', 'timestamp', 'level', 'type', 'method', 'statusCode', 'duration', 'error'];
        const rows = this.logs.map(log => [
            log.id,
            new Date(log.timestamp).toISOString(),
            log.level,
            log.type,
            log.method || '',
            log.statusCode || '',
            log.duration || '',
            this.escapeCsvField(log.error || ''),
        ]);

        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.join(',')),
        ].join('\n');

        return csvContent;
    }

    /**
     * Set log level
     */
    public setLogLevel(level: LogLevel): void {
        this.logLevel = level;
    }

    /**
     * Get current log level
     */
    public getLogLevel(): LogLevel {
        return this.logLevel;
    }

    /**
     * Enable/disable sensitive data masking
     */
    public setSensitiveDataMasking(enabled: boolean): void {
        this.maskSensitiveData = enabled;
    }

    /**
     * Get sensitive data masking status
     */
    public isSensitiveDataMaskingEnabled(): boolean {
        return this.maskSensitiveData;
    }

    // Private helper methods

    private shouldLog(level: LogLevel): boolean {
        const levels = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR];
        const currentIndex = levels.indexOf(this.logLevel);
        const messageIndex = levels.indexOf(level);
        return messageIndex >= currentIndex;
    }

    private maskData(data: any): any {
        if (!this.maskSensitiveData) {
            return data;
        }

        if (typeof data !== 'object' || data === null) {
            return data;
        }

        if (Array.isArray(data)) {
            return data.map(item => this.maskData(item));
        }

        const masked = { ...data };
        const sensitiveKeys = [
            'password',
            'secret',
            'token',
            'key',
            'signature',
            'privateKey',
            'seed',
            'mnemonic',
        ];

        Object.keys(masked).forEach(key => {
            const lowerKey = key.toLowerCase();
            if (sensitiveKeys.some(sk => lowerKey.includes(sk))) {
                masked[key] = '[REDACTED]';
            } else if (typeof masked[key] === 'object') {
                masked[key] = this.maskData(masked[key]);
            }
        });

        return masked;
    }

    private consoleLog(level: LogLevel, message: string, data?: any): void {
        if (!this.enableConsoleOutput) {
            return;
        }

        const timestamp = new Date().toISOString();
        const prefix = `[${timestamp}] [RpcLogger] [${level}]`;
        const logMessage = `${prefix} ${message}`;

        switch (level) {
            case LogLevel.DEBUG:
                console.debug(logMessage, data);
                break;
            case LogLevel.INFO:
                console.info(logMessage, data);
                break;
            case LogLevel.WARN:
                console.warn(logMessage, data);
                break;
            case LogLevel.ERROR:
                console.error(logMessage, data);
                break;
        }
    }

    private generateId(): string {
        return `log_${Date.now()}_${++this.logCounter}`;
    }

    private enforceMaxLogs(): void {
        if (this.logs.length > this.maxLogs) {
            this.logs = this.logs.slice(-this.maxLogs);
        }
    }

    private escapeCsvField(field: string): string {
        if (field.includes(',') || field.includes('"') || field.includes('\n')) {
            return `"${field.replace(/"/g, '""')}"`;
        }
        return field;
    }
}
