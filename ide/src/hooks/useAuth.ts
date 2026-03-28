"use client";

import { useSession, signIn, signOut } from "next-auth/react";

export function useAuth() {
  const { data: session, status } = useSession();

  return {
    user: session?.user ?? null,
    isAuthenticated: status === "authenticated",
    isLoading: status === "loading",
    isGuest: status === "unauthenticated",
    signIn: (provider?: string) => signIn(provider),
    signOut: () => signOut({ callbackUrl: "/" }),
  };
}
