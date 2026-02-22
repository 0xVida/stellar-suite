import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';

const unlinkAsync = promisify(fs.unlink);

export interface CleanupTask {
    type: 'process' | 'file' | 'directory';
    target: number | string; // PID or file path
    description?: string;
}

export class CliCleanupUtilities {
    private tasks: CleanupTask[] = [];

    registerTask(task: CleanupTask): void {
        this.tasks.push(task);
    }

    async cleanupAll(): Promise<void> {
        const results = await Promise.allSettled(this.tasks.map(task => this.executeTask(task)));

        // Clear tasks regardless of success or failure
        this.tasks = [];

        // Log errors internally if necessary, but don't throw to ensure cleanup continues gracefully
        results.forEach(result => {
            if (result.status === 'rejected') {
                console.error('Cleanup task failed:', result.reason);
            }
        });
    }

    private async executeTask(task: CleanupTask): Promise<void> {
        try {
            if (task.type === 'process' && typeof task.target === 'number') {
                // Try SIGTERM first, then SIGKILL
                process.kill(task.target, 'SIGTERM');

                // Fire and forget SIGKILL after a short delay
                setTimeout(() => {
                    try {
                        process.kill(task.target as number, 'SIGKILL');
                    } catch (e) {
                        // Ignore process already dead
                    }
                }, 2000);
            } else if (task.type === 'file' && typeof task.target === 'string') {
                if (fs.existsSync(task.target)) {
                    await unlinkAsync(task.target);
                }
            } else if (task.type === 'directory' && typeof task.target === 'string') {
                if (fs.existsSync(task.target)) {
                    fs.rmSync(task.target, { recursive: true, force: true });
                }
            }
        } catch (error: any) {
            // Suppress errors for non-existent processes/files
            if (error.code !== 'ESRCH' && error.code !== 'ENOENT') {
                throw error;
            }
        }
    }
}
