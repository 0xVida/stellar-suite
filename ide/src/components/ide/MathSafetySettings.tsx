/**
 * MathSafetySettings.tsx
 *
 * Settings component for configuring math safety analysis.
 */

import React from 'react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertCircle, Info, Shield, Settings } from 'lucide-react';
import { useMathSafetyStore } from '@/store/useMathSafetyStore';
import { MathSafetyLevel } from '@/lib/mathSafetyAnalyzer';

const MathSafetySettings: React.FC = () => {
  const { config, setConfig, setShowMathSafetyInfo, showMathSafetyInfo } = useMathSafetyStore();

  const handleSensitivityChange = (level: MathSafetyLevel) => {
    setConfig({ sensitivity: level });
  };

  const handleEnabledChange = (enabled: boolean) => {
    setConfig({ enabled });
  };

  const handleSuggestionsChange = (showSuggestions: boolean) => {
    setConfig({ showSuggestions });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Shield className="h-5 w-5" />
        <h2 className="text-lg font-semibold">Math Safety Analysis</h2>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            General Settings
          </CardTitle>
          <CardDescription>
            Configure how math safety analysis works in your Rust code
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label htmlFor="math-safety-enabled">Enable Math Safety Analysis</Label>
              <p className="text-sm text-muted-foreground">
                Detect potentially unsafe arithmetic operations that could cause overflow/underflow
              </p>
            </div>
            <Switch
              id="math-safety-enabled"
              checked={config.enabled}
              onCheckedChange={handleEnabledChange}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label htmlFor="show-suggestions">Show Safe Method Suggestions</Label>
              <p className="text-sm text-muted-foreground">
                Suggest using checked_add(), checked_sub(), checked_mul() methods
              </p>
            </div>
            <Switch
              id="show-suggestions"
              checked={config.showSuggestions}
              onCheckedChange={handleSuggestionsChange}
              disabled={!config.enabled}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sensitivity Level</CardTitle>
          <CardDescription>
            Choose how aggressive the analysis should be
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={config.sensitivity} onValueChange={(value) => handleSensitivityChange(value as MathSafetyLevel)}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="low">Low Sensitivity</TabsTrigger>
              <TabsTrigger value="high">High Sensitivity</TabsTrigger>
            </TabsList>
            
            <TabsContent value="low" className="space-y-4">
              <div className="flex items-start gap-3">
                <Info className="h-5 w-5 text-blue-500 mt-0.5" />
                <div className="space-y-2">
                  <h4 className="font-medium">Low Sensitivity</h4>
                  <p className="text-sm text-muted-foreground">
                    Only flags operations on large integer types (u64, u128, i64, i128, usize, isize) 
                    and Soroban-specific types (U256, I256, Amount, Balance, Price).
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="secondary">u64</Badge>
                    <Badge variant="secondary">u128</Badge>
                    <Badge variant="secondary">i64</Badge>
                    <Badge variant="secondary">i128</Badge>
                    <Badge variant="secondary">U256</Badge>
                    <Badge variant="secondary">Amount</Badge>
                  </div>
                </div>
              </div>
            </TabsContent>
            
            <TabsContent value="high" className="space-y-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-orange-500 mt-0.5" />
                <div className="space-y-2">
                  <h4 className="font-medium">High Sensitivity</h4>
                  <p className="text-sm text-muted-foreground">
                    Flags operations on ALL integer types including small ones (u8, u16, u32, i8, i16, i32).
                    This is useful for beginners learning about overflow safety.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="destructive">u8</Badge>
                    <Badge variant="destructive">u16</Badge>
                    <Badge variant="destructive">u32</Badge>
                    <Badge variant="destructive">i8</Badge>
                    <Badge variant="destructive">i16</Badge>
                    <Badge variant="destructive">i32</Badge>
                    <Badge variant="destructive">u64</Badge>
                    <Badge variant="destructive">u128</Badge>
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Documentation</CardTitle>
          <CardDescription>
            Learn more about Rust math safety and overflow protection
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <div>
              <h4 className="font-medium mb-2">Why Math Safety Matters</h4>
              <p className="text-sm text-muted-foreground">
                In Soroban contracts running on the Stellar ledger, arithmetic overflow/underflow 
                can cause transaction failures and unexpected behavior. Rust provides safe alternatives 
                to handle these cases gracefully.
              </p>
            </div>
            
            <div>
              <h4 className="font-medium mb-2">Safe Methods</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li><code className="bg-muted px-1 rounded">checked_add()</code> - Returns None on overflow</li>
                <li><code className="bg-muted px-1 rounded">checked_sub()</code> - Returns None on underflow</li>
                <li><code className="bg-muted px-1 rounded">checked_mul()</code> - Returns None on overflow</li>
                <li><code className="bg-muted px-1 rounded">saturating_add()</code> - Clamps to max value</li>
                <li><code className="bg-muted px-1 rounded">saturating_sub()</code> - Clamps to min value</li>
                <li><code className="bg-muted px-1 rounded">saturating_mul()</code> - Clamps on overflow</li>
              </ul>
            </div>
            
            <div>
              <h4 className="font-medium mb-2">External Resources</h4>
              <div className="space-y-2">
                <Button variant="outline" size="sm" asChild>
                  <a 
                    href="https://doc.rust-lang.org/std/primitive.i64.html#method.checked_add" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="flex items-center gap-2"
                  >
                    Rust Documentation: Checked Arithmetic
                  </a>
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <a 
                    href="https://doc.rust-lang.org/book/ch03-02-data-types.html#numeric-types" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="flex items-center gap-2"
                  >
                    Rust Book: Numeric Types
                  </a>
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default MathSafetySettings;
