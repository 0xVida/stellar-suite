/**
 * mathSafetyAnalyzer.ts
 *
 * Analyzes Rust code for potentially unsafe mathematical operations that could
 * cause overflow/underflow on ledger. Provides suggestions for using checked
 * and saturating arithmetic methods.
 */

import { Diagnostic } from '@/utils/cargoParser';

export type MathSafetyLevel = 'high' | 'low';

export interface MathSafetyConfig {
  enabled: boolean;
  sensitivity: MathSafetyLevel;
  showSuggestions: boolean;
}

export interface MathOperation {
  operator: '+' | '-' | '*';
  leftType: string;
  rightType: string;
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
  context: string;
}

export interface MathSafetyDiagnostic extends Diagnostic {
  operation: MathOperation;
  suggestedMethod?: string;
  documentation?: string;
}

// Rust integer types that can overflow
const INTEGER_TYPES = [
  'u8', 'u16', 'u32', 'u64', 'u128', 'usize',
  'i8', 'i16', 'i32', 'i64', 'i128', 'isize'
];

// Large integer types that are more prone to overflow in Soroban contracts
const LARGE_INTEGER_TYPES = [
  'u64', 'u128', 'i64', 'i128', 'usize', 'isize'
];

// Soroban-specific types that often contain large numbers
const SOROBAN_TYPES = [
  'U256', 'I256', 'BigUint', 'BigInt', 'Amount', 'Balance', 'Price'
];

/**
 * Check if a type is potentially risky for overflow/underflow
 */
function isRiskyType(type: string, sensitivity: MathSafetyLevel): boolean {
  const normalizedType = type.trim();
  
  if (sensitivity === 'high') {
    return INTEGER_TYPES.includes(normalizedType) || 
           SOROBAN_TYPES.some(t => normalizedType.includes(t));
  } else {
    return LARGE_INTEGER_TYPES.includes(normalizedType) || 
           SOROBAN_TYPES.some(t => normalizedType.includes(t));
  }
}

/**
 * Extract type from a variable declaration or expression
 */
function extractTypeFromContext(context: string, position: number): string {
  // Look for type annotations before the position
  const beforePosition = context.substring(0, position);
  const typeMatch = beforePosition.match(/:\s*([a-zA-Z0-9_<>]+)/);
  if (typeMatch) {
    return typeMatch[1];
  }

  // Look for let statements with type inference
  const letMatch = beforePosition.match(/let\s+(\w+)\s*=/);
  if (letMatch) {
    // Try to infer from common patterns
    const varName = letMatch[1];
    const fullContext = context;
    
    // Look for explicit type annotation elsewhere
    const typeAnnotationMatch = fullContext.match(
      new RegExp(`let\\s+${varName}\\s*:\\s*([a-zA-Z0-9_<>]+)`)
    );
    if (typeAnnotationMatch) {
      return typeAnnotationMatch[1];
    }
    
    // Default to i64 for common numeric patterns in Soroban
    if (context.includes('balance') || context.includes('amount')) {
      return 'i64';
    }
  }

  return 'unknown';
}

/**
 * Parse a line of Rust code to find mathematical operations
 */
function parseMathOperations(line: string, lineNumber: number): MathOperation[] {
  const operations: MathOperation[] = [];
  
  // Regex to match +, -, * operations with context
  const mathRegex = /([a-zA-Z_][a-zA-Z0-9_]*|\))\s*([+\-*])\s*([a-zA-Z_][a-zA-Z0-9_]*|\d+)/g;
  
  let match;
  while ((match = mathRegex.exec(line)) !== null) {
    const operator = match[2] as '+' | '-' | '*';
    const leftOperand = match[1];
    const rightOperand = match[3];
    
    const column = match.index + 1; // 1-based
    const endColumn = match.index + match[0].length + 1;
    
    operations.push({
      operator,
      leftType: 'unknown', // Will be determined by context analysis
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

/**
 * Determine the suggested safe method for an operation
 */
function getSuggestedMethod(operator: '+' | '-' | '*'): string {
  switch (operator) {
    case '+': return 'checked_add()';
    case '-': return 'checked_sub()';
    case '*': return 'checked_mul()';
    default: return '';
  }
}

/**
 * Get documentation link for the math safety issue
 */
function getDocumentation(operator: '+' | '-' | '*'): string {
  const docs = {
    '+': 'https://doc.rust-lang.org/std/primitive.i64.html#method.checked_add',
    '-': 'https://doc.rust-lang.org/std/primitive.i64.html#method.checked_sub',
    '*': 'https://doc.rust-lang.org/std/primitive.i64.html#method.checked_mul'
  };
  return docs[operator];
}

/**
 * Analyze Rust code for math safety issues
 */
export function analyzeMathSafety(
  code: string, 
  fileId: string,
  config: MathSafetyConfig
): MathSafetyDiagnostic[] {
  if (!config.enabled) {
    return [];
  }

  const diagnostics: MathSafetyDiagnostic[] = [];
  const lines = code.split('\n');
  
  // First pass: find all math operations
  const allOperations: MathOperation[] = [];
  lines.forEach((line, index) => {
    const operations = parseMathOperations(line, index + 1);
    allOperations.push(...operations);
  });
  
  // Second pass: analyze each operation with context
  allOperations.forEach(operation => {
    const lineIndex = operation.line - 1;
    if (lineIndex >= lines.length) return;
    
    const line = lines[lineIndex];
    const fullContext = code.split('\n').slice(
      Math.max(0, lineIndex - 2),
      Math.min(lines.length, lineIndex + 3)
    ).join('\n');
    
    // Try to determine types from context
    const leftType = extractTypeFromContext(fullContext, operation.column);
    const rightType = extractTypeFromContext(fullContext, operation.column + operation.context.length);
    
    const operationWithTypes = {
      ...operation,
      leftType,
      rightType
    };
    
    // Check if this operation is risky
    const leftRisky = isRiskyType(leftType, config.sensitivity);
    const rightRisky = isRiskyType(rightType, config.sensitivity);
    
    if (leftRisky || rightRisky) {
      const suggestedMethod = config.showSuggestions ? getSuggestedMethod(operation.operator) : undefined;
      const documentation = getDocumentation(operation.operator);
      
      const diagnostic: MathSafetyDiagnostic = {
        fileId,
        line: operation.line,
        column: operation.column,
        endLine: operation.endLine,
        endColumn: operation.endColumn,
        message: `Potentially unsafe ${operation.operator} operation on ${leftRisky ? leftType : rightType}. This could cause overflow/underflow on ledger.`,
        severity: config.sensitivity === 'high' ? 'warning' : 'info',
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

/**
 * Convert math safety diagnostics to standard diagnostics
 */
export function toStandardDiagnostics(mathDiags: MathSafetyDiagnostic[]): Diagnostic[] {
  return mathDiags.map(diag => ({
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
}

/**
 * Default configuration for math safety analysis
 */
export const DEFAULT_MATH_SAFETY_CONFIG: MathSafetyConfig = {
  enabled: true,
  sensitivity: 'high',
  showSuggestions: true
};
