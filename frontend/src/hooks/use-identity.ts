"use client";

import { useCallback, useSyncExternalStore } from "react";
import {
  EMPTY_IDENTITY,
  Identity,
  LinkedStellarAccount,
  ProfileFields,
  STORAGE_KEY,
  loadIdentity,
  saveIdentity,
} from "@/lib/identity";

/**
 * Module-level identity store backed by localStorage.
 *
 * Exposed through `useSyncExternalStore` so it is SSR-safe (server renders the
 * empty identity, the client re-renders with persisted data after hydration),
 * stays consistent across every component that reads it, and syncs across tabs
 * via the `storage` event — all without `setState`-in-effect.
 */
let store: Identity | null = null;
const listeners = new Set<() => void>();
let storageBound = false;

function emit() {
  for (const listener of listeners) listener();
}

function getSnapshot(): Identity {
  if (store === null) store = loadIdentity();
  return store;
}

function getServerSnapshot(): Identity {
  return EMPTY_IDENTITY;
}

function handleStorageEvent(event: StorageEvent) {
  if (event.key === STORAGE_KEY) {
    store = loadIdentity();
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

/** Replace the store with a new identity, persist it, and notify subscribers. */
function setStore(updater: (prev: Identity) => Identity) {
  const next = updater(getSnapshot());
  if (next === store) return;
  store = next;
  saveIdentity(next);
  emit();
}

// `isLoaded` flips from false (server/hydration) to true on the client, so the
// UI can avoid initialising forms from the empty server snapshot.
const subscribeNoop = () => () => {};
const getTrue = () => true;
const getFalse = () => false;

export function useIdentity() {
  const identity = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const isLoaded = useSyncExternalStore(subscribeNoop, getTrue, getFalse);

  const updateProfile = useCallback(
    (fields: ProfileFields) => setStore((prev) => ({ ...prev, ...fields })),
    [],
  );

  const linkGithub = useCallback(
    (username: string) => setStore((prev) => ({ ...prev, github: username })),
    [],
  );

  const unlinkGithub = useCallback(
    () => setStore((prev) => ({ ...prev, github: null })),
    [],
  );

  const addStellarAccount = useCallback(
    (address: string, label?: string) =>
      setStore((prev) => {
        if (prev.stellarAccounts.some((a) => a.address === address)) return prev;
        const account: LinkedStellarAccount = {
          address,
          label: label || undefined,
          // The first account added becomes the primary one.
          primary: prev.stellarAccounts.length === 0,
        };
        return { ...prev, stellarAccounts: [...prev.stellarAccounts, account] };
      }),
    [],
  );

  const removeStellarAccount = useCallback(
    (address: string) =>
      setStore((prev) => {
        const remaining = prev.stellarAccounts.filter((a) => a.address !== address);
        // If we removed the primary, promote the first remaining account.
        if (remaining.length > 0 && !remaining.some((a) => a.primary)) {
          remaining[0] = { ...remaining[0], primary: true };
        }
        return { ...prev, stellarAccounts: remaining };
      }),
    [],
  );

  const setPrimaryStellarAccount = useCallback(
    (address: string) =>
      setStore((prev) => ({
        ...prev,
        stellarAccounts: prev.stellarAccounts.map((a) => ({
          ...a,
          primary: a.address === address,
        })),
      })),
    [],
  );

  return {
    identity,
    isLoaded,
    updateProfile,
    linkGithub,
    unlinkGithub,
    addStellarAccount,
    removeStellarAccount,
    setPrimaryStellarAccount,
  };
}
