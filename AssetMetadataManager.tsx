import React, { useState, useEffect } from 'react';
import { Sep1Currency } from '../../types/sep1';
import { generateStellarToml, validateCurrency } from '../../utils/sep1Utils';
import { AssetPreview } from './AssetPreview';

export const AssetMetadataManager: React.FC = () => {
  const [currencies, setCurrencies] = useState<Sep1Currency[]>([
    { code: 'USDC', name: 'USD Coin', status: 'live', desc: 'A digital dollar stablecoin.' }
  ]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [tomlOutput, setTomlOutput] = useState('');

  useEffect(() => {
    setTomlOutput(generateStellarToml(currencies));
  }, [currencies]);

  const updateCurrency = (field: keyof Sep1Currency, value: any) => {
    const updated = [...currencies];
    updated[activeIndex] = { ...updated[activeIndex], [field]: value };
    setCurrencies(updated);
  };

  const activeCurrency = currencies[activeIndex];
  const errors = validateCurrency(activeCurrency);

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-200 overflow-hidden">
      <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-900">
        <h2 className="text-xl font-bold text-white">Asset Metadata (SEP-1)</h2>
        <button 
          className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded text-sm transition"
          onClick={() => navigator.clipboard.writeText(tomlOutput)}
        >
          Copy stellar.toml
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Form Editor */}
        <div className="w-1/2 p-6 overflow-y-auto border-r border-slate-800">
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Asset Code*</label>
              <input 
                type="text" 
                className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white focus:outline-none focus:border-blue-500"
                value={activeCurrency.code}
                onChange={(e) => updateCurrency('code', e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Asset Name</label>
              <input 
                type="text" 
                className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white"
                value={activeCurrency.name || ''}
                onChange={(e) => updateCurrency('name', e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Issuer Address</label>
              <input 
                type="text" 
                className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white font-mono text-sm"
                value={activeCurrency.issuer || ''}
                onChange={(e) => updateCurrency('issuer', e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Contract ID (Soroban)</label>
              <input 
                type="text" 
                className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white font-mono text-sm"
                value={activeCurrency.contract_id || ''}
                onChange={(e) => updateCurrency('contract_id', e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Description</label>
              <textarea 
                className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white h-24 resize-none"
                value={activeCurrency.desc || ''}
                onChange={(e) => updateCurrency('desc', e.target.value)}
              />
            </div>
          </div>
          
          {errors.length > 0 && (
            <div className="mt-6 p-3 bg-red-900/20 border border-red-900/50 rounded text-red-400 text-sm">
              <p className="font-bold mb-1">Validation Errors:</p>
              <ul className="list-disc list-inside">
                {errors.map((err, i) => <li key={i}>{err}</li>)}
              </ul>
            </div>
          )}
        </div>

        {/* Preview Panel */}
        <div className="w-1/2 flex flex-col bg-slate-950 p-6 overflow-y-auto">
          <div className="mb-8">
            <h4 className="text-xs font-semibold text-slate-500 uppercase mb-4 text-center">Wallet Preview</h4>
            <AssetPreview currency={activeCurrency} />
          </div>
          
          <div className="flex-1">
            <h4 className="text-xs font-semibold text-slate-500 uppercase mb-2">Generated TOML</h4>
            <pre className="bg-slate-900 p-4 rounded border border-slate-800 text-blue-400 font-mono text-sm overflow-x-auto">
              {tomlOutput}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
};