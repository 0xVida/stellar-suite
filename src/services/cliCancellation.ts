import { EventEmitter } from 'events';

export interface CancellationToken {
    readonly isCancellationRequested: boolean;
    onCancellationRequested(listener: () => void): { dispose(): void };
}

export class CancellationTokenSource {
    private cancellationRequested: boolean = false;
    private emitter = new EventEmitter();

    get token(): CancellationToken {
        const source = this;
        return {
            get isCancellationRequested() { return source.cancellationRequested; },
            onCancellationRequested: (listener: () => void) => {
                source.emitter.on('cancel', listener);
                return {
                    dispose: () => {
                        source.emitter.off('cancel', listener);
                    }
                };
            }
        };
    }

    cancel(): void {
        this.cancellationRequested = true;
        this.emitter.emit('cancel');
    }
}
