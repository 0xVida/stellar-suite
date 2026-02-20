export type BatchMode = 'sequential' | 'parallel';

export type BatchItemStatus =
  | 'queued'
  | 'blocked'     // waiting for dependencies
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'skipped';    // skipped due to dependency failure (or user choice)

export interface BatchDeploymentItem {
  /** Unique ID within the batch */
  id: string;

  /** Display name (contract name / folder name / wasm name) */
  name: string;

  /** Either deploy a contract directory (build+deploy) or deploy from a wasm file */
  contractDir?: string;
  wasmPath?: string;

  /** Item IDs this item depends on */
  dependsOn?: string[];
}

export interface BatchDeploymentItemResult {
  id: string;
  status: BatchItemStatus;

  startedAt?: string;
  finishedAt?: string;

  // Deployment outputs
  contractId?: string;
  transactionHash?: string;

  // Error info (mirrors DeploymentResult shape)
  error?: string;
  errorSummary?: string;
  errorType?: string;
  errorCode?: string;
  errorSuggestions?: string[];
  rawError?: string;

  // Raw CLI outputs if present
  buildOutput?: string;
  deployOutput?: string;
}

export interface BatchDeploymentResult {
  batchId: string;
  mode: BatchMode;

  startedAt: string;
  finishedAt?: string;

  cancelled?: boolean;

  results: BatchDeploymentItemResult[];
}