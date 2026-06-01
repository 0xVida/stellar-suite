"use client";

import { useEffect, useState } from "react";
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { NetworkKey } from "@/lib/networkConfig";
import { FeeDataService, FeeStats, LedgerFeeData, FeeRecommendation } from "@/lib/feeDataService";

interface FeeChartProps {
  network: NetworkKey;
  className?: string;
}

export function FeeChart({ network, className }: FeeChartProps) {
  const [feeHistory, setFeeHistory] = useState<LedgerFeeData[]>([]);
  const [feeStats, setFeeStats] = useState<FeeStats | null>(null);
  const [recommendations, setRecommendations] = useState<FeeRecommendation>({ low: 100, average: 100, high: 100 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadFeeData = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const feeService = FeeDataService.getInstance();
        const { history, stats } = await feeService.getHistoricalFeeStats(network, 100);
        const recs = feeService.calculateFeeRecommendations(history);
        
        setFeeHistory(history);
        setFeeStats(stats);
        setRecommendations(recs);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load fee data");
      } finally {
        setLoading(false);
      }
    };

    loadFeeData();
    
    // Refresh data every 30 seconds
    const interval = setInterval(loadFeeData, 30000);
    return () => clearInterval(interval);
  }, [network]);

  const chartData = feeHistory.map(ledger => ({
    ledger: ledger.sequence,
    fee: ledger.base_fee || 0,
    operations: ledger.operation_count,
    time: new Date(ledger.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  }));

  const currentFee = Number(feeStats?.last_ledger_base_fee ?? chartData[chartData.length - 1]?.fee ?? 100);
  const p95Fee = Number(feeStats?.fee_charged.p95 ?? recommendations.high);

  if (loading) {
    return (
      <div className={`flex h-48 items-center justify-center ${className ?? ""}`}>
        <div className="text-xs text-muted-foreground">Loading fee data...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`flex h-48 items-center justify-center ${className ?? ""}`}>
        <div className="text-xs text-red-500">Error: {error}</div>
      </div>
    );
  }

  return (
    <div className={`rounded-lg border border-slate-800 bg-slate-950/95 p-4 shadow-xl ${className ?? ""}`}>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-100">Fee Market Trends</h3>
          <p className="mt-1 text-xs text-slate-400">Last 100 ledgers from Horizon, refreshed every 30 seconds</p>
        </div>
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="rounded-md border border-emerald-500/20 bg-emerald-500/10 px-2 py-1.5">
            <div className="text-emerald-300">Low</div>
            <div className="font-mono text-slate-100">{recommendations.low}</div>
          </div>
          <div className="rounded-md border border-sky-500/20 bg-sky-500/10 px-2 py-1.5">
            <div className="text-sky-300">Current</div>
            <div className="font-mono text-slate-100">{currentFee}</div>
          </div>
          <div className="rounded-md border border-rose-500/20 bg-rose-500/10 px-2 py-1.5">
            <div className="text-rose-300">P95</div>
            <div className="font-mono text-slate-100">{p95Fee}</div>
          </div>
        </div>
      </div>
      
      <ResponsiveContainer width="100%" height={240}>
        <AreaChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="feeTrendFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.45} />
              <stop offset="95%" stopColor="#38bdf8" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
          <XAxis 
            dataKey="ledger" 
            stroke="#94a3b8"
            fontSize={10}
            tickFormatter={(value) => `${value % 1000}`}
          />
          <YAxis 
            stroke="#94a3b8"
            fontSize={10}
            tickFormatter={(value) => value >= 1000 ? `${value/1000}k` : value.toString()}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "#020617",
              border: "1px solid #334155",
              borderRadius: "8px",
              color: "#e2e8f0",
              fontSize: "12px"
            }}
            labelFormatter={(value, payload) => `Ledger #${value} ${payload?.[0]?.payload?.time ? `at ${payload[0].payload.time}` : ""}`}
            formatter={(value: any, name: string) => [
              name === "fee" ? `${value} stroops` : value,
              name === "fee" ? "Base Fee" : "Operations"
            ]}
          />
          <Area
            type="monotone"
            dataKey="fee"
            stroke="#38bdf8"
            strokeWidth={2}
            fill="url(#feeTrendFill)"
            dot={false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: "#020617", fill: "#38bdf8" }}
            name="fee"
          />
          <ReferenceLine
            y={recommendations.low}
            stroke="#10b981"
            strokeDasharray="5 5"
            strokeWidth={1}
            label={{ value: "Low", position: "left", fontSize: 10, fill: "#10b981" }}
          />
          <ReferenceLine
            y={recommendations.average}
            stroke="#f59e0b"
            strokeDasharray="5 5"
            strokeWidth={1}
            label={{ value: "Median", position: "left", fontSize: 10, fill: "#f59e0b" }}
          />
          <ReferenceLine
            y={recommendations.high}
            stroke="#ef4444"
            strokeDasharray="5 5"
            strokeWidth={1}
            label={{ value: "High", position: "left", fontSize: 10, fill: "#ef4444" }}
          />
        </AreaChart>
      </ResponsiveContainer>
      
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
        <span>Ledger capacity usage: {feeStats ? `${Number(feeStats.ledger_capacity_usage).toFixed(2)}%` : "n/a"}</span>
        <span>Values shown in stroops</span>
      </div>
    </div>
  );
}
