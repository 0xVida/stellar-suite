"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import {
  EMPTY_STATE,
  FeatureRequestInput,
  RoadmapItem,
  RoadmapState,
  SEED_ITEMS,
  STORAGE_KEY,
  loadState,
  saveState,
} from "@/lib/roadmap";

/**
 * Module-level roadmap store backed by localStorage, exposed via
 * `useSyncExternalStore` so it is SSR-safe and consistent across components and
 * browser tabs (mirrors the identity store pattern).
 */
let store: RoadmapState | null = null;
const listeners = new Set<() => void>();
let storageBound = false;

function emit() {
  for (const listener of listeners) listener();
}

function getSnapshot(): RoadmapState {
  if (store === null) store = loadState();
  return store;
}

function getServerSnapshot(): RoadmapState {
  return EMPTY_STATE;
}

function handleStorageEvent(event: StorageEvent) {
  if (event.key === STORAGE_KEY) {
    store = loadState();
    emit();
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!storageBound && typeof window !== "undefined") {
    window.addEventListener("storage", handleStorageEvent);
    storageBound = true;
  }
  return () => {
    listeners.delete(listener);
  };
}

function setStore(updater: (prev: RoadmapState) => RoadmapState) {
  const next = updater(getSnapshot());
  if (next === store) return;
  store = next;
  saveState(next);
  emit();
}

const subscribeNoop = () => () => {};
const getTrue = () => true;
const getFalse = () => false;

export function useRoadmap() {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const isLoaded = useSyncExternalStore(subscribeNoop, getTrue, getFalse);

  // Seed items first, then the visitor's own submissions.
  const items = useMemo<RoadmapItem[]>(
    () => [...SEED_ITEMS, ...state.submitted],
    [state.submitted],
  );

  const votedIds = useMemo(() => new Set(state.votedIds), [state.votedIds]);

  /** Total votes shown = baseline + the visitor's own vote (if cast). */
  const votesFor = useCallback(
    (item: RoadmapItem) => item.baseVotes + (votedIds.has(item.id) ? 1 : 0),
    [votedIds],
  );

  const hasVoted = useCallback((id: string) => votedIds.has(id), [votedIds]);

  const toggleVote = useCallback(
    (id: string) =>
      setStore((prev) => {
        const voted = prev.votedIds.includes(id);
        return {
          ...prev,
          votedIds: voted
            ? prev.votedIds.filter((v) => v !== id)
            : [...prev.votedIds, id],
        };
      }),
    [],
  );

  const submitRequest = useCallback((input: FeatureRequestInput): RoadmapItem => {
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? `req-${crypto.randomUUID()}`
        : `req-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const item: RoadmapItem = {
      id,
      title: input.title,
      description: input.description?.trim() || undefined,
      status: "planned",
      baseVotes: 0,
      community: true,
    };
    setStore((prev) => ({
      submitted: [...prev.submitted, item],
      // The author automatically upvotes their own request.
      votedIds: [...prev.votedIds, id],
    }));
    return item;
  }, []);

  return {
    isLoaded,
    items,
    votesFor,
    hasVoted,
    toggleVote,
    submitRequest,
  };
}
