import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Activity, Network, Server, TrendingUp } from "lucide-react";
import {
  useNetworkOverview,
  type NetworkOverviewInfo,
} from "@/hooks/queries";

export default function NetworkStatus() {
  const {
    data: networks = [],
    isLoading: loading,
    error: queryError,
    dataUpdatedAt,
  } = useNetworkOverview();

  const error = queryError ? "Failed to fetch network data" : null;
  const lastUpdated = dataUpdatedAt ? new Date(dataUpdatedAt) : new Date();

  const getStatusBadge = (status: NetworkOverviewInfo["status"]) => {
    switch (status) {
      case "online":
        return (
          <Badge className="bg-green-500 hover:bg-green-600">Online</Badge>
        );
      case "offline":
        return <Badge variant="destructive">Offline</Badge>;
      case "error":
        return <Badge variant="destructive">Error</Badge>;
    }
  };

  const getNetworkIcon = (name: string) => {
    switch (name) {
      case "Mainnet":
        return <Server className="h-5 w-5" />;
      case "Testnet":
        return <Activity className="h-5 w-5" />;
      case "Futurenet":
        return <TrendingUp className="h-5 w-5" />;
      default:
        return <Network className="h-5 w-5" />;
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Network Status Dashboard</h1>
          <Skeleton className="h-6 w-32" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-6 w-24" />
                <Skeleton className="h-4 w-16" />
              </CardHeader>
              <CardContent className="space-y-4">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Network className="h-8 w-8" />
            Network Status Dashboard
          </h1>
          <p className="text-muted-foreground">
            Real-time status and comparison of Stellar networks
          </p>
        </div>
        <div className="text-sm text-muted-foreground">
          Last updated: {lastUpdated.toLocaleTimeString()}
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Network Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {networks.map((network) => (
          <Card key={network.name} className="relative overflow-hidden">
            <div
              className={`absolute top-0 left-0 w-full h-1 ${network.color}`}
            />
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {getNetworkIcon(network.name)}
                  <CardTitle className="text-lg">{network.name}</CardTitle>
                </div>
                {getStatusBadge(network.status)}
              </div>
              <CardDescription>{network.passphrase}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    Ledger Height
                  </p>
                  <p className="text-2xl font-bold">
                    {network.ledgerHeight.toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    Protocol Version
                  </p>
                  <p className="text-2xl font-bold">
                    {network.protocolVersion}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">
                  Core Version
                </p>
                <p className="text-sm font-mono bg-muted px-2 py-1 rounded">
                  {network.latestVersion}
                </p>
              </div>

              {network.feeStats && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">
                    Fee Stats (stroops)
                  </p>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div className="text-center">
                      <p className="font-mono font-bold">
                        {network.feeStats.min}
                      </p>
                      <p className="text-muted-foreground">Min</p>
                    </div>
                    <div className="text-center">
                      <p className="font-mono font-bold">
                        {network.feeStats.avg}
                      </p>
                      <p className="text-muted-foreground">Avg</p>
                    </div>
                    <div className="text-center">
                      <p className="font-mono font-bold">
                        {network.feeStats.max}
                      </p>
                      <p className="text-muted-foreground">Max</p>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Protocol Version Comparison Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Server className="h-5 w-5" />
            Protocol Version Comparison
          </CardTitle>
          <CardDescription>
            Compare protocol versions and network metrics across all networks
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Network</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Ledger Height</TableHead>
                <TableHead>Protocol Version</TableHead>
                <TableHead>Core Version</TableHead>
                <TableHead>Base Reserve</TableHead>
                <TableHead>Min Fee</TableHead>
                <TableHead>Max Fee</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {networks.map((network) => (
                <TableRow key={network.name}>
                  <TableCell className="font-medium">{network.name}</TableCell>
                  <TableCell>{getStatusBadge(network.status)}</TableCell>
                  <TableCell className="font-mono">
                    {network.ledgerHeight.toLocaleString()}
                  </TableCell>
                  <TableCell className="font-mono">
                    {network.protocolVersion}
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    {network.latestVersion}
                  </TableCell>
                  <TableCell className="font-mono">
                    {network.baseReserve
                      ? (network.baseReserve / 10000000).toFixed(7)
                      : "N/A"}{" "}
                    XLM
                  </TableCell>
                  <TableCell className="font-mono">
                    {network.feeStats ? network.feeStats.min : "N/A"}
                  </TableCell>
                  <TableCell className="font-mono">
                    {network.feeStats ? network.feeStats.max : "N/A"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Network Health Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Network Health Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="text-center p-4 bg-green-50 rounded-lg dark:bg-green-950">
              <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                {networks.filter((n) => n.status === "online").length}
              </div>
              <p className="text-sm text-muted-foreground">Networks Online</p>
            </div>
            <div className="text-center p-4 bg-blue-50 rounded-lg dark:bg-blue-950">
              <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                {Math.max(
                  ...networks.map((n) => n.ledgerHeight),
                ).toLocaleString()}
              </div>
              <p className="text-sm text-muted-foreground">Highest Ledger</p>
            </div>
            <div className="text-center p-4 bg-purple-50 rounded-lg dark:bg-purple-950">
              <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                {new Set(networks.map((n) => n.protocolVersion)).size}
              </div>
              <p className="text-sm text-muted-foreground">Protocol Versions</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
