/**
 * SettingsPanel.tsx
 *
 * Main settings panel containing math safety settings.
 */

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import MathSafetySettings from './MathSafetySettings';
import RustfmtEditor from '../settings/RustfmtEditor';
import { EnvVarManager } from '../settings/EnvVarManager';
import SharedEnvironmentSettings from './SharedEnvironmentSettings';
import PostBuildHooksSettings from '../settings/PostBuildHooksSettings';
import { SUPPORTED_PROTOCOL_VERSIONS, getProtocolSpec, type ProtocolVersion } from '@/config/ProtocolMatrix';
import { useNetworkStore } from '@/store/useNetworkStore';

const SettingsPanel: React.FC = () => {
  const simulationProtocolVersion = useNetworkStore((s) => s.simulationProtocolVersion);
  const setSimulationProtocolVersion = useNetworkStore((s) => s.setSimulationProtocolVersion);

  return (
    <div className="h-full w-full p-4 overflow-auto">
      <div className="max-w-6xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Settings</h1>
          <p className="text-muted-foreground">Configure your Stellar Suite IDE experience</p>
        </div>

        <Tabs defaultValue="math-safety" className="w-full">
          <TabsList className="grid w-full grid-cols-7">
            <TabsTrigger value="math-safety">Math Safety</TabsTrigger>
            <TabsTrigger value="formatting">Formatting</TabsTrigger>
            <TabsTrigger value="environment">Environment</TabsTrigger>
            <TabsTrigger value="workflow">Workflow</TabsTrigger>
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="network">Network</TabsTrigger>
            <TabsTrigger value="editor">Editor</TabsTrigger>
          </TabsList>
          
          <TabsContent value="math-safety" className="space-y-4">
            <MathSafetySettings />
          </TabsContent>

          <TabsContent value="formatting" className="space-y-4">
            <RustfmtEditor />
          </TabsContent>
          
          <TabsContent value="environment" className="space-y-4">
            <EnvVarManager />
          </TabsContent>

          <TabsContent value="workflow" className="space-y-4">
            <PostBuildHooksSettings />
          </TabsContent>

          <TabsContent value="general" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>General Settings</CardTitle>
                <CardDescription>
                  General IDE configuration options
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">General settings coming soon...</p>
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="network" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Soroban Protocol</CardTitle>
                <CardDescription>
                  Choose the protocol version used by simulation and deployment pre-flight checks.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <select
                  value={simulationProtocolVersion}
                  onChange={(event) =>
                    setSimulationProtocolVersion(Number(event.target.value) as ProtocolVersion)
                  }
                  className="w-full max-w-sm rounded-md border border-border bg-background px-3 py-2 text-sm"
                >
                  {SUPPORTED_PROTOCOL_VERSIONS.map((version) => {
                    const spec = getProtocolSpec(version);
                    return (
                      <option key={version} value={version}>
                        {spec.label}
                      </option>
                    );
                  })}
                </select>
                <p className="text-sm text-muted-foreground">
                  Deprecated and removed operations are warned before simulation or signing.
                </p>
              </CardContent>
            </Card>
            <SharedEnvironmentSettings />
          </TabsContent>
          
          <TabsContent value="editor" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Editor Settings</CardTitle>
                <CardDescription>
                  Customize the editor appearance and behavior
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">Editor settings coming soon...</p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default SettingsPanel;
