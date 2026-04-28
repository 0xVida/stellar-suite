import React, { useState, useEffect } from 'react';
import { Asset } from 'stellar-sdk';
import { getSACContractId } from '../../utils/sacUtils';

export const SACInteraction: React.FC = () => {
  const [assetType, setAssetType] = useState<'native' | 'classic'>('native');
  const [assetCode, setAssetCode] = useState('');
  const [assetIssuer, setAssetIssuer] = useState('');
  const [contractId, setContractId] = useState('');
  const [amount, setAmount] = useState('');
  const [activeTab, setActiveTab] = useState<'wrap' | 'unwrap'>('wrap');
  const [isProcessing, setIsProcessing] = useState(false);

  // Default to Testnet for derivation example
  const networkPassphrase = 'Test SDF Network ; September 2015';

  useEffect(() => {
    try {
      let asset: Asset;
      if (assetType === 'native') {
        asset = Asset.native();
      } else {
        if (assetCode && assetIssuer) {
          asset = new Asset(assetCode, assetIssuer);
        } else {
          setContractId('');
          return;
        }
      }
      setContractId(getSACContractId(asset, networkPassphrase));
    } catch (e) {
      setContractId('');
    }
  }, [assetType, assetCode, assetIssuer]);

  const handleAction = async () => {
    setIsProcessing(true);
    // Simulated wrap/unwrap logic for UI demonstration
    setTimeout(() => {
      setIsProcessing(false);
      alert(`${activeTab === 'wrap' ? 'Wrapped' : 'Unwrapped'} ${amount} ${assetType === 'native' ? 'XLM' : assetCode} successfully!`);
    }, 1500);
  };

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-200 overflow-hidden">
      <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-900">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-purple-600/20 rounded-lg">
            <svg className="w-6 h-6 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          </div>
          <div>
            <h2 className="text-xl font-bold text-white leading-tight">SAC Interaction</h2>
            <p className="text-xs text-slate-500">Wrap Classic Assets into Soroban</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Asset Selection */}
        <div className="grid grid-cols-2 gap-4">
          <button 
            onClick={() => setAssetType('native')}
            className={`p-4 rounded-xl border flex flex-col items-center justify-center transition ${assetType === 'native' ? 'bg-blue-600/10 border-blue-500 text-blue-400' : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'}`}
          >
            <div className="w-10 h-10 mb-2 rounded-full bg-slate-800 flex items-center justify-center border border-slate-700">
              <span className="font-bold text-lg text-white">🚀</span>
            </div>
            <span className="font-semibold">Native XLM</span>
          </button>
          <button 
            onClick={() => setAssetType('classic')}
            className={`p-4 rounded-xl border flex flex-col items-center justify-center transition ${assetType === 'classic' ? 'bg-blue-600/10 border-blue-500 text-blue-400' : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'}`}
          >
            <div className="w-10 h-10 mb-2 rounded-full bg-slate-800 flex items-center justify-center border border-slate-700">
              <span className="font-bold text-lg text-white">💰</span>
            </div>
            <span className="font-semibold">Classic Asset</span>
          </button>
        </div>

        {assetType === 'classic' && (
          <div className="grid grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-2 duration-300">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Asset Code</label>
              <input 
                type="text" 
                placeholder="e.g. USDC"
                className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white focus:outline-none focus:border-blue-500"
                value={assetCode}
                onChange={(e) => setAssetCode(e.target.value.toUpperCase())}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Issuer</label>
              <input 
                type="text" 
                placeholder="G..."
                className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white font-mono text-xs focus:outline-none focus:border-blue-500"
                value={assetIssuer}
                onChange={(e) => setAssetIssuer(e.target.value)}
              />
            </div>
          </div>
        )}

        {/* Contract ID Info */}
        <div className="bg-slate-900 rounded-xl p-4 border border-slate-800">
          <h4 className="text-xs font-semibold text-slate-500 uppercase mb-2">Derived SAC Contract ID</h4>
          <div className="flex items-center space-x-2">
            <div className="flex-1 bg-black/40 rounded p-2 font-mono text-sm text-blue-400 break-all min-h-[40px] flex items-center">
              {contractId || (assetType === 'classic' ? 'Fill asset details...' : 'Generating...')}
            </div>
            <button 
              disabled={!contractId}
              className="p-2 bg-slate-800 rounded hover:bg-slate-700 disabled:opacity-50"
              onClick={() => contractId && navigator.clipboard.writeText(contractId)}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
              </svg>
            </button>
          </div>
        </div>

        {/* Action Tabs */}
        <div className="bg-slate-900 rounded-xl p-1 flex">
          <button 
            onClick={() => setActiveTab('wrap')}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition ${activeTab === 'wrap' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200'}`}
          >
            Wrap
          </button>
          <button 
            onClick={() => setActiveTab('unwrap')}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition ${activeTab === 'unwrap' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200'}`}
          >
            Unwrap
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Amount</label>
            <div className="relative">
              <input 
                type="number" 
                placeholder="0.00"
                className="w-full bg-slate-900 border border-slate-800 rounded-lg p-3 text-lg font-bold text-white focus:outline-none focus:border-blue-500"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 px-2 py-1 bg-slate-800 rounded text-xs font-bold">
                {assetType === 'native' ? 'XLM' : (assetCode || 'TOKEN')}
              </div>
            </div>
          </div>

          <button 
            disabled={!contractId || !amount || isProcessing}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-500 text-white py-4 rounded-xl font-bold text-lg transition shadow-xl flex items-center justify-center space-x-2"
            onClick={handleAction}
          >
            {isProcessing ? (
              <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            ) : (
              <span>{activeTab === 'wrap' ? 'Wrap Asset' : 'Unwrap Asset'}</span>
            )}
          </button>
        </div>

        {/* Visual Cue for SAC Identity */}
        <div className="p-4 bg-blue-900/10 border border-blue-900/30 rounded-xl">
          <div className="flex items-start space-x-3">
            <div className="text-blue-400 mt-1">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h5 className="text-sm font-bold text-blue-300">About SAC Assets</h5>
              <p className="text-xs text-blue-400/80 mt-1">
                {assetType === 'native' 
                  ? "The Native XLM SAC allows Soroban contracts to interact with the network's reserve currency. It uses a fixed contract ID on each network."
                  : "Classic assets are wrapped via the Stellar Asset Contract. This creates a bridge between the classic ledger and the Soroban smart contract environment."}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="p-3 bg-slate-900 border-t border-slate-800 flex justify-between items-center px-6">
        <div className="flex items-center space-x-2">
          <div className={`w-2 h-2 rounded-full ${contractId ? 'bg-green-500' : 'bg-red-500'}`}></div>
          <span className="text-[10px] text-slate-500 font-mono uppercase tracking-wider">
            {contractId ? 'Ready' : 'Incomplete'}
          </span>
        </div>
        <span className="text-[10px] text-slate-500 font-mono">
          v1.0.0-beta
        </span>
      </div>
    </div>
  );
};