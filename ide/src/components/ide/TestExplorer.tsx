"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Play,
  RefreshCw,
  FileText,
  CheckCircle2,
  XCircle,
  Clock,
  Zap,
  AlertTriangle,
  BarChart3,
  Settings2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Tooltip as TooltipRoot,
  TooltipContent as TooltipContentRoot,
  TooltipProvider as TooltipProviderRoot,
  TooltipTrigger as TooltipTriggerRoot,
} from "@/components/ui/tooltip";
import {
  gasProfiler,
  type TestGasProfile,
  type GasProfileReport,
  formatCpuInstructions,
  formatMemoryBytes,
  getThresholdForNetwork,
  DEFAULT_GAS_THRESHOLDS,
} from "@/lib/gasProfiler";
import { useFileStore } from "@/store/useFileStore";

interface TestResult extends TestGasProfile {
  gasMetrics?: {
    cpuInstructions: number;
    memoryBytes: number;
    readonly?: boolean;
  };
  snapshotMismatch?: boolean;
}

interface TestExplorerProps {
  onGasProfileUpdate?: (report: GasProfileReport) => void;
}

export function TestExplorer({ onGasProfileUpdate }: TestExplorerProps) {
  const [updateSnapshots, setUpdateSnapshots] = useState(false);
  const [tests, setTests] = useState<TestResult[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [showGasReport, setShowGasReport] = useState(false);
  const [gasReport, setGasReport] = useState<GasProfileReport | null>(null);
  const [gasThreshold, setGasThreshold] = useState<number>(
    DEFAULT_GAS_THRESHOLDS.testnet,
  );
  const [network, setNetwork] = useState<string>("testnet");

  const { network: currentNetwork } = useFileStore();

  // Sync network with store
  useEffect(() => {
    setNetwork(currentNetwork);
    gasProfiler.setNetwork(currentNetwork);
    setGasThreshold(getThresholdForNetwork(currentNetwork));
  }, [currentNetwork]);

  useEffect(() => {
    // Update snapshot manager when toggle changes
    // snapshotManager.setUpdateMode(updateSnapshots);
  }, [updateSnapshots]);

  // Calculate threshold exceeded tests
  const thresholdExceeded = useMemo(() => {
    return tests.filter(
      (test) =>
        test.gasMetrics && test.gasMetrics.cpuInstructions > gasThreshold,
    );
  }, [tests, gasThreshold]);

  // Get the most expensive tests
  const mostExpensive = useMemo(() => {
    return [...tests]
      .filter((t) => t.gasMetrics)
      .sort(
        (a, b) =>
          (b.gasMetrics?.cpuInstructions ?? 0) -
          (a.gasMetrics?.cpuInstructions ?? 0),
      )
      .slice(0, 5);
  }, [tests]);

  const handleRunTests = async () => {
    setIsRunning(true);

    // Simulate test execution with gas metrics
    // In real implementation, this would run cargo test and parse output
    setTimeout(() => {
      // Generate sample test results with gas metrics for demonstration
      const sampleTests: TestResult[] = [
        {
          testName: "test_initialize",
          testPath: "src/lib.rs::test_initialize",
          status: "passed",
          duration: 125,
          gasMetrics: { cpuInstructions: 150000, memoryBytes: 4096 },
        },
        {
          testName: "test_transfer",
          testPath: "src/lib.rs::test_transfer",
          status: "passed",
          duration: 89,
          gasMetrics: { cpuInstructions: 450000, memoryBytes: 8192 },
        },
        {
          testName: "test_balance_check",
          testPath: "src/lib.rs::test_balance_check",
          status: "passed",
          duration: 45,
          gasMetrics: { cpuInstructions: 75000, memoryBytes: 2048 },
        },
        {
          testName: "test_large_value_store",
          testPath: "src/lib.rs::test_large_value_store",
          status: "passed",
          duration: 234,
          gasMetrics: { cpuInstructions: 15000000, memoryBytes: 65536 },
        },
        {
          testName: "test_complex_iteration",
          testPath: "src/lib.rs::test_complex_iteration",
          status: "passed",
          duration: 312,
          gasMetrics: { cpuInstructions: 28000000, memoryBytes: 131072 },
        },
        {
          testName: "test_mint_token",
          testPath: "src/lib.rs::test_mint_token",
          status: "failed",
          duration: 156,
          gasMetrics: { cpuInstructions: 890000, memoryBytes: 16384 },
          error: "Assertion failed: expected balance > 0",
        },
      ];

      setTests(sampleTests);

      // Update gas profiler
      gasProfiler.clear();
      gasProfiler.addProfiles(sampleTests);

      // Generate report
      const report = gasProfiler.generateReport();
      setGasReport(report);

      if (onGasProfileUpdate) {
        onGasProfileUpdate(report);
      }

      setIsRunning(false);
    }, 1500);
  };

  // Check if test exceeds threshold
  const isGasExcessive = (test: TestResult): boolean => {
    return test.gasMetrics
      ? test.gasMetrics.cpuInstructions > gasThreshold
      : false;
  };

  // Get gas severity level
  const getGasSeverity = (
    test: TestResult,
  ): "low" | "medium" | "high" | "critical" => {
    if (!test.gasMetrics) return "low";

    const cpu = test.gasMetrics.cpuInstructions;
    const threshold = gasThreshold;

    if (cpu > threshold * 2) return "critical";
    if (cpu > threshold * 1.5) return "high";
    if (cpu > threshold) return "medium";
    return "low";
  };

  const getGasBadgeVariant = (
    severity: "low" | "medium" | "high" | "critical",
  ) => {
    switch (severity) {
      case "critical":
        return "destructive";
      case "high":
        return "outline";
      case "medium":
        return "secondary";
      default:
        return "default";
    }
  };

  const getStatusIcon = (status: TestResult["status"]) => {
    switch (status) {
      case "passed":
        return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
      case "failed":
        return <XCircle className="h-4 w-4 text-rose-500" />;
      default:
        return <Clock className="h-4 w-4 text-amber-500" />;
    }
  };

  return (
    <TooltipProvider>
      <Card className="h-full flex flex-col">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Test Explorer
            {thresholdExceeded.length > 0 && (
              <Badge variant="destructive" className="ml-2">
                <AlertTriangle className="h-3 w-3 mr-1" />
                {thresholdExceeded.length} high gas
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            Run and manage your tests with gas profiling
          </CardDescription>
        </CardHeader>

        <CardContent className="flex-1 flex flex-col gap-4">
          {/* Controls */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Switch
                id="update-snapshots"
                checked={updateSnapshots}
                onCheckedChange={setUpdateSnapshots}
              />
              <Label htmlFor="update-snapshots" className="cursor-pointer">
                Update Snapshots
              </Label>
            </div>

            <div className="flex gap-2">
              <TooltipRoot>
                <TooltipTriggerRoot asChild>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowGasReport(true)}
                    disabled={!gasReport}
                  >
                    <BarChart3 className="h-4 w-4 mr-2" />
                    Gas Report
                  </Button>
                </TooltipTriggerRoot>
                <TooltipContentRoot>View gas usage summary</TooltipContentRoot>
              </TooltipRoot>

              <Button
                size="sm"
                variant="outline"
                onClick={handleRunTests}
                disabled={isRunning}
              >
                <RefreshCw
                  className={`h-4 w-4 mr-2 ${isRunning ? "animate-spin" : ""}`}
                />
                Refresh
              </Button>
              <Button size="sm" onClick={handleRunTests} disabled={isRunning}>
                <Play className="h-4 w-4 mr-2" />
                Run All
              </Button>
            </div>
          </div>

          {updateSnapshots && (
            <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-md p-3 text-sm">
              <p className="text-amber-800 dark:text-amber-200">
                Snapshot update mode is enabled. All snapshots will be updated
                on the next test run.
              </p>
            </div>
          )}

          {/* Threshold Settings */}
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <Settings2 className="h-3 w-3" />
              <span>Gas Threshold:</span>
              <Select
                value={gasThreshold.toString()}
                onValueChange={(value) => setGasThreshold(parseInt(value, 10))}
              >
                <SelectTrigger className="h-6 w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={DEFAULT_GAS_THRESHOLDS.mainnet.toString()}>
                    Mainnet (
                    {formatCpuInstructions(DEFAULT_GAS_THRESHOLDS.mainnet)})
                  </SelectItem>
                  <SelectItem value={DEFAULT_GAS_THRESHOLDS.testnet.toString()}>
                    Testnet (
                    {formatCpuInstructions(DEFAULT_GAS_THRESHOLDS.testnet)})
                  </SelectItem>
                  <SelectItem
                    value={DEFAULT_GAS_THRESHOLDS.futurenet.toString()}
                  >
                    Futurenet (
                    {formatCpuInstructions(DEFAULT_GAS_THRESHOLDS.futurenet)})
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <span>Network:</span>
              <Badge variant="outline">{network}</Badge>
            </div>
          </div>

          <ScrollArea className="flex-1">
            <div className="space-y-2">
              {tests.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>No tests found</p>
                  <p className="text-xs mt-1">Run tests to see results here</p>
                </div>
              ) : (
                tests.map((test, index) => {
                  const severity = getGasSeverity(test);
                  const isExcessive = isGasExcessive(test);

                  return (
                    <TooltipRoot key={index}>
                      <TooltipTriggerRoot asChild>
                        <div
                          className={`flex items-center justify-between p-3 border rounded-md hover:bg-accent/50 transition-colors ${
                            isExcessive
                              ? "border-red-300 dark:border-red-800 bg-red-50/50 dark:bg-red-950/50"
                              : ""
                          }`}
                        >
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            {test.status === "passed" ? (
                              <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                            ) : test.status === "failed" ? (
                              <XCircle className="h-4 w-4 text-red-500 shrink-0" />
                            ) : (
                              <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">
                                {test.testName}
                              </p>
                              <p className="text-xs text-muted-foreground truncate">
                                {test.testPath}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {/* Gas metrics */}
                            {test.gasMetrics && (
                              <div className="flex items-center gap-1 text-xs">
                                <Zap
                                  className={`h-3 w-3 ${
                                    severity === "critical"
                                      ? "text-red-500"
                                      : severity === "high"
                                        ? "text-orange-500"
                                        : severity === "medium"
                                          ? "text-yellow-500"
                                          : "text-green-500"
                                  }`}
                                />
                                <span className="font-mono">
                                  {formatCpuInstructions(
                                    test.gasMetrics.cpuInstructions,
                                  )}
                                </span>
                              </div>
                            )}

                            {test.duration && (
                              <span className="text-xs text-muted-foreground">
                                {test.duration}ms
                              </span>
                            )}

                            {/* Gas badge for excessive tests */}
                            {isExcessive && (
                              <Badge variant="destructive" className="text-xs">
                                High Gas
                              </Badge>
                            )}

                            {test.snapshotMismatch && (
                              <Badge variant="outline" className="text-xs">
                                Snapshot
                              </Badge>
                            )}
                          </div>
                        </div>
                      </TooltipTriggerRoot>

                      {/* Tooltip with detailed gas info */}
                      <TooltipContentRoot className="w-80">
                        <div className="space-y-2">
                          <div className="font-semibold">{test.testName}</div>
                          <div className="text-xs text-muted-foreground">
                            {test.testPath}
                          </div>

                          {test.gasMetrics && (
                            <div className="grid grid-cols-2 gap-2 text-xs border-t pt-2 mt-2">
                              <div>CPU Instructions:</div>
                              <div className="font-mono font-semibold">
                                {formatCpuInstructions(
                                  test.gasMetrics.cpuInstructions,
                                )}
                              </div>
                              <div>Memory:</div>
                              <div className="font-mono font-semibold">
                                {formatMemoryBytes(test.gasMetrics.memoryBytes)}
                              </div>
                              <div>Threshold:</div>
                              <div
                                className={`font-mono ${
                                  isExcessive
                                    ? "text-red-500 font-semibold"
                                    : ""
                                }`}
                              >
                                {formatCpuInstructions(gasThreshold)}
                              </div>
                            </div>
                          )}

                          {test.error && (
                            <div className="text-xs text-red-500 border-t pt-2 mt-2">
                              Error: {test.error}
                            </div>
                          )}
                        </div>
                      </TooltipContentRoot>
                    </TooltipRoot>
                  );
                })
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Gas Report Dialog */}
      <Dialog open={showGasReport} onOpenChange={setShowGasReport}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Gas Usage Report
            </DialogTitle>
            <DialogDescription>
              Summary of gas consumption across all tests
            </DialogDescription>
          </DialogHeader>

          {gasReport && (
            <div className="space-y-6">
              {/* Summary Stats */}
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center p-4 bg-muted rounded-lg">
                  <div className="text-2xl font-bold">
                    {gasReport.totalTests}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Total Tests
                  </div>
                </div>
                <div className="text-center p-4 bg-muted rounded-lg">
                  <div className="text-2xl font-bold text-green-500">
                    {gasReport.passedTests}
                  </div>
                  <div className="text-xs text-muted-foreground">Passed</div>
                </div>
                <div className="text-center p-4 bg-muted rounded-lg">
                  <div className="text-2xl font-bold text-red-500">
                    {gasReport.failedTests}
                  </div>
                  <div className="text-xs text-muted-foreground">Failed</div>
                </div>
              </div>

              {/* Total Usage */}
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 border rounded-lg">
                  <div className="text-xs text-muted-foreground mb-1">
                    Total CPU Instructions
                  </div>
                  <div className="text-xl font-mono font-bold">
                    {formatCpuInstructions(gasReport.totalCpuInstructions)}
                  </div>
                </div>
                <div className="p-4 border rounded-lg">
                  <div className="text-xs text-muted-foreground mb-1">
                    Total Memory
                  </div>
                  <div className="text-xl font-mono font-bold">
                    {formatMemoryBytes(gasReport.totalMemoryBytes)}
                  </div>
                </div>
              </div>

              {/* Most Expensive Tests */}
              <div>
                <h4 className="font-semibold mb-3 flex items-center gap-2">
                  <Zap className="h-4 w-4 text-orange-500" />
                  Most Expensive Tests
                </h4>
                <div className="space-y-2">
                  {gasReport.mostExpensiveTests.map((test, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-3 border rounded-md"
                    >
                      <div>
                        <div className="text-sm font-medium">
                          {test.testName}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {test.testPath}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-mono font-semibold">
                          {formatCpuInstructions(
                            test.gasMetrics?.cpuInstructions ?? 0,
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {formatMemoryBytes(test.gasMetrics?.memoryBytes ?? 0)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Threshold Exceeded */}
              {gasReport.thresholdExceeded.length > 0 && (
                <div>
                  <h4 className="font-semibold mb-3 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-red-500" />
                    Tests Exceeding Threshold (
                    {formatCpuInstructions(gasThreshold)})
                  </h4>
                  <div className="space-y-2">
                    {gasReport.thresholdExceeded.map((test, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between p-3 border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 rounded-md"
                      >
                        <div>
                          <div className="text-sm font-medium">
                            {test.testName}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {test.testPath}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-mono font-semibold text-red-500">
                            {formatCpuInstructions(
                              test.gasMetrics?.cpuInstructions ?? 0,
                            )}
                          </div>
                          <div className="text-xs text-red-400">
                            +
                            {Math.round(
                              ((test.gasMetrics?.cpuInstructions ?? 0) /
                                gasThreshold -
                                1) *
                                100,
                            )}
                            %
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Metadata */}
              <div className="text-xs text-muted-foreground border-t pt-4">
                <div>Network: {gasReport.network}</div>
                <div>
                  Generated: {new Date(gasReport.generatedAt).toLocaleString()}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}

export default TestExplorer;
