import { useEffect, useState } from "react";
import { useWalletStore } from "../store/walletStore";
import { LogOut, Wallet } from "lucide-react";
import { WalletModal } from "./WalletModal";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export function WalletManager() {
  const {
    isConnected,
    publicKey,
    isLoading,
    error,
    disconnectWallet,
    checkConnection,
  } = useWalletStore();
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    checkConnection();
  }, [checkConnection]);

  // Close modal when successfully connected
  useEffect(() => {
    if (isConnected) {
      setIsModalOpen(false);
    }
  }, [isConnected]);

  const handleConnect = () => {
    setIsModalOpen(true);
  };

  const truncateKey = (key: string) => {
    if (!key) return "";
    return `${key.slice(0, 4)}...${key.slice(-4)}`;
  };

  return (
    <>
      <div className="flex items-center gap-2">
        {error && !isModalOpen && (
          <span
            className="text-xs text-red-500 max-w-[150px] truncate"
            title={error}
          >
            {error}
          </span>
        )}
        {isConnected && publicKey ? (
          <div className="flex items-center gap-1">
            <Badge
              variant="secondary"
              className="font-mono text-[10px] h-7 px-2"
            >
              {truncateKey(publicKey)}
            </Badge>
            <Button
              variant="ghost"
              size="icon"
              onClick={disconnectWallet}
              className="h-7 w-7 text-muted-foreground hover:text-destructive"
              title="Disconnect Wallet"
            >
              <LogOut className="w-3.5 h-3.5" />
            </Button>
          </div>
        ) : (
          <Button
            size="sm"
            onClick={handleConnect}
            disabled={isLoading}
            className="h-8 gap-1.5"
          >
            <Wallet className="w-3.5 h-3.5" />
            {isLoading ? "Connecting..." : "Connect Wallet"}
          </Button>
        )}
      </div>

      <WalletModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </>
  );
}
