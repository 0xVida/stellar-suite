"use client";

import { LogOut, User } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/useAuth";

export function UserMenu() {
  const { user, signOut } = useAuth();

  if (!user) return null;

  const initials = user.name
    ? user.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "?";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="flex items-center gap-1.5 rounded border border-border bg-secondary px-2 py-1 text-xs transition-colors hover:bg-muted focus:outline-none focus:ring-1 focus:ring-primary"
          aria-label="User menu"
        >
          <Avatar className="h-5 w-5">
            <AvatarImage src={user.image ?? undefined} alt={user.name ?? "User"} />
            <AvatarFallback className="text-[9px]">{initials}</AvatarFallback>
          </Avatar>
          <span className="max-w-[80px] truncate font-mono text-foreground">
            {user.name ?? user.email}
          </span>
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel className="pb-1">
          <p className="text-sm font-medium leading-none">{user.name}</p>
          {user.email ? (
            <p className="mt-1 truncate text-xs text-muted-foreground">{user.email}</p>
          ) : null}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => signOut()}
          className="gap-2 text-xs text-destructive focus:text-destructive"
        >
          <LogOut className="h-3.5 w-3.5" />
          Sign Out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
