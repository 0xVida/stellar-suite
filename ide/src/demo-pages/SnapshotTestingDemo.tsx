import { SnapshotDiffViewer } from "@/components/ide/SnapshotDiffViewer";
import { SnapshotViewer } from "@/components/ide/SnapshotViewer";
import { TestExplorer } from "@/components/ide/TestExplorer";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { snapshotManager } from "@/lib/testing/snapshotManager";
import { useState } from "react";


export function SnapshotTestingDemo() {
  const [showDiffViewer, setShowDiffViewer] = useState(false);
  const [demoData, setDemoData] = useState({
    testPath: "demo/example.test.ts",
    testName: "demo test",
    diffs: [
      {
        path: "user.age",
        oldValue: 30,
        newValue: 31,
        type: "modified" as const,
      },
      {
        path: "user.email",
        oldValue: undefined,
        newValue: "user@example.com",
        type: "added" as const,
      },
    ],
    oldValue: {
      user: {
        name: "Alice",
        age: 30,
      },
    },
    newValue: {
      user: {
        name: "Alice",
        age: 31,
        email: "user@example.com",
      },
    },
  });

  const handleCreateDemoSnapshot = async () => {
    const demoSnapshot = {
      contractId: "CCQWERTYUIOPASDFGHJKLZXCVBNM1234567890ABCDEF",
      status: "SUCCESS",
      ledger: 12345678,
      cost: {
        cpuInsns: "5000000",
        memBytes: "8192",
      },
    };

    await snapshotManager.saveSnapshot(
      "demo/contract.test.ts",
      "demo contract deployment",
      demoSnapshot,
    );
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Snapshot Testing Feature Demo</CardTitle>
          <CardDescription>
            Explore the snapshot testing utility components and functionality
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex gap-2">
              <Button onClick={handleCreateDemoSnapshot}>
                Create Demo Snapshot
              </Button>
              <Button variant="outline" onClick={() => setShowDiffViewer(true)}>
                Show Diff Viewer Demo
              </Button>
            </div>

            <div className="text-sm text-muted-foreground">
              <p>This demo showcases the three main components:</p>
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>
                  Test Explorer - Run tests and toggle snapshot update mode
                </li>
                <li>Snapshot Viewer - Browse, preview, and manage snapshots</li>
                <li>
                  Snapshot Diff Viewer - Review and approve snapshot changes
                </li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="explorer" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="explorer">Test Explorer</TabsTrigger>
          <TabsTrigger value="viewer">Snapshot Viewer</TabsTrigger>
        </TabsList>

        <TabsContent value="explorer" className="h-[600px]">
          <TestExplorer />
        </TabsContent>

        <TabsContent value="viewer" className="h-[600px]">
          <SnapshotViewer />
        </TabsContent>
      </Tabs>

      <SnapshotDiffViewer
        open={showDiffViewer}
        onOpenChange={setShowDiffViewer}
        testPath={demoData.testPath}
        testName={demoData.testName}
        diffs={demoData.diffs}
        newValue={demoData.newValue}
        oldValue={demoData.oldValue}
      />

      <Card>
        <CardHeader>
          <CardTitle>Usage Example</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="bg-muted p-4 rounded-md text-sm overflow-x-auto">
            {`import { describe, it, expect } from 'vitest';

describe('Contract Tests', () => {
  it('should match contract state snapshot', async () => {
    const contractState = {
      ledger: { sequence: 12345 },
      storage: {
        entries: [
          { key: 'COUNTER', value: 42 }
        ]
      },
    };

    // This will save the snapshot on first run,
    // then compare against it on subsequent runs
    await expect(contractState).toMatchSnapshot();
  });
});`}
          </pre>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Features</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <h3 className="font-semibold">Storage</h3>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>✓ IndexedDB persistence</li>
                <li>✓ Human-readable JSON format</li>
                <li>✓ Metadata tracking</li>
                <li>✓ Export as .snap files</li>
              </ul>
            </div>
            <div className="space-y-2">
              <h3 className="font-semibold">Diff Algorithm</h3>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>✓ Deep object comparison</li>
                <li>✓ Array difference detection</li>
                <li>✓ Path-based change tracking</li>
                <li>✓ Type-aware comparisons</li>
              </ul>
            </div>
            <div className="space-y-2">
              <h3 className="font-semibold">UI Components</h3>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>✓ Test Explorer with toggle</li>
                <li>✓ Visual diff viewer</li>
                <li>✓ Snapshot browser</li>
                <li>✓ Accessible design</li>
              </ul>
            </div>
            <div className="space-y-2">
              <h3 className="font-semibold">Developer Experience</h3>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>✓ Simple API</li>
                <li>✓ TypeScript support</li>
                <li>✓ Zero configuration</li>
                <li>✓ Vitest integration</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default SnapshotTestingDemo;
