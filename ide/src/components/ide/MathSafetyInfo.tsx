/**
 * MathSafetyInfo.tsx
 *
 * Info popup component showing Rust math safety documentation.
 */

import React from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ExternalLink, AlertTriangle, Shield, Info } from 'lucide-react';

interface MathSafetyInfoProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  operation?: {
    operator: string;
    suggestedMethod?: string;
    documentation?: string;
  };
}

const MathSafetyInfo: React.FC<MathSafetyInfoProps> = ({ 
  open, 
  onOpenChange, 
  operation 
}) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Math Safety in Rust
          </DialogTitle>
          <DialogDescription>
            Understanding overflow/underflow protection in Soroban contracts
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-6">
          {operation && (
            <div className="border rounded-lg p-4 bg-muted/50">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="h-4 w-4 text-orange-500" />
                <h4 className="font-medium">Detected Operation</h4>
              </div>
              <div className="space-y-2">
                <p className="text-sm">
                  <span className="font-mono bg-background px-2 py-1 rounded">
                    {operation.operator}
                  </span>
                  {operation.suggestedMethod && (
                    <span className="ml-2">
                      → Consider using{' '}
                      <code className="bg-background px-2 py-1 rounded text-green-600">
                        {operation.suggestedMethod}
                      </code>
                    </span>
                  )}
                </p>
              </div>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <h4 className="font-medium mb-2 flex items-center gap-2">
                <Info className="h-4 w-4" />
                Why Math Safety Matters
              </h4>
              <p className="text-sm text-muted-foreground">
                In Soroban contracts running on the Stellar ledger, arithmetic overflow/underflow 
                can cause transaction failures and unexpected behavior. Unlike regular Rust programs 
                that might panic, smart contracts need to handle these cases gracefully to ensure 
                predictable execution and avoid losing user funds.
              </p>
            </div>

            <div>
              <h4 className="font-medium mb-3">Safe Arithmetic Methods</h4>
              <div className="grid gap-3">
                <div className="border rounded p-3">
                  <div className="flex items-center justify-between mb-2">
                    <code className="font-mono text-sm bg-muted px-2 py-1 rounded">checked_add()</code>
                    <Badge variant="outline">Returns Option&lt;T&gt;</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Returns Some(result) if no overflow, None if overflow would occur
                  </p>
                </div>
                
                <div className="border rounded p-3">
                  <div className="flex items-center justify-between mb-2">
                    <code className="font-mono text-sm bg-muted px-2 py-1 rounded">checked_sub()</code>
                    <Badge variant="outline">Returns Option&lt;T&gt;</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Returns Some(result) if no underflow, None if underflow would occur
                  </p>
                </div>
                
                <div className="border rounded p-3">
                  <div className="flex items-center justify-between mb-2">
                    <code className="font-mono text-sm bg-muted px-2 py-1 rounded">checked_mul()</code>
                    <Badge variant="outline">Returns Option&lt;T&gt;</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Returns Some(result) if no overflow, None if overflow would occur
                  </p>
                </div>
                
                <div className="border rounded p-3">
                  <div className="flex items-center justify-between mb-2">
                    <code className="font-mono text-sm bg-muted px-2 py-1 rounded">saturating_add()</code>
                    <Badge variant="outline">Clamps to max</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Returns result if no overflow, or MAX_VALUE if overflow would occur
                  </p>
                </div>
                
                <div className="border rounded p-3">
                  <div className="flex items-center justify-between mb-2">
                    <code className="font-mono text-sm bg-muted px-2 py-1 rounded">saturating_sub()</code>
                    <Badge variant="outline">Clamps to min</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Returns result if no underflow, or MIN_VALUE if underflow would occur
                  </p>
                </div>
                
                <div className="border rounded p-3">
                  <div className="flex items-center justify-between mb-2">
                    <code className="font-mono text-sm bg-muted px-2 py-1 rounded">saturating_mul()</code>
                    <Badge variant="outline">Clamps on overflow</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Returns result if no overflow, or MAX_VALUE if overflow would occur
                  </p>
                </div>
              </div>
            </div>

            <div>
              <h4 className="font-medium mb-3">Code Examples</h4>
              <div className="space-y-3">
                <div>
                  <h5 className="text-sm font-medium mb-1">❌ Unsafe (may panic)</h5>
                  <pre className="bg-muted p-3 rounded text-xs overflow-x-auto">
{`let a: u64 = 100;
let b: u64 = 200;
let result = a + b; // Could overflow if values are large`}
                  </pre>
                </div>
                
                <div>
                  <h5 className="text-sm font-medium mb-1">✅ Safe with checked methods</h5>
                  <pre className="bg-muted p-3 rounded text-xs overflow-x-auto">
{`let a: u64 = 100;
let b: u64 = 200;
match a.checked_add(b) {
    Some(result) => {
        // Safe to use result
        env.storage().set(&balance_key, &result);
    }
    None => {
        // Handle overflow case
        panic!("Addition would overflow");
    }
}`}
                  </pre>
                </div>
                
                <div>
                  <h5 className="text-sm font-medium mb-1">✅ Safe with saturating methods</h5>
                  <pre className="bg-muted p-3 rounded text-xs overflow-x-auto">
{`let a: u64 = 100;
let b: u64 = 200;
let result = a.saturating_add(b); // Never overflows
// result will be MAX_VALUE if overflow would occur`}
                  </pre>
                </div>
              </div>
            </div>

            <div>
              <h4 className="font-medium mb-3">External Resources</h4>
              <div className="space-y-2">
                <Button variant="outline" size="sm" asChild className="w-full justify-start">
                  <a 
                    href="https://doc.rust-lang.org/std/primitive.i64.html#method.checked_add" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="flex items-center gap-2"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Rust Documentation: Checked Arithmetic Methods
                  </a>
                </Button>
                
                <Button variant="outline" size="sm" asChild className="w-full justify-start">
                  <a 
                    href="https://doc.rust-lang.org/std/primitive.i64.html#method.saturating_add" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="flex items-center gap-2"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Rust Documentation: Saturating Arithmetic Methods
                  </a>
                </Button>
                
                <Button variant="outline" size="sm" asChild className="w-full justify-start">
                  <a 
                    href="https://doc.rust-lang.org/book/ch03-02-data-types.html#numeric-types" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="flex items-center gap-2"
                  >
                    <ExternalLink className="h-4 w-4" />
                    The Rust Book: Numeric Types
                  </a>
                </Button>
                
                <Button variant="outline" size="sm" asChild className="w-full justify-start">
                  <a 
                    href="https://soroban.stellar.org/docs/learn/developer-resources" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="flex items-center gap-2"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Soroban Documentation: Developer Resources
                  </a>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default MathSafetyInfo;
