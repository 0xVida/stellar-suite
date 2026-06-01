import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorkerResourceMonitor } from '@/utils/WorkerResourceMonitor';

describe('WorkerResourceMonitor', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('invokes the timeout callback when a job exceeds its budget', () => {
    vi.useFakeTimers();

    const onTimeout = vi.fn();
    const onMemoryExceeded = vi.fn();
    const monitor = new WorkerResourceMonitor({
      limits: { timeoutMs: 1_000, maxMemoryMb: 128 },
      onTimeout,
      onMemoryExceeded,
    });

    monitor.start('compile-1');
    vi.advanceTimersByTime(999);

    expect(onTimeout).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);

    expect(onTimeout).toHaveBeenCalledTimes(1);
    expect(onTimeout).toHaveBeenCalledWith('compile-1', 1_000);
    expect(onMemoryExceeded).not.toHaveBeenCalled();
  });

  it('invokes the memory callback when a worker sample exceeds the limit', () => {
    const onTimeout = vi.fn();
    const onMemoryExceeded = vi.fn();
    const monitor = new WorkerResourceMonitor({
      limits: { timeoutMs: 1_000, maxMemoryMb: 128 },
      onTimeout,
      onMemoryExceeded,
    });

    monitor.start('compile-1');
    monitor.recordMemorySample('compile-1', 192);

    expect(onMemoryExceeded).toHaveBeenCalledTimes(1);
    expect(onMemoryExceeded).toHaveBeenCalledWith('compile-1', 192, 128);
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it('stops pending timers when a job is cancelled', () => {
    vi.useFakeTimers();

    const onTimeout = vi.fn();
    const onMemoryExceeded = vi.fn();
    const monitor = new WorkerResourceMonitor({
      limits: { timeoutMs: 1_000, maxMemoryMb: 128 },
      onTimeout,
      onMemoryExceeded,
    });

    monitor.start('compile-1');
    monitor.stop('compile-1');
    vi.advanceTimersByTime(1_000);

    expect(onTimeout).not.toHaveBeenCalled();
    expect(onMemoryExceeded).not.toHaveBeenCalled();
  });
});