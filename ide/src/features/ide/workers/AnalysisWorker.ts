/**
 * AnalysisWorker.ts
 *
 * Dedicated Web Worker for Rust-analyzer WASM diagnostics and code analysis.
 * Runs entirely off the main thread to preserve UI responsiveness (60fps target).
 *
 * Message protocol:
 *   Main → Worker:
 *     { type: 'INIT'; payload: { wasmUrl: string } }
 *     { type: 'ANALYZE'; payload: { code: string; fileUri: string; version: number } }
 *     { type: 'CANCEL'; payload: { fileUri: string } }
 *     { type: 'DISPOSE' }
 *
 *   Worker → Main:
 *     { type: 'READY' }
 *     { type: 'ANALYSIS_RESULT'; payload: { fileUri: string; version: number; diagnostics: Diagnostic[] } }
 *     { type: 'ANALYSIS_ERROR'; payload: { fileUri: string; message: string } }
 *     { type: 'DISPOSED' }
 */

// --- Types ---

export interface Diagnostic {
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
  message: string;
  severity: 1 | 2 | 4 | 8; // Monaco MarkerSeverity: Hint=1, Info=2, Warning=4, Error=8
  source?: string;
  code?: string | number;
}

export type WorkerInboundMessage =
  | { type: 'INIT'; payload: { wasmUrl: string } }
  | { type: 'ANALYZE'; payload: { code: string; fileUri: string; version: number } }
  | { type: 'CANCEL'; payload: { fileUri: string } }
  | { type: 'DISPOSE' };

export type WorkerOutboundMessage =
  | { type: 'READY' }
  | { type: 'ANALYSIS_RESULT'; payload: { fileUri: string; version: number; diagnostics: Diagnostic[] } }
  | { type: 'ANALYSIS_ERROR'; payload: { fileUri: string; message: string } }
  | { type: 'DISPOSED' };

// --- State ---

let initialized = false;
const pendingCancellations = new Set<string>();

// --- Math Safety Analysis (extracted from ide/src/lib/mathSafetyAnalyzer.ts) ---

interface MathSafetyConfig {
  enabled: boolean;
  sensitivity: 'high' | 'low';
  showSuggestions: boolean;
}

interface MathOperation {
  operator: '+' | '-' | '*';
  leftType: string;
  rightType: string;
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
  context: string;
}

interface MathSafetyDiagnostic extends Diagnostic {
  operation: MathOperation;
  suggestedMethod?: string;
  documentation?: string;
}

const INTEGER_TYPES = [
  'u8', 'u16', 'u32', 'u64', 'u128', 'usize',
  'i8', 'i16', 'i32', 'i64', 'i128', 'isize'
];

const LARGE_INTEGER_TYPES = [
  'u64', 'u128', 'i64', 'i128', 'usize', 'isize'
];

const SOROBAN_TYPES = [
  'U256', 'I256', 'BigUint', 'BigInt', 'Amount', 'Balance', 'Price'
];

function isRiskyType(type: string, sensitivity: 'high' | 'low'): boolean {
  const normalizedType = type.trim();
  
  if (sensitivity === 'high') {
    return INTEGER_TYPES.includes(normalizedType) || 
           SOROBAN_TYPES.some(t => normalizedType.includes(t));
  } else {
    return LARGE_INTEGER_TYPES.includes(normalizedType) || 
           SOROBAN_TYPES.some(t => normalizedType.includes(t));
  }
}

function extractTypeFromContext(context: string, position: number): string {
  const beforePosition = context.substring(0, position);
  const typeMatch = beforePosition.match(/:\s*([a-zA-Z0-9_<>]+)/);
  if (typeMatch) {
    return typeMatch[1];
  }

  const letMatch = beforePosition.match(/let\s+(\w+)\s*=/);
  if (letMatch) {
    if (context.includes('balance') || context.includes('amount')) {
      return 'i64';
    }
  }

  return 'unknown';
}

function parseMathOperations(line: string, lineNumber: number): MathOperation[] {
  const operations: MathOperation[] = [];
  const mathRegex = /([a-zA-Z_][a-zA-Z0-9_]*|\))\s*([+\-*])\s*([a-zA-Z_][a-zA-Z0-9_]*|\d+)/g;

  let match;
  while ((match = mathRegex.exec(line)) !== null) {
    const operator = match[2] as '+' | '-' | '*';
    const column = match.index + 1;
    const endColumn = match.index + match[0].length + 1;
    
    operations.push({
      operator,
      leftType: 'unknown',
      rightType: 'unknown',
      line: lineNumber,
      column,
      endLine: lineNumber,
      endColumn,
      context: match[0]
    });
  }

  return operations;
}

function getSuggestedMethod(operator: '+' | '-' | '*'): string {
  switch (operator) {
    case '+': return 'checked_add()';
    case '-': return 'checked_sub()';
    case '*': return 'checked_mul()';
    default: return '';
  }
}

function getDocumentation(operator: '+' | '-' | '*'): string {
  const docs: Record<string, string> = {
    '+': 'https://doc.rust-lang.org/std/primitive.i64.html#method.checked_add',
    '-': 'https://doc.rust-lang.org/std/primitive.i64.html#method.checked_sub',
    '*': 'https://doc.rust-lang.org/std/primitive.i64.html#method.checked_mul'
  };
  return docs[operator];
}

function analyzeMathSafety(
  code: string, 
  fileId: string,
  config: MathSafetyConfig
): MathSafetyDiagnostic[] {
  if (!config.enabled) {
    return [];
  }

  const diagnostics: MathSafetyDiagnostic[] = [];
  const lines = code.split('\n');
  
  const allOperations: MathOperation[] = [];
  lines.forEach((line, index) => {
    const operations = parseMathOperations(line, index + 1);
    allOperations.push(...operations);
  });
  
  allOperations.forEach(operation => {
    const lineIndex = operation.line - 1;
    if (lineIndex >= lines.length) return;
    
    const fullContext = code.split('\n').slice(
      Math.max(0, lineIndex - 2),
      Math.min(lines.length, lineIndex + 3)
    ).join('\n');
    
    const leftType = extractTypeFromContext(fullContext, operation.column);
    const rightType = extractTypeFromContext(fullContext, operation.column + operation.context.length);
    
    const operationWithTypes = {
      ...operation,
      leftType,
      rightType
    };
    
    const leftRisky = isRiskyType(leftType, config.sensitivity);
    const rightRisky = isRiskyType(rightType, config.sensitivity);
    
    if (leftRisky || rightRisky) {
      const suggestedMethod = config.showSuggestions ? getSuggestedMethod(operation.operator) : undefined;
      const documentation = getDocumentation(operation.operator);
      
      const diagnostic: MathSafetyDiagnostic = {
        startLineNumber: operation.line,
        startColumn: operation.column,
        endLineNumber: operation.endLine,
        endColumn: operation.endColumn,
        message: `Potentially unsafe ${operation.operator} operation on ${leftRisky ? leftType : rightType}. This could cause overflow/underflow on ledger.`,
        severity: config.sensitivity === 'high' ? 4 : 2,
        source: 'math-safety',
        code: 'MATH001',
        operation: operationWithTypes,
        suggestedMethod,
        documentation
      };
      
      diagnostics.push(diagnostic);
    }
  });
  
  return diagnostics;
}

// --- Initialization ---

async function initializeAnalyzer(wasmUrl: string): Promise<void> {
  if (initialized) return;

  try {
    console.log(`[AnalysisWorker] Initializing analyzer from: ${wasmUrl}`);
    initialized = true;
  } catch (err) {
    throw new Error(`[AnalysisWorker] Failed to initialize analyzer: ${String(err)}`);
  }
}

// --- Analysis ---

async function runAnalysis(
  code: string,
  fileUri: string,
  version: number
): Promise<Diagnostic[]> {
  console.log(`[AnalysisWorker] Analyzing ${fileUri} (version ${version}), code length: ${code.length}`);

  const config: MathSafetyConfig = {
    enabled: true,
    sensitivity: 'high',
    showSuggestions: true
  };

  return analyzeMathSafety(code, fileUri, config);
}

// --- Message Handler ---

self.onmessage = async (event: MessageEvent<WorkerInboundMessage>) => {
  const msg = event.data;

  switch (msg.type) {
    case 'INIT': {
      try {
        await initializeAnalyzer(msg.payload.wasmUrl);
        const reply: WorkerOutboundMessage = { type: 'READY' };
        self.postMessage(reply);
      } catch (err) {
        const reply: WorkerOutboundMessage = {
          type: 'ANALYSIS_ERROR',
          payload: { fileUri: '', message: String(err) },
        };
        self.postMessage(reply);
      }
      break;
    }

    case 'ANALYZE': {
      const { code, fileUri, version } = msg.payload;

      if (pendingCancellations.has(fileUri)) {
        pendingCancellations.delete(fileUri);
        return;
      }

      try {
        const diagnostics = await runAnalysis(code, fileUri, version);

        if (pendingCancellations.has(fileUri)) {
          pendingCancellations.delete(fileUri);
          return;
        }

        const reply: WorkerOutboundMessage = {
          type: 'ANALYSIS_RESULT',
          payload: { fileUri, version, diagnostics },
        };
        self.postMessage(reply);
      } catch (err) {
        const reply: WorkerOutboundMessage = {
          type: 'ANALYSIS_ERROR',
          payload: { fileUri, message: String(err) },
        };
        self.postMessage(reply);
      }
      break;
    }

    case 'CANCEL': {
      pendingCancellations.add(msg.payload.fileUri);
      break;
    }

    case 'DISPOSE': {
      initialized = false;
      const reply: WorkerOutboundMessage = { type: 'DISPOSED' };
      self.postMessage(reply);
      self.close();
      break;
    }

    default: {
      console.warn('[AnalysisWorker] Unknown message type received:', (msg as { type: string }).type);
    }
  }
};

// Catch unhandled errors inside the worker and report them to the main thread
self.onerror = (err) => {
  const reply: WorkerOutboundMessage = {
    type: 'ANALYSIS_ERROR',
    payload: {
      fileUri: '',
      message: err instanceof ErrorEvent ? err.message : String(err),
    },
  };
  self.postMessage(reply);
};