'use client';

import { useState } from 'react';
import { CustomHeaders } from '@/lib/networkConfig';

interface NetworkHeaderEditorProps {
  headers: CustomHeaders;
  onHeadersChange: (headers: CustomHeaders) => void;
}

export function NetworkHeaderEditor({ headers, onHeadersChange }: NetworkHeaderEditorProps) {
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [showValues, setShowValues] = useState<Record<string, boolean>>({});

  const addHeader = () => {
    if (newKey.trim() && newValue.trim()) {
      onHeadersChange({
        ...headers,
        [newKey.trim()]: newValue.trim()
      });
      setNewKey('');
      setNewValue('');
    }
  };

  const removeHeader = (key: string) => {
    const newHeaders = { ...headers };
    delete newHeaders[key];
    onHeadersChange(newHeaders);
  };

  const updateHeader = (key: string, value: string) => {
    onHeadersChange({
      ...headers,
      [key]: value
    });
  };

  const toggleValueVisibility = (key: string) => {
    setShowValues(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const isSensitiveHeader = (key: string): boolean => {
    const lowerKey = key.toLowerCase();
    return lowerKey.includes('api') || 
           lowerKey.includes('key') || 
           lowerKey.includes('token') || 
           lowerKey.includes('auth') ||
           lowerKey.includes('secret');
  };

  const maskValue = (value: string): string => {
    if (value.length <= 8) return '•'.repeat(value.length);
    return value.substring(0, 4) + '•'.repeat(value.length - 8) + value.substring(value.length - 4);
  };

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {Object.entries(headers).map(([key, value]) => (
          <div key={key} className="flex items-center gap-2">
            <input
              type="text"
              value={key}
              onChange={(e) => {
                const newHeaders = { ...headers };
                delete newHeaders[key];
                const newKey = e.target.value;
                if (newKey.trim()) {
                  newHeaders[newKey.trim()] = value;
                }
                onHeadersChange(newHeaders);
              }}
              className="text-xs rounded border border-border bg-secondary text-foreground px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary flex-1"
              placeholder="Header name"
            />
            <input
              type={isSensitiveHeader(key) && !showValues[key] ? 'password' : 'text'}
              value={value}
              onChange={(e) => updateHeader(key, e.target.value)}
              className="text-xs rounded border border-border bg-secondary text-foreground px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary flex-1"
              placeholder="Header value"
            />
            {isSensitiveHeader(key) && (
              <button
                onClick={() => toggleValueVisibility(key)}
                className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 border border-border rounded bg-secondary"
                title={showValues[key] ? 'Hide value' : 'Show value'}
              >
                {showValues[key] ? '👁️' : '🔒'}
              </button>
            )}
            <button
              onClick={() => removeHeader(key)}
              className="text-xs text-red-500 hover:text-red-400 px-2 py-1 border border-border rounded bg-secondary"
              title="Remove header"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <input
          type="text"
          value={newKey}
          onChange={(e) => setNewKey(e.target.value)}
          className="text-xs rounded border border-border bg-secondary text-foreground px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary flex-1"
          placeholder="New header name (e.g., X-API-KEY)"
          onKeyPress={(e) => e.key === 'Enter' && addHeader()}
        />
        <input
          type={isSensitiveHeader(newKey) ? 'password' : 'text'}
          value={newValue}
          onChange={(e) => setNewValue(e.target.value)}
          className="text-xs rounded border border-border bg-secondary text-foreground px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary flex-1"
          placeholder="Header value"
          onKeyPress={(e) => e.key === 'Enter' && addHeader()}
        />
        <button
          onClick={addHeader}
          disabled={!newKey.trim() || !newValue.trim()}
          className="text-xs px-2 py-1 rounded bg-primary text-primary-foreground disabled:opacity-50 disabled:cursor-not-allowed hover:bg-primary/90"
        >
          +
        </button>
      </div>

      <div className="text-[10px] text-muted-foreground">
        <p>• Add custom headers for private RPC nodes (e.g., X-API-KEY, Authorization)</p>
        <p>• Sensitive headers are masked by default for security</p>
        <p>• Headers are stored locally and sent with every RPC request</p>
      </div>
    </div>
  );
}
