import { beforeEach, describe, expect, it } from "vitest";

import {
  TRASH_RETENTION_DAYS,
  useMultiRootStore,
  type WorkspaceRoot,
} from "@/store/useMultiRootStore";

const createRoot = (id: string, name: string): WorkspaceRoot => ({
  id,
  name,
  files: [],
  buildContext: { network: "testnet", contractId: null },
});

describe("useMultiRootStore trash lifecycle", () => {
  beforeEach(() => {
    localStorage.removeItem("stellar-suite-multi-root-store");
    useMultiRootStore.setState({
      roots: [createRoot("root-a", "alpha"), createRoot("root-b", "beta")],
      trash: [],
    });
  });

  it("moves deleted project to trash instead of hard deleting", () => {
    const { removeRoot } = useMultiRootStore.getState();
    removeRoot("root-a");

    const { roots, trash } = useMultiRootStore.getState();
    expect(roots.map((r) => r.id)).toEqual(["root-b"]);
    expect(trash).toHaveLength(1);
    expect(trash[0]?.id).toBe("root-a");
    expect(new Date(trash[0]?.deletedAt ?? "").toString()).not.toBe("Invalid Date");
  });

  it("restores a trashed project back to active projects", () => {
    const { removeRoot, restoreRoot } = useMultiRootStore.getState();
    removeRoot("root-a");
    restoreRoot("root-a");

    const { roots, trash } = useMultiRootStore.getState();
    expect(roots.map((r) => r.id).sort()).toEqual(["root-a", "root-b"]);
    expect(trash).toHaveLength(0);
  });

  it("purges projects that exceed retention window", () => {
    const staleDate = new Date(
      Date.now() - (TRASH_RETENTION_DAYS + 2) * 24 * 60 * 60 * 1000,
    ).toISOString();

    useMultiRootStore.setState((state) => ({
      ...state,
      trash: [
        ...state.trash,
        {
          ...createRoot("root-stale", "stale"),
          deletedAt: staleDate,
        },
      ],
    }));

    useMultiRootStore.getState().purgeExpiredTrash();

    const { trash } = useMultiRootStore.getState();
    expect(trash.find((item) => item.id === "root-stale")).toBeUndefined();
  });
});
