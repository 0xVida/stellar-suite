import React from "react";
import { useWalletStore } from "../store/walletStore";
import { WalletProviderType } from "../wallet/WalletService";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface WalletModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function WalletModal({ isOpen, onClose }: WalletModalProps) {
  const { connectWallet, isLoading, error, walletType, isConnected } =
    useWalletStore();

  const handleConnect = async (type: WalletProviderType) => {
    await connectWallet(type);
    const state = useWalletStore.getState();
    if (!state.error && state.isConnected) {
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md border-primary/20 bg-primary/10 backdrop-blur-md">
        <DialogHeader>
          <DialogTitle>Connect Wallet</DialogTitle>
          <DialogDescription>
            Select a wallet provider to connect to the Stellar network.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm text-center border border-destructive/20">
            {error}
          </div>
        )}

        <div className="grid gap-4 py-4">
          <Button
            variant="outline"
            className="flex items-center justify-between h-auto p-4 border-primary/20 bg-card hover:bg-primary/20 hover:text-foreground transition-colors"
            onClick={() => handleConnect("freighter")}
            disabled={isLoading}
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-500 font-bold text-xl">
                F
              </div>
              <span className="font-medium">Freighter</span>
            </div>
            {isLoading && walletType === "freighter" && (
              <Loader2 className="h-4 w-4 animate-spin" />
            )}
          </Button>

          <Button
            variant="outline"
            className="flex items-center justify-between h-auto p-4 border-primary/20 bg-card hover:bg-primary/20 hover:text-foreground transition-colors"
            onClick={() => handleConnect("albedo")}
            disabled={isLoading}
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-purple-500/20 flex items-center justify-center text-purple-500 font-bold text-xl">
                A
              </div>
              <span className="font-medium">Albedo</span>
            </div>
            {isLoading && walletType === "albedo" && (
              <Loader2 className="h-4 w-4 animate-spin" />
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
