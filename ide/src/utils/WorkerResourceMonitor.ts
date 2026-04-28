export interface WorkerResourceLimits {
  timeoutMs: number;
  maxMemoryMb: number;
  sampleIntervalMs: number;
}

export interface WorkerResourceMonitorOptions {
  limits?: Partial<WorkerResourceLimits>;
  onTimeout: (jobId: string, timeoutMs: number) => void;
  onMemoryExceeded: (jobId: string, memoryMb: number, limitMb: number) => void;
}

const DEFAULT_LIMITS: WorkerResourceLimits = {
  timeoutMs: 120_000,
  maxMemoryMb: 512,
  sampleIntervalMs: 1_000,
};

type PerformanceWithMemory = Performance & {
  memory?: {
    usedJSHeapSize: number;
  };
};

interface MonitoredJob {
  timeoutId: ReturnType<typeof setTimeout>;
  sampleId: ReturnType<typeof setInterval> | null;
  tripped: boolean;
}

export class WorkerResourceMonitor {
  private readonly limits: WorkerResourceLimits;
  private readonly jobs = new Map<string, MonitoredJob>();
  private readonly onTimeout: WorkerResourceMonitorOptions["onTimeout"];
  private readonly onMemoryExceeded: WorkerResourceMonitorOptions["onMemoryExceeded"];

  constructor(options: WorkerResourceMonitorOptions) {
    this.limits = { ...DEFAULT_LIMITS, ...options.limits };
    this.onTimeout = options.onTimeout;
    this.onMemoryExceeded = options.onMemoryExceeded;
  }

  start(jobId: string): void {
    this.stop(jobId);

    const timeoutId = setTimeout(() => {
      const job = this.jobs.get(jobId);
      if (!job || job.tripped) return;

      job.tripped = true;
      this.onTimeout(jobId, this.limits.timeoutMs);
    }, this.limits.timeoutMs);

    const sampleId =
      typeof performance !== "undefined" &&
      Boolean((performance as PerformanceWithMemory).memory)
        ? setInterval(() => {
            this.recordMemorySample(jobId, this.readMemoryMb());
          }, this.limits.sampleIntervalMs)
        : null;

    this.jobs.set(jobId, { timeoutId, sampleId, tripped: false });
  }

  stop(jobId: string): void {
    const job = this.jobs.get(jobId);
    if (!job) return;

    clearTimeout(job.timeoutId);
    if (job.sampleId) clearInterval(job.sampleId);
    this.jobs.delete(jobId);
  }

  stopAll(): void {
    for (const jobId of this.jobs.keys()) {
      this.stop(jobId);
    }
  }

  recordMemorySample(jobId: string, memoryMb: number | null | undefined): void {
    if (typeof memoryMb !== "number" || !Number.isFinite(memoryMb)) return;

    const job = this.jobs.get(jobId);
    if (!job || job.tripped || memoryMb <= this.limits.maxMemoryMb) return;

    job.tripped = true;
    this.onMemoryExceeded(jobId, memoryMb, this.limits.maxMemoryMb);
  }

  private readMemoryMb(): number | null {
    const memory = (performance as PerformanceWithMemory).memory;
    if (!memory) return null;
    return Math.round(memory.usedJSHeapSize / (1024 * 1024));
  }
}

