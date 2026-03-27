"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { NETWORK_CONFIG, NetworkKey } from "@/lib/networkConfig";
import { cn } from "@/lib/utils";
import {
  Activity,
  AlertCircle,
  CheckCircle,
  Clock,
  RefreshCw,
  Server,
  Zap,
} from "lucide-react";
import { useEffect, useState } from "react";

interface HealthResponse {
  status?: string;
  latest_ledger?: number;
  core_version?: string;
  ingest_latest_ledger?: number;
  oldest_ledger?: number;
  oldest_ledger_header?: string;
  latest_ledger_close_time?: number;
  network_ledger_version?: number;
  protocol_version?: number;
  queue_size?: number;
  current_ledger_protocol_version?: number;
  core_supported_protocol_version?: number;
  [key: string]: any;
}

interface JsonTreeNodeProps {
  data: any;
  keyName?: string;
  level?: number;
}

const JsonTreeNode: React.FC<JsonTreeNodeProps> = ({
  data,
  keyName,
  level = 0,
}) => {
  const [isExpanded, setIsExpanded] = useState(level < 2);

  const isObject = data !== null && typeof data === "object";
  const isArray = Array.isArray(data);
  const hasChildren = isObject && Object.keys(data).length > 0;

  const getIcon = () => {
    if (!isObject) return null;
    return (
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="mr-1 text-muted-foreground hover:text-foreground"
      >
        {isExpanded ? "▼" : "▶"}
      </button>
    );
  };

  const getValue = () => {
    if (data === null)
      return <span className="text-muted-foreground">null</span>;
    if (data === undefined)
      return <span className="text-muted-foreground">undefined</span>;
    if (typeof data === "string")
      return <span className="text-blue-600 dark:text-blue-400">"{data}"</span>;
    if (typeof data === "number")
      return <span className="text-green-600 dark:text-green-400">{data}</span>;
    if (typeof data === "boolean")
      return (
        <span className="text-purple-600 dark:text-purple-400">
          {data.toString()}
        </span>
      );
    return null;
  };

  const renderObject = () => {
    if (!isExpanded) {
      return (
        <span className="text-muted-foreground">
          {isArray
            ? `[${Object.keys(data).length} items]`
            : `{${Object.keys(data).length} keys}`}
        </span>
      );
    }

    return (
      <div className="ml-4">
        {isArray ? (
          <div>
            {"["}
            {Object.entries(data).map(([key, value]) => (
              <div key={key} className="ml-4">
                <JsonTreeNode data={value} level={level + 1} />
                {parseInt(key) < Object.keys(data).length - 1 && ","}
              </div>
            ))}
            {"]"}
          </div>
        ) : (
          <div>
            {"{"}
            {Object.entries(data).map(([key, value]) => (
              <div key={key} className="ml-4">
                <span className="text-blue-700 dark:text-blue-300 font-semibold">
                  "{key}"
                </span>
                : <JsonTreeNode data={value} keyName={key} level={level + 1} />
                {Object.keys(data).indexOf(key) <
                  Object.keys(data).length - 1 && ","}
              </div>
            ))}
            {"}"}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="font-mono text-sm">
      {keyName && (
        <>
          <span className="text-blue-700 dark:text-blue-300 font-semibold">
            "{keyName}"
          </span>
          :{" "}
        </>
      )}
      {getIcon()}
      {isObject ? renderObject() : getValue()}
    </div>
  );
};

export default function RpcHealthPage() {
  const [selectedNetwork, setSelectedNetwork] = useState<NetworkKey>("testnet");
  const [healthData, setHealthData] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchHealthData = async () => {
    setLoading(true);
    setError(null);

    try {
      const rpcUrl =
        selectedNetwork === "local"
          ? "http://localhost:8000"
          : NETWORK_CONFIG[selectedNetwork].horizon;

      const response = await fetch(`${rpcUrl}/health`);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      setHealthData(data);
      setLastUpdated(new Date());
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to fetch health data",
      );
      setHealthData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHealthData();
  }, [selectedNetwork]);

  const getSyncStatus = () => {
    if (!healthData) return "unknown";

    const latest = healthData.latest_ledger;
    const ingest = healthData.ingest_latest_ledger;

    if (latest === undefined || ingest === undefined) return "unknown";

    const diff = Math.abs(latest - ingest);
    if (diff <= 1) return "synced";
    if (diff <= 10) return "catching-up";
    return "out-of-sync";
  };

  const getSyncStatusIcon = () => {
    const status = getSyncStatus();
    switch (status) {
      case "synced":
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case "catching-up":
        return <Clock className="h-4 w-4 text-yellow-500" />;
      case "out-of-sync":
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      default:
        return <Activity className="h-4 w-4 text-gray-500" />;
    }
  };

  const getSyncStatusBadge = () => {
    const status = getSyncStatus();
    const variants = {
      synced: "default",
      "catching-up": "secondary",
      "out-of-sync": "destructive",
      unknown: "outline",
    } as const;

    return (
      <Badge variant={variants[status as keyof typeof variants] || "outline"}>
        {status.replace("-", " ").toUpperCase()}
      </Badge>
    );
  };

  const formatTimestamp = (timestamp?: number) => {
    if (!timestamp) return "N/A";
    return new Date(timestamp * 1000).toLocaleString();
  };

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">
          Soroban RPC Health Dashboard
        </h1>
        <p className="text-muted-foreground">
          Monitor the health and synchronization status of Stellar Soroban RPC
          endpoints
        </p>
      </div>

      <div className="mb-6 flex flex-wrap gap-4 items-center">
        <div className="flex items-center gap-2">
          <label htmlFor="network-select" className="text-sm font-medium">
            Network:
          </label>
          <select
            id="network-select"
            value={selectedNetwork}
            onChange={(e) => setSelectedNetwork(e.target.value as NetworkKey)}
            className="rounded border border-border bg-background text-foreground px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          >
            {Object.entries(NETWORK_CONFIG).map(([key, details]) => (
              <option key={key} value={key}>
                {details.label}
              </option>
            ))}
            <option value="local">Local</option>
          </select>
        </div>

        <Button
          onClick={fetchHealthData}
          disabled={loading}
          variant="outline"
          size="sm"
        >
          <RefreshCw
            className={cn("h-4 w-4 mr-2", loading && "animate-spin")}
          />
          Refresh
        </Button>

        {lastUpdated && (
          <div className="text-sm text-muted-foreground">
            Last updated: {lastUpdated.toLocaleTimeString()}
          </div>
        )}
      </div>

      {error && (
        <Card className="mb-6 border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-red-700 dark:text-red-300">
              <AlertCircle className="h-5 w-5" />
              <span className="font-medium">Error: {error}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {healthData && (
        <div className="grid gap-6">
          {/* Status Overview */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Sync Status
                </CardTitle>
                {getSyncStatusIcon()}
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{getSyncStatusBadge()}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Latest Ledger
                </CardTitle>
                <Server className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {healthData.latest_ledger?.toLocaleString() || "N/A"}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Ingest Ledger
                </CardTitle>
                <Activity className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {healthData.ingest_latest_ledger?.toLocaleString() || "N/A"}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Queue Size
                </CardTitle>
                <Zap className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {healthData.queue_size?.toLocaleString() || "N/A"}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Detailed Metrics */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Protocol Information</CardTitle>
                <CardDescription>
                  Current protocol versions and network details
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="font-medium text-muted-foreground">
                      Core Version:
                    </span>
                    <div className="font-mono">
                      {healthData.core_version || "N/A"}
                    </div>
                  </div>
                  <div>
                    <span className="font-medium text-muted-foreground">
                      Protocol Version:
                    </span>
                    <div className="font-mono">
                      {healthData.protocol_version || "N/A"}
                    </div>
                  </div>
                  <div>
                    <span className="font-medium text-muted-foreground">
                      Current Ledger Protocol:
                    </span>
                    <div className="font-mono">
                      {healthData.current_ledger_protocol_version || "N/A"}
                    </div>
                  </div>
                  <div>
                    <span className="font-medium text-muted-foreground">
                      Core Supported Protocol:
                    </span>
                    <div className="font-mono">
                      {healthData.core_supported_protocol_version || "N/A"}
                    </div>
                  </div>
                  <div>
                    <span className="font-medium text-muted-foreground">
                      Network Ledger Version:
                    </span>
                    <div className="font-mono">
                      {healthData.network_ledger_version || "N/A"}
                    </div>
                  </div>
                  <div>
                    <span className="font-medium text-muted-foreground">
                      Oldest Ledger:
                    </span>
                    <div className="font-mono">
                      {healthData.oldest_ledger?.toLocaleString() || "N/A"}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Timing Information</CardTitle>
                <CardDescription>
                  Ledger close times and synchronization data
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 gap-4 text-sm">
                  <div>
                    <span className="font-medium text-muted-foreground">
                      Latest Close Time:
                    </span>
                    <div className="font-mono">
                      {formatTimestamp(healthData.latest_ledger_close_time)}
                    </div>
                  </div>
                  <div>
                    <span className="font-medium text-muted-foreground">
                      Ledger Gap:
                    </span>
                    <div className="font-mono">
                      {healthData.latest_ledger &&
                      healthData.ingest_latest_ledger
                        ? Math.abs(
                            healthData.latest_ledger -
                              healthData.ingest_latest_ledger,
                          ).toLocaleString()
                        : "N/A"}{" "}
                      ledgers
                    </div>
                  </div>
                  <div>
                    <span className="font-medium text-muted-foreground">
                      Status:
                    </span>
                    <div className="font-mono">
                      {healthData.status || "N/A"}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Raw JSON Response */}
          <Card>
            <CardHeader>
              <CardTitle>Raw Health Response</CardTitle>
              <CardDescription>
                Complete JSON response from the /health endpoint
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-96 w-full border rounded p-4 bg-muted/50">
                <JsonTreeNode data={healthData} />
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
