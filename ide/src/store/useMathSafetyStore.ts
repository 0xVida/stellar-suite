/**
 * useMathSafetyStore.ts
 *
 * Zustand store for managing math safety analysis settings and diagnostics.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { MathSafetyConfig, MathSafetyDiagnostic, DEFAULT_MATH_SAFETY_CONFIG } from '@/lib/mathSafetyAnalyzer';
import { Diagnostic } from '@/utils/cargoParser';

interface MathSafetyState {
  // Configuration
  config: MathSafetyConfig;
  
  // Diagnostics
  mathDiagnostics: MathSafetyDiagnostic[];
  
  // Actions
  setConfig: (config: Partial<MathSafetyConfig>) => void;
  setMathDiagnostics: (diagnostics: MathSafetyDiagnostic[]) => void;
  clearMathDiagnostics: () => void;
  getMathDiagnosticsForFile: (fileId: string) => MathSafetyDiagnostic[];
  
  // Convenience methods
  getAllDiagnostics: (fileId: string, cargoDiags: Diagnostic[]) => Diagnostic[];
  
  // UI state
  showMathSafetyInfo: boolean;
  setShowMathSafetyInfo: (show: boolean) => void;
}

export const useMathSafetyStore = create<MathSafetyState>()(
  persist(
    (set, get) => ({
      // Initial state
      config: DEFAULT_MATH_SAFETY_CONFIG,
      mathDiagnostics: [],
      showMathSafetyInfo: false,
      
      // Configuration actions
      setConfig: (newConfig) => set((state) => ({
        config: { ...state.config, ...newConfig }
      })),
      
      // Diagnostic actions
      setMathDiagnostics: (diagnostics) => set({ mathDiagnostics: diagnostics }),
      clearMathDiagnostics: () => set({ mathDiagnostics: [] }),
      
      getMathDiagnosticsForFile: (fileId) => {
        return get().mathDiagnostics.filter(d => d.fileId === fileId);
      },
      
      // Combine math safety diagnostics with cargo diagnostics
      getAllDiagnostics: (fileId, cargoDiags) => {
        const mathDiags = get().getMathDiagnosticsForFile(fileId);
        const standardMathDiags = mathDiags.map(diag => ({
          fileId: diag.fileId,
          line: diag.line,
          column: diag.column,
          endLine: diag.endLine,
          endColumn: diag.endColumn,
          message: diag.suggestedMethod 
            ? `${diag.message} Consider using \`${diag.suggestedMethod}\` instead.`
            : diag.message,
          severity: diag.severity,
          code: diag.code
        }));
        
        return [...cargoDiags, ...standardMathDiags];
      },
      
      // UI actions
      setShowMathSafetyInfo: (show) => set({ showMathSafetyInfo: show }),
    }),
    {
      name: 'stellar-suite-math-safety-store',
      partialize: (state) => ({
        config: state.config,
      }),
    }
  )
);
