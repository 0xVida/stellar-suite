import {
  CustomHeaders,
  DEFAULT_CUSTOM_RPC,
  NETWORK_CONFIG,
  NetworkKey,
} from "@/lib/networkConfig";

interface NetworkSelectorProps {
  network: NetworkKey;
  horizonUrl: string;
  customRpcUrl: string;
  customHeaders: CustomHeaders;
  onNetworkChange: (network: NetworkKey) => void;
  onCustomRpcUrlChange: (url: string) => void;
  onCustomHeadersChange: (headers: CustomHeaders) => void;
}

export function NetworkSelector({
  network,
  horizonUrl,
  customRpcUrl,
  customHeaders,
  onNetworkChange,
  onCustomRpcUrlChange,
  onCustomHeadersChange,
}: NetworkSelectorProps) {
  const [showHeaders, setShowHeaders] = useState(false);

  return (
    <div className="flex items-center gap-2 relative">
      <label
        htmlFor="network-select"
        className="text-[10px] text-muted-foreground font-mono"
      >
        Network
      </label>

      <select
        id="network-select"
        value={network}
        onChange={(e) => onNetworkChange(e.target.value as NetworkKey)}
        className="text-xs rounded border border-border bg-secondary text-foreground px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary"
      >
        {Object.entries(NETWORK_CONFIG).map(([key, details]) => (
          <option key={key} value={key}>
            {details.label}
          </option>
        ))}
        <option value="local">Local</option>
      </select>

      {network === "local" && (
        <input
          type="text"
          aria-label="Local RPC endpoint"
          placeholder={DEFAULT_CUSTOM_RPC}
          value={customRpcUrl}
          onChange={(e) => onCustomRpcUrlChange(e.target.value)}
          className="text-xs rounded border border-border bg-secondary text-foreground px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary"
          style={{ minWidth: 220 }}
        />
      )}

      <span className="text-[10px] text-muted-foreground font-mono">
        Horizon: {horizonUrl}
      </span>

      <button
        onClick={() => setShowHeaders(!showHeaders)}
        className="text-xs px-2 py-1 rounded border border-border bg-secondary text-foreground hover:bg-secondary/80"
        title="Configure custom headers"
      >
        {showHeaders ? "Hide Headers" : "Show Headers"}
      </button>

      {showHeaders && (
        <div className="absolute top-full mt-2 left-0 right-0 bg-background border border-border rounded-md shadow-lg p-3 z-50">
          <div className="text-xs font-semibold text-foreground mb-2">
            Custom RPC Headers
          </div>
          <NetworkHeaderEditor
            headers={customHeaders}
            onHeadersChange={onCustomHeadersChange}
          />
        </div>
      )}
    </div>
  );
}
