export class StreamBuffer {
    private readonly chunks: string[] = [];
    private totalBytes = 0;
    private truncated = false;
    private readonly encoder = new TextEncoder();

    constructor(private readonly maxBytes: number = 1024 * 1024) {}

    public append(text: string): void {
        if (!text) {
            return;
        }

        const size = this.encoder.encode(text).length;

        if (size > this.maxBytes) {
            const retained = this.sliceToLastBytes(text, this.maxBytes);
            this.chunks.length = 0;
            this.chunks.push(retained);
            this.totalBytes = this.encoder.encode(retained).length;
            this.truncated = true;
            return;
        }

        this.chunks.push(text);
        this.totalBytes += size;

        while (this.totalBytes > this.maxBytes && this.chunks.length > 0) {
            const removed = this.chunks.shift();
            if (removed === undefined) {
                break;
            }
            this.totalBytes -= this.encoder.encode(removed).length;
            this.truncated = true;
        }
    }

    public toString(): string {
        return this.chunks.join('');
    }

    public isTruncated(): boolean {
        return this.truncated;
    }

    public byteLength(): number {
        return this.totalBytes;
    }

    private sliceToLastBytes(input: string, maxBytes: number): string {
        if (maxBytes <= 0) {
            return '';
        }

        if (this.encoder.encode(input).length <= maxBytes) {
            return input;
        }

        let start = Math.max(0, input.length - maxBytes);
        while (start < input.length && this.encoder.encode(input.slice(start)).length > maxBytes) {
            start += 1;
        }

        while (start > 0 && this.encoder.encode(input.slice(start - 1)).length <= maxBytes) {
            start -= 1;
        }

        return input.slice(start);
    }
}
