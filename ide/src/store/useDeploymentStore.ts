import { create } from "zustand";

export type DeploymentStep =
  | "idle"
  | "simulating"
  | "signing"
  | "uploading"
  | "instantiating"
  | "success"
  | "error";

interface DeploymentStore {
  isDeployModalOpen: boolean;
  deploymentStep: DeploymentStep;
  deploymentError: string | null;

  openDeployModal: () => void;
  closeDeployModal: () => void;
  setDeploymentStep: (step: DeploymentStep) => void;
  setDeploymentError: (error: string | null) => void;
  resetDeployment: () => void;
}

export const useDeploymentStore = create<DeploymentStore>()((set) => ({
  isDeployModalOpen: false,
  deploymentStep: "idle",
  deploymentError: null,

  openDeployModal: () => set({ isDeployModalOpen: true }),

  closeDeployModal: () =>
    set({ isDeployModalOpen: false }),

  setDeploymentStep: (step) => set({ deploymentStep: step }),

  setDeploymentError: (error) => set({ deploymentError: error }),

  resetDeployment: () =>
    set({
      isDeployModalOpen: false,
      deploymentStep: "idle",
      deploymentError: null,
    }),
}));
