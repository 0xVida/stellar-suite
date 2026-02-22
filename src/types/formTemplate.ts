// src/types/formTemplate.ts

export interface FormTemplate {
  id: string; // Unique identifier (e.g., UUID or timestamp-based)
  name: string; // User-facing name for this preset
  contractId: string; // Target contract for this preset
  functionName: string; // Target function for this preset
  parameters: Record<string, string>; // The saved arguments
  createdAt: number; // Unix timestamp
  updatedAt: number; // Unix timestamp
  category?: string; // Optional filtering category
}

export interface FormTemplateFilter {
  contractId?: string;
  functionName?: string;
  category?: string;
}
