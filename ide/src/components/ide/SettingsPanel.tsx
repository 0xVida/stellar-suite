/**
 * SettingsPanel.tsx
 *
 * Main settings panel containing math safety settings.
 */

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import MathSafetySettings from './MathSafetySettings';

const SettingsPanel: React.FC = () => {
  return (
    <div className="h-full w-full p-4 overflow-auto">
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Settings</h1>
          <p className="text-muted-foreground">Configure your Stellar Suite IDE experience</p>
        </div>

        <Tabs defaultValue="math-safety" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="math-safety">Math Safety</TabsTrigger>
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="network">Network</TabsTrigger>
            <TabsTrigger value="editor">Editor</TabsTrigger>
          </TabsList>
          
          <TabsContent value="math-safety" className="space-y-4">
            <MathSafetySettings />
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
                <CardTitle>Network Settings</CardTitle>
                <CardDescription>
                  Configure Stellar network connections
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">Network settings coming soon...</p>
              </CardContent>
            </Card>
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
