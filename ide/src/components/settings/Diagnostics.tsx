"use client";

import React, { useEffect, useState, useRef } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { set, get, del } from "idb-keyval";

interface MetricData {
  time: string;
  fps: number;
  memoryMb: number;
  fsLatencyMs: number;
}

export function Diagnostics() {
  const [data, setData] = useState<MetricData[]>([]);
  const requestRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(performance.now());
  const frameCountRef = useRef<number>(0);
  const lastSampleTimeRef = useRef<number>(performance.now());
  const [currentMemory, setCurrentMemory] = useState<number>(0);
  const [currentFps, setCurrentFps] = useState<number>(0);
  const [currentFsLatency, setCurrentFsLatency] = useState<number>(0);

  useEffect(() => {
    let unmounted = false;

    const measureMemory = async () => {
      let memoryMb = 0;
      try {
        if ("measureUserAgentSpecificMemory" in performance) {
          // @ts-ignore
          const result = await performance.measureUserAgentSpecificMemory();
          memoryMb = result.bytes / 1024 / 1024;
        } else if ("memory" in performance) {
          // Fallback for Chrome
          // @ts-ignore
          memoryMb = performance.memory.usedJSHeapSize / 1024 / 1024;
        }
      } catch (e) {
        // Ignore error
      }
      return memoryMb;
    };

    const measureFsLatency = async () => {
      try {
        const start = performance.now();
        await set("perf-test-latency", "test");
        await get("perf-test-latency");
        await del("perf-test-latency");
        return performance.now() - start;
      } catch (e) {
        return 0;
      }
    };

    const animate = async (time: number) => {
      if (unmounted) return;

      frameCountRef.current += 1;
      const deltaTime = time - lastTimeRef.current;

      // Sample every second
      if (deltaTime >= 1000) {
        const fps = Math.round((frameCountRef.current * 1000) / deltaTime);
        const mem = await measureMemory();
        const fsLatency = await measureFsLatency();

        setCurrentFps(fps);
        setCurrentMemory(mem);
        setCurrentFsLatency(fsLatency);

        setData((prev) => {
          const newData = [...prev, {
            time: new Date().toLocaleTimeString(undefined, {
              hour12: false,
              second: "2-digit",
              minute: "2-digit"
            }),
            fps,
            memoryMb: Math.round(mem * 10) / 10,
            fsLatencyMs: Math.round(fsLatency * 10) / 10
          }];
          return newData.slice(-30); // Keep last 30 seconds
        });

        frameCountRef.current = 0;
        lastTimeRef.current = time;
      }

      requestRef.current = requestAnimationFrame(animate);
    };

    requestRef.current = requestAnimationFrame(animate);

    return () => {
      unmounted = true;
      cancelAnimationFrame(requestRef.current);
    };
  }, []);

  return (
    <div className="space-y-6 text-sm">
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-lg border border-border p-4 bg-muted/20">
          <div className="text-muted-foreground text-xs font-semibold uppercase tracking-wider mb-1">Current FPS</div>
          <div className="text-2xl font-mono text-primary flex items-baseline gap-1">
            {currentFps} <span className="text-xs text-muted-foreground">frames/sec</span>
          </div>
        </div>
        <div className="rounded-lg border border-border p-4 bg-muted/20">
          <div className="text-muted-foreground text-xs font-semibold uppercase tracking-wider mb-1">JS Heap Size</div>
          <div className="text-2xl font-mono text-primary flex items-baseline gap-1">
            {currentMemory.toFixed(1)} <span className="text-xs text-muted-foreground">MB</span>
          </div>
        </div>
        <div className="rounded-lg border border-border p-4 bg-muted/20">
          <div className="text-muted-foreground text-xs font-semibold uppercase tracking-wider mb-1">FS Latency</div>
          <div className="text-2xl font-mono text-primary flex items-baseline gap-1">
            {currentFsLatency.toFixed(1)} <span className="text-xs text-muted-foreground">ms</span>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Performance Over Time (Last 30s)</h3>
        <div className="h-48 rounded-lg border border-border bg-muted/10 p-2">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data}>
              <XAxis dataKey="time" stroke="hsl(var(--muted-foreground))" fontSize={10} tickMargin={8} />
              <YAxis yAxisId="left" stroke="hsl(var(--primary))" fontSize={10} domain={[0, 60]} tickFormatter={(val) => `${val} fps`} />
              <YAxis yAxisId="right" orientation="right" stroke="hsl(var(--success))" fontSize={10} domain={['auto', 'auto']} tickFormatter={(val) => `${val} MB`} />
              <YAxis yAxisId="latency" orientation="right" stroke="hsl(var(--destructive))" fontSize={10} domain={['auto', 'auto']} hide />
              <Tooltip 
                contentStyle={{ backgroundColor: 'hsl(var(--popover))', borderColor: 'hsl(var(--border))', fontSize: '12px' }}
                itemStyle={{ color: 'hsl(var(--foreground))' }}
              />
              <Area yAxisId="left" type="monotone" dataKey="fps" stroke="hsl(var(--primary))" fill="hsl(var(--primary)/0.2)" name="FPS" isAnimationActive={false} />
              <Area yAxisId="right" type="monotone" dataKey="memoryMb" stroke="hsl(var(--success))" fill="hsl(var(--success)/0.2)" name="Memory" isAnimationActive={false} />
              <Area yAxisId="latency" type="monotone" dataKey="fsLatencyMs" stroke="hsl(var(--destructive))" fill="hsl(var(--destructive)/0.2)" name="FS Latency" isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
      
      <p className="text-xs text-muted-foreground italic">
        Note: Metrics are only collected while this diagnostics tab is open to prevent unnecessary overhead.
      </p>
    </div>
  );
}
