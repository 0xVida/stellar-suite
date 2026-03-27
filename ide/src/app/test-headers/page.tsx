'use client';

import { useState } from 'react';
import { NetworkHeaderEditor } from '@/components/ide/NetworkHeaderEditor';
import { CustomHeaders } from '@/lib/networkConfig';

export default function TestHeadersPage() {
  const [headers, setHeaders] = useState<CustomHeaders>({});

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Custom RPC Headers Test</h1>
      
      <div className="bg-card border rounded-lg p-6 space-y-4">
        <h2 className="text-lg font-semibold">Header Configuration</h2>
        <NetworkHeaderEditor 
          headers={headers} 
          onHeadersChange={setHeaders} 
        />
        
        <div className="mt-6 p-4 bg-muted rounded">
          <h3 className="font-semibold mb-2">Current Headers:</h3>
          <pre className="text-sm bg-background p-3 rounded border">
            {JSON.stringify(headers, null, 2)}
          </pre>
        </div>
      </div>
    </div>
  );
}
