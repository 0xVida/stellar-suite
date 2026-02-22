import {
    CliErrorContext,
    formatCliErrorForDisplay,
    parseCliErrorOutput,
} from './cliErrorParser';

export interface FormattedError {
    title: string;
    message: string;
    details?: string;
}

export function formatError(error: unknown, context?: string): FormattedError {
    let title = 'Error';
    let message = 'An unexpected error occurred';
    let details: string | undefined;

    if (error instanceof Error) {
        message = error.message;
        details = error.stack;

        if (error.message.includes('ENOENT') || error.message.includes('not found')) {
            title = 'Command Not Found';
            message = 'Soroban CLI not found. Make sure it is installed and in your PATH, or configure the cliPath setting.';
        } else if (error.message.includes('ECONNREFUSED') || error.message.includes('network')) {
            title = 'Connection Error';
            message = 'Unable to connect to RPC endpoint. Check your network connection and rpcUrl setting.';
        } else if (error.message.includes('timeout')) {
            title = 'Timeout';
            message = 'Request timed out. The RPC endpoint may be slow or unreachable.';
        } else if (error.message.includes('invalid') || error.message.includes('Invalid')) {
            title = 'Invalid Input';
        }
    } else if (typeof error === 'string') {
        message = error;
    }

    if (context) {
        title = `${title} (${context})`;
    }

    return {
        title,
        message,
        details
    };
}

export function formatCliError(stderr: string, context?: CliErrorContext): string {
    const parsed = parseCliErrorOutput(stderr, context);
    return formatCliErrorForDisplay(parsed);
}
