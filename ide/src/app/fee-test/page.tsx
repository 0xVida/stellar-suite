"use client";

import { FeeChart } from "@/components/ide/FeeChart";
import { NetworkKey } from "@/lib/networkConfig";

export default function FeeTestPage() {
  return (
    <div className="p-8 min-h-screen bg-background">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold mb-6">Fee Market Test</h1>

        <div className="space-y-6">
          <div className="bg-card p-4 rounded-lg border">
            <h2 className="text-lg font-semibold mb-4">Testnet Fees</h2>
            <FeeChart network="testnet" />
          </div>

          <div className="bg-card p-4 rounded-lg border">
            <h2 className="text-lg font-semibold mb-4">Mainnet Fees</h2>
            <FeeChart network="mainnet" />
          </div>
        </div>
      </div>
    </div>
  );
}
