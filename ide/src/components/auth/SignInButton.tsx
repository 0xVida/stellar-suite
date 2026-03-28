"use client";

import { Github, Loader2, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/useAuth";

export function SignInButton() {
  const { isLoading, signIn } = useAuth();

  if (isLoading) {
    return (
      <button
        disabled
        className="flex items-center gap-1.5 rounded bg-primary/50 px-3 py-1.5 text-xs font-semibold text-primary-foreground opacity-70"
        aria-label="Loading"
      >
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Loading...
      </button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="sm"
          className="h-8 gap-1.5 bg-primary text-xs font-semibold text-primary-foreground hover:bg-primary/90"
        >
          <LogIn className="h-3.5 w-3.5" />
          Sign In
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem
          onClick={() => signIn("github")}
          className="gap-2 text-xs"
        >
          <Github className="h-3.5 w-3.5" />
          Sign in with GitHub
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => signIn("google")}
          className="gap-2 text-xs"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              fill="#4285F4"
            />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              fill="#34A853"
            />
            <path
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              fill="#FBBC05"
            />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              fill="#EA4335"
            />
          </svg>
          Sign in with Google
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
