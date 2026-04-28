import React from 'react';
import { Sep1Currency } from '../../types/sep1';

interface AssetPreviewProps {
  currency: Sep1Currency;
}

export const AssetPreview: React.FC<AssetPreviewProps> = ({ currency }) => {
  return (
    <div className="p-4 bg-slate-900 rounded-lg border border-slate-700 shadow-xl w-full max-w-sm mx-auto">
      <div className="flex items-center space-x-4">
        <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center overflow-hidden border border-slate-600">
          {currency.image ? (
            <img src={currency.image} alt={currency.code} className="w-full h-full object-cover" />
          ) : (
            <span className="text-slate-400 font-bold text-xl">{currency.code?.[0] || '?'}</span>
          )}
        </div>
        <div className="flex-1">
          <div className="flex justify-between items-start">
            <h3 className="text-white font-bold text-lg leading-tight">{currency.name || 'Unnamed Asset'}</h3>
            <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded uppercase">{currency.status || 'live'}</span>
          </div>
          <p className="text-slate-400 text-sm font-mono">{currency.code || 'CODE'}</p>
        </div>
      </div>
      
      <div className="mt-4 pt-4 border-t border-slate-800">
        <p className="text-xs text-slate-500 uppercase font-semibold mb-1">Description</p>
        <p className="text-slate-300 text-sm line-clamp-2">{currency.desc || 'No description provided.'}</p>
      </div>
      
      <div className="mt-4 flex justify-between items-center text-[10px] text-slate-500 font-mono">
        <span>{currency.issuer ? `${currency.issuer.slice(0, 4)}...${currency.issuer.slice(-4)}` : 'No Issuer'}</span>
        <span>{currency.contract_id ? 'Contract Linked' : 'No Contract'}</span>
      </div>
    </div>
  );
};