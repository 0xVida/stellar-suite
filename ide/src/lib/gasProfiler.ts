/**
 * Gas Profiling Data Collector
 * 
 * Captures and stores gas usage metrics (CPU instructions and RAM bytes) 
 * for unit tests to identify gas-heavy functions early in development.
 * 
 * Usage:
 * - Run tests with SOROBAN_LOG=off cargo test -- --nocapture
 * - Parse the emulator output for resource usage metrics
 */

export interface GasMetrics {
  cpuInstructions: number;
  memoryBytes: number;
  readonly?: boolean;
}

export interface TestGasProfile {
  testName: string;
  testPath: string;
  status: 'passed' | 'failed' | 'pending';
  duration: number;
  gasMetrics?: GasMetrics;
  error?: string;
}

export interface GasProfileReport {
  totalTests: number;
  passedTests: number;
  failedTests: number;
  totalCpuInstructions: number;
  totalMemoryBytes: number;
  mostExpensiveTests: TestGasProfile[];
  thresholdExceeded: TestGasProfile[];
  network: string;
  generatedAt: string;
}

/**
 * Default gas thresholds (in CPU instructions)
 * These can be adjusted based on the target network
 */
export const DEFAULT_GAS_THRESHOLDS = {
  mainnet: 10_000_000, // 10M CPU instructions
  testnet: 20_000_000, // 20M CPU instructions
  futurenet: 50_000_000, // 50M CPU instructions
};

/**
 * Formats CPU instructions as human-readable string
 */
export function formatCpuInstructions(cpu: number): string {
  if (cpu >= 1_000_000_000) {
    return `${(cpu / 1_000_000_000).toFixed(2)}B`;
  }
  if (cpu >= 1_000_000) {
    return `${(cpu / 1_000_000).toFixed(2)}M`;
  }
  if (cpu >= 1_000) {
    return `${(cpu / 1_000).toFixed(2)}K`;
  }
  return cpu.toString();
}

/**
 * Formats memory bytes as human-readable string
 */
export function formatMemoryBytes(bytes: number): string {
  if (bytes >= 1_073_741_824) {
    return `${(bytes / 1_073_741_824).toFixed(2)} GB`;
  }
  if (bytes >= 1_048_576) {
    return `${(bytes / 1_048_576).toFixed(2)} MB`;
  }
  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(2)} KB`;
  }
  return `${bytes} B`;
}

/**
 * Determines if gas usage exceeds threshold
 */
export function exceedsThreshold(
  metrics: GasMetrics | undefined,
  threshold: number,
  isMainnet: boolean = false,
): boolean {
  if (!metrics) return false;
  
  // For mainnet, use stricter threshold
  const effectiveThreshold = isMainnet 
    ? Math.min(threshold, DEFAULT_GAS_THRESHOLDS.mainnet)
    : threshold;
  
  return metrics.cpuInstructions > effectiveThreshold;
}

/**
 * Gets threshold based on network
 */
export function getThresholdForNetwork(network: string): number {
  const normalized = network.toLowerCase();
  
  if (normalized === 'mainnet') {
    return DEFAULT_GAS_THRESHOLDS.mainnet;
  }
  if (normalized === 'testnet') {
    return DEFAULT_GAS_THRESHOLDS.testnet;
  }
  if (normalized === 'futurenet') {
    return DEFAULT_GAS_THRESHOLDS.futurenet;
  }
  
  // Default to testnet threshold
  return DEFAULT_GAS_THRESHOLDS.testnet;
}

/**
 * Parses gas metrics from cargo test output
 * Looks for patterns like:
 * - "CPU: 1234567 instructions"
 * - "Memory: 1024 bytes"
 * - "Instructions: 123456"
 */
export function parseGasMetricsFromOutput(output: string): GasMetrics | undefined {
  const cpuMatch = output.match(/CPU[:\s]+(\d+)\s+instructions?/i)
    || output.match(/instructions[:\s]+(\d+)/i)
    || output.match(/cpu[:\s]+(\d+)/i);
  
  const memoryMatch = output.match(/Memory[:\s]+(\d+)\s+bytes?/i)
    || output.match(/memory[:\s]+(\d+)/i)
    || output.match(/RAM[:\s]+(\d+)/i);
  
  if (!cpuMatch && !memoryMatch) {
    return undefined;
  }
  
  return {
    cpuInstructions: cpuMatch ? parseInt(cpuMatch[1], 10) : 0,
    memoryBytes: memoryMatch ? parseInt(memoryMatch[1], 10) : 0,
  };
}

/**
 * Parses test results from cargo test output
 * Extracts test names, status, and optionally gas metrics
 */
export function parseTestResults(output: string): TestGasProfile[] {
  const tests: TestGasProfile[] = [];
  
  // Match test result patterns like:
  // test test_name ... ok
  // test test_name FAILED
  // running 1 test
  const lines = output.split('\n');
  
  let currentTest: Partial<TestGasProfile> = {};
  let inTestSection = false;
  
  for (const line of lines) {
    // Check for new test starting
    const runningMatch = line.match(/^running\s+(\d+)\s+test[s]?/i);
    if (runningMatch) {
      inTestSection = true;
      continue;
    }
    
    // Check for test result
    const okMatch = line.match(/^test\s+(.+?)\s+\.\.\.\s+ok/i);
    const failMatch = line.match(/^test\s+(.+?)\s+\.\.\.\s+FAILED/i);
    
    if (okMatch) {
      currentTest.testName = okMatch[1].trim();
      currentTest.status = 'passed';
      
      // Try to parse gas metrics from surrounding lines
      const gasMetrics = parseGasMetricsFromOutput(line);
      if (gasMetrics) {
        currentTest.gasMetrics = gasMetrics;
      }
      
      tests.push(currentTest as TestGasProfile);
      currentTest = {};
    } else if (failMatch) {
      currentTest.testName = failMatch[1].trim();
      currentTest.status = 'failed';
      
      tests.push(currentTest as TestGasProfile);
      currentTest = {};
    }
  }
  
  return tests;
}

/**
 * Gas Profiling Data Collector Class
 * Stores and manages gas profiling data for tests
 */
export class GasProfiler {
  private profiles: TestGasProfile[] = [];
  private network: string = 'testnet';
  
  constructor(network: string = 'testnet') {
    this.network = network;
  }
  
  /**
   * Set the target network
   */
  setNetwork(network: string): void {
    this.network = network;
  }
  
  /**
   * Add a test profile
   */
  addProfile(profile: TestGasProfile): void {
    this.profiles.push(profile);
  }
  
  /**
   * Add multiple profiles at once
   */
  addProfiles(profiles: TestGasProfile[]): void {
    this.profiles.push(...profiles);
  }
  
  /**
   * Clear all profiles
   */
  clear(): void {
    this.profiles = [];
  }
  
  /**
   * Get all profiles
   */
  getProfiles(): TestGasProfile[] {
    return [...this.profiles];
  }
  
  /**
   * Get profiles sorted by CPU usage (descending)
   */
  getProfilesByCpu(): TestGasProfile[] {
    return [...this.profiles].sort((a, b) => {
      const cpuA = a.gasMetrics?.cpuInstructions ?? 0;
      const cpuB = b.gasMetrics?.cpuInstructions ?? 0;
      return cpuB - cpuA;
    });
  }
  
  /**
   * Get profiles that exceed the threshold
   */
  getThresholdExceeded(): TestGasProfile[] {
    const threshold = getThresholdForNetwork(this.network);
    const isMainnet = this.network.toLowerCase() === 'mainnet';
    
    return this.profiles.filter(profile => 
      exceedsThreshold(profile.gasMetrics, threshold, isMainnet)
    );
  }
  
  /**
   * Generate a summary report
   */
  generateReport(): GasProfileReport {
    const passedTests = this.profiles.filter(p => p.status === 'passed');
    const failedTests = this.profiles.filter(p => p.status === 'failed');
    
    const totalCpuInstructions = this.profiles.reduce(
      (sum, p) => sum + (p.gasMetrics?.cpuInstructions ?? 0), 
      0
    );
    
    const totalMemoryBytes = this.profiles.reduce(
      (sum, p) => sum + (p.gasMetrics?.memoryBytes ?? 0), 
      0
    );
    
    const mostExpensive = this.getProfilesByCpu().slice(0, 5);
    const thresholdExceeded = this.getThresholdExceeded();
    
    return {
      totalTests: this.profiles.length,
      passedTests: passedTests.length,
      failedTests: failedTests.length,
      totalCpuInstructions,
      totalMemoryBytes,
      mostExpensiveTests: mostExpensive,
      thresholdExceeded,
      network: this.network,
      generatedAt: new Date().toISOString(),
    };
  }
  
  /**
   * Import from cargo test output
   */
  importFromOutput(output: string): void {
    const profiles = parseTestResults(output);
    this.addProfiles(profiles);
  }
  
  /**
   * Get statistics summary
   */
  getStats(): {
    totalTests: number;
    averageCpu: number;
    averageMemory: number;
    maxCpu: number;
    maxMemory: number;
  } {
    const withMetrics = this.profiles.filter(p => p.gasMetrics);
    
    if (withMetrics.length === 0) {
      return {
        totalTests: this.profiles.length,
        averageCpu: 0,
        averageMemory: 0,
        maxCpu: 0,
        maxMemory: 0,
      };
    }
    
    const totalCpu = withMetrics.reduce((sum, p) => sum + (p.gasMetrics?.cpuInstructions ?? 0), 0);
    const totalMemory = withMetrics.reduce((sum, p) => sum + (p.gasMetrics?.memoryBytes ?? 0), 0);
    
    return {
      totalTests: this.profiles.length,
      averageCpu: Math.round(totalCpu / withMetrics.length),
      averageMemory: Math.round(totalMemory / withMetrics.length),
      maxCpu: Math.max(...withMetrics.map(p => p.gasMetrics?.cpuInstructions ?? 0)),
      maxMemory: Math.max(...withMetrics.map(p => p.gasMetrics?.memoryBytes ?? 0)),
    };
  }
}

// Export a singleton instance
export const gasProfiler = new GasProfiler();

// Export helper to create profiler with specific network
export function createProfiler(network: string): GasProfiler {
  return new GasProfiler(network);
}