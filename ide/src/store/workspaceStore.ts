import {
  DEFAULT_CUSTOM_RPC,
  NETWORK_CONFIG,
  NetworkKey,
} from "@/lib/networkConfig";
import { FileNode, sampleContracts } from "@/lib/sample-contracts";
import { create } from "zustand";
import { persist } from "zustand/middleware";

interface TabInfo {
  path: string[];
  name: string;
}

export type MobilePanel =
  | "none"
  | "explorer"
  | "interact"
  | "deployments"
  | "identities";
export type SidebarTab = "explorer" | "deployments" | "identities" | "search";
export type BuildState = "idle" | "building" | "success" | "error";

interface WorkspaceState {
  // File System State
  files: FileNode[];
  openTabs: TabInfo[];
  activeTabPath: string[];
  unsavedFiles: Set<string>;

  // Network State
  network: NetworkKey;
  horizonUrl: string;
  networkPassphrase: string;
  customRpcUrl: string;
  customHeaders: CustomHeaders;

  // UI Layout State
  terminalExpanded: boolean;
  terminalOutput: string;
  isCompiling: boolean;
  buildState: BuildState;
  contractId: string | null;
  showExplorer: boolean;
  showPanel: boolean;
  cursorPos: { line: number; col: number };
  saveStatus: string;
  mobilePanel: MobilePanel;
  isExplorerDragActive: boolean;
  leftSidebarTab: SidebarTab;

  // Hydration State
  hydrationComplete: boolean;

  // File Actions
  setFiles: (files: FileNode[]) => void;
  setActiveTabPath: (path: string[]) => void;
  setOpenTabs: (tabs: TabInfo[]) => void;
  addTab: (path: string[], name: string) => void;
  closeTab: (path: string[]) => void;
  updateFileContent: (path: string[], content: string) => void;
  markSaved: (path: string[]) => void;
  createFile: (parentPath: string[], name: string, content?: string) => void;
  createFolder: (parentPath: string[], name: string) => void;
  deleteNode: (path: string[]) => void;
  renameNode: (path: string[], newName: string) => void;

  // Network Actions
  setNetwork: (network: NetworkKey) => void;
  setHorizonUrl: (url: string) => void;
  setNetworkPassphrase: (passphrase: string) => void;
  setCustomRpcUrl: (url: string) => void;
  setCustomHeaders: (headers: CustomHeaders) => void;

  // UI Actions
  setTerminalExpanded: (
    expanded: boolean | ((prev: boolean) => boolean),
  ) => void;
  setTerminalOutput: (output: string | ((prev: string) => string)) => void;
  setIsCompiling: (isCompiling: boolean) => void;
  setBuildState: (state: BuildState) => void;
  setContractId: (id: string | null) => void;
  setShowExplorer: (show: boolean) => void;
  setShowPanel: (show: boolean) => void;
  setCursorPos: (pos: { line: number; col: number }) => void;
  setSaveStatus: (status: string) => void;
  setMobilePanel: (panel: MobilePanel) => void;
  setIsExplorerDragActive: (active: boolean) => void;
  setLeftSidebarTab: (tab: SidebarTab) => void;
  appendTerminalOutput: (chunk: string) => void;

  // Misc Actions
  setHydrationComplete: (ready: boolean) => void;
}

const cloneFiles = (files: FileNode[]): FileNode[] =>
  JSON.parse(JSON.stringify(files));

const findNode = (nodes: FileNode[], pathParts: string[]): FileNode | null => {
  for (const node of nodes) {
    if (node.name === pathParts[0]) {
      if (pathParts.length === 1) return node;
      if (node.children) return findNode(node.children, pathParts.slice(1));
    }
  }
  return null;
};

const findParent = (
  nodes: FileNode[],
  pathParts: string[],
): FileNode[] | null => {
  if (pathParts.length <= 1) return nodes;
  const parent = findNode(nodes, pathParts.slice(0, -1));
  return parent?.children ?? null;
};

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set, get) => ({
      // Initial File State
      files: cloneFiles(sampleContracts),
      openTabs: [{ path: ["hello_world", "lib.rs"], name: "lib.rs" }],
      activeTabPath: ["hello_world", "lib.rs"],
      unsavedFiles: new Set<string>(),

      // Initial Network State
      network: "testnet",
      horizonUrl: NETWORK_CONFIG.testnet.horizon,
      networkPassphrase: NETWORK_CONFIG.testnet.passphrase,
      customRpcUrl: DEFAULT_CUSTOM_RPC,
      customHeaders: {},

      // Initial UI State
      terminalExpanded: true,
      terminalOutput: "",
      isCompiling: false,
      buildState: "idle",
      contractId: null,
      showExplorer: true,
      showPanel: true,
      cursorPos: { line: 1, col: 1 },
      saveStatus: "",
      mobilePanel: "none",
      isExplorerDragActive: false,
      leftSidebarTab: "explorer",

      // Initial Hydration State
      hydrationComplete: false,

      // File Actions Implementation
      setFiles: (files) => set({ files }),
      setActiveTabPath: (path) => set({ activeTabPath: path }),
      setOpenTabs: (tabs) => set({ openTabs: tabs }),
      addTab: (path, name) => {
        const key = path.join("/");
        const { openTabs } = get();
        if (!openTabs.some((t) => t.path.join("/") === key)) {
          set({ openTabs: [...openTabs, { path, name }] });
        }
        set({ activeTabPath: path });
      },
      closeTab: (path) => {
        const key = path.join("/");
        const { openTabs, activeTabPath, unsavedFiles } = get();
        const nextTabs = openTabs.filter((t) => t.path.join("/") !== key);
        let nextActivePath = activeTabPath;
        if (activeTabPath.join("/") === key && nextTabs.length > 0) {
          nextActivePath = nextTabs[nextTabs.length - 1].path;
        } else if (nextTabs.length === 0) {
          nextActivePath = [];
        }
        const nextUnsaved = new Set(unsavedFiles);
        nextUnsaved.delete(key);
        set({
          openTabs: nextTabs,
          activeTabPath: nextActivePath,
          unsavedFiles: nextUnsaved,
        });
      },
      updateFileContent: (path, content) => {
        const key = path.join("/");
        const { files, unsavedFiles } = get();
        const nextFiles = cloneFiles(files);
        const node = findNode(nextFiles, path);
        if (node) {
          node.content = content;
          const nextUnsaved = new Set(unsavedFiles);
          nextUnsaved.add(key);
          set({ files: nextFiles, unsavedFiles: nextUnsaved });
        }
      },
      markSaved: (path) => {
        const key = path.join("/");
        const { unsavedFiles } = get();
        const nextUnsaved = new Set(unsavedFiles);
        nextUnsaved.delete(key);
        set({ unsavedFiles: nextUnsaved });
      },
      createFile: (parentPath, name, content = "") => {
        const { files } = get();
        const nextFiles = cloneFiles(files);
        const parent =
          parentPath.length === 0
            ? nextFiles
            : findNode(nextFiles, parentPath)?.children;
        if (parent) {
          parent.push({
            name,
            type: "file",
            language: name.endsWith(".rs")
              ? "rust"
              : name.endsWith(".toml")
                ? "toml"
                : "text",
            content,
          });
          set({ files: nextFiles });
          get().addTab([...parentPath, name], name);
        }
      },
      createFolder: (parentPath, name) => {
        const { files } = get();
        const nextFiles = cloneFiles(files);
        const parent =
          parentPath.length === 0
            ? nextFiles
            : findNode(nextFiles, parentPath)?.children;
        if (parent) {
          parent.push({ name, type: "folder", children: [] });
          set({ files: nextFiles });
        }
      },
      deleteNode: (path) => {
        const { files } = get();
        const nextFiles = cloneFiles(files);
        const parent = findParent(nextFiles, path);
        if (parent) {
          const idx = parent.findIndex((n) => n.name === path[path.length - 1]);
          if (idx !== -1) {
            parent.splice(idx, 1);
            set({ files: nextFiles });
            get().closeTab(path);
          }
        }
      },
      renameNode: (path, newName) => {
        const { files, openTabs, activeTabPath } = get();
        const oldKey = path.join("/");
        const nextPath = [...path.slice(0, -1), newName];
        const nextFiles = cloneFiles(files);
        const node = findNode(nextFiles, path);
        if (node) {
          node.name = newName;
          const nextTabs = openTabs.map((t) => {
            const tKey = t.path.join("/");
            if (tKey === oldKey || tKey.startsWith(oldKey + "/")) {
              const updatedPath = [...nextPath, ...t.path.slice(path.length)];
              return {
                ...t,
                path: updatedPath,
                name: updatedPath[updatedPath.length - 1],
              };
            }
            return t;
          });
          let nextActivePath = activeTabPath;
          if (
            activeTabPath.join("/") === oldKey ||
            activeTabPath.join("/").startsWith(oldKey + "/")
          ) {
            nextActivePath = [...nextPath, ...activeTabPath.slice(path.length)];
          }
          set({
            files: nextFiles,
            openTabs: nextTabs,
            activeTabPath: nextActivePath,
          });
        }
      },

      // Network Actions Implementation
      setNetwork: (network) => {
        const config = NETWORK_CONFIG[network] || NETWORK_CONFIG.testnet;
        const currentCustomRpc = get().customRpcUrl || DEFAULT_CUSTOM_RPC;
        const horizonUrl =
          network === "local" ? currentCustomRpc : config.horizon;
        set({
          network,
          horizonUrl,
          networkPassphrase: config.passphrase,
        });
      },
      setHorizonUrl: (url) => set({ horizonUrl: url }),
      setNetworkPassphrase: (passphrase) =>
        set({ networkPassphrase: passphrase }),
      setCustomRpcUrl: (customRpcUrl) => {
        set({ customRpcUrl });
        if (get().network === "local") {
          set({ horizonUrl: customRpcUrl });
        }
      },
      setCustomHeaders: (customHeaders) => set({ customHeaders }),

      // UI Actions Implementation
      setTerminalExpanded: (expanded) =>
        set((state) => ({
          terminalExpanded:
            typeof expanded === "function"
              ? expanded(state.terminalExpanded)
              : expanded,
        })),
      setTerminalOutput: (output) =>
        set((state) => ({
          terminalOutput:
            typeof output === "function"
              ? output(state.terminalOutput)
              : output,
        })),
      setIsCompiling: (isCompiling) => set({ isCompiling }),
      setBuildState: (buildState) => set({ buildState }),
      setContractId: (contractId) => set({ contractId }),
      setShowExplorer: (showExplorer) => set({ showExplorer }),
      setShowPanel: (showPanel) => set({ showPanel }),
      setCursorPos: (cursorPos) => set({ cursorPos }),
      setSaveStatus: (saveStatus) => set({ saveStatus }),
      setMobilePanel: (mobilePanel) => set({ mobilePanel }),
      setIsExplorerDragActive: (isExplorerDragActive) =>
        set({ isExplorerDragActive }),
      setLeftSidebarTab: (leftSidebarTab) => set({ leftSidebarTab }),
      appendTerminalOutput: (chunk) =>
        set((state) => ({ terminalOutput: state.terminalOutput + chunk })),

      // Misc Actions Implementation
      setHydrationComplete: (ready) => set({ hydrationComplete: ready }),
    }),
    {
      name: "stellar-suite-workspace-store",
      partialize: (state) => ({
        network: state.network,
        customRpcUrl: state.customRpcUrl,
        customHeaders: state.customHeaders,
        showExplorer: state.showExplorer,
        showPanel: state.showPanel,
        terminalExpanded: state.terminalExpanded,
        files: state.files,
        openTabs: state.openTabs,
        activeTabPath: state.activeTabPath,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.setHydrationComplete(true);
        }
      },
    },
  ),
);
