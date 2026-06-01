"use client";

import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  Check,
  Copy,
  Github,
  Link2,
  Loader2,
  Plus,
  Shield,
  Star,
  Trash2,
  Unlink,
  Wallet,
} from "lucide-react";

import Footer from "@/components/Footer";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useIdentity } from "@/hooks/use-identity";
import {
  ProfileFields,
  githubUsernameSchema,
  initialsFromName,
  isStellarSecretKey,
  profileSchema,
  stellarAccountSchema,
  truncateAddress,
} from "@/lib/identity";

export default function ProfilePage() {
  const {
    identity,
    isLoaded,
    updateProfile,
    linkGithub,
    unlinkGithub,
    addStellarAccount,
    removeStellarAccount,
    setPrimaryStellarAccount,
  } = useIdentity();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <main
        id="main-content"
        className="flex-1 w-full max-w-3xl mx-auto py-10 px-4 sm:px-6 lg:px-8"
      >
        <header className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Profile &amp; Identity
          </h1>
          <p className="mt-2 text-muted-foreground">
            Personalize your developer profile and manage the accounts linked to it.
          </p>
        </header>

        {!isLoaded ? (
          <div className="flex items-center justify-center py-24 text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden />
            Loading your profile…
          </div>
        ) : (
          <Tabs defaultValue="profile" className="w-full">
            <TabsList className="mb-6">
              <TabsTrigger value="profile">Edit Profile</TabsTrigger>
              <TabsTrigger value="accounts">
                Linked Accounts
                <Badge variant="secondary" className="ml-2">
                  {(identity.github ? 1 : 0) + identity.stellarAccounts.length}
                </Badge>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="profile">
              <ProfileForm identity={identity} onSave={updateProfile} />
            </TabsContent>

            <TabsContent value="accounts" className="space-y-6">
              <GithubCard
                username={identity.github}
                onLink={linkGithub}
                onUnlink={unlinkGithub}
              />
              <StellarCard
                accounts={identity.stellarAccounts}
                onAdd={addStellarAccount}
                onRemove={removeStellarAccount}
                onSetPrimary={setPrimaryStellarAccount}
              />
            </TabsContent>
          </Tabs>
        )}
      </main>
      <Footer />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Edit profile                                                               */
/* -------------------------------------------------------------------------- */

function ProfileForm({
  identity,
  onSave,
}: {
  identity: ProfileFields;
  onSave: (fields: ProfileFields) => void;
}) {
  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<ProfileFields>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      displayName: identity.displayName ?? "",
      bio: identity.bio ?? "",
      avatarUrl: identity.avatarUrl ?? "",
    },
  });

  const displayName = watch("displayName");
  const avatarUrl = watch("avatarUrl");
  const bio = watch("bio") ?? "";

  const onSubmit = (fields: ProfileFields) => {
    onSave(fields);
    reset(fields); // clears the dirty state after a successful save
    toast.success("Profile saved", {
      description: "Your changes have been stored on this device.",
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Edit profile</CardTitle>
        <CardDescription>
          This information personalizes your experience across Stellar Kit.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              {avatarUrl ? <AvatarImage src={avatarUrl} alt="" /> : null}
              <AvatarFallback className="text-lg">
                {initialsFromName(displayName || "")}
              </AvatarFallback>
            </Avatar>
            <div className="text-sm text-muted-foreground">
              Live preview of your avatar.
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="displayName">Display name</Label>
            <Input
              id="displayName"
              placeholder="Ada Lovelace"
              aria-invalid={!!errors.displayName}
              {...register("displayName")}
            />
            {errors.displayName ? (
              <p className="text-sm text-destructive">{errors.displayName.message}</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="avatarUrl">Avatar URL</Label>
            <Input
              id="avatarUrl"
              type="url"
              placeholder="https://example.com/avatar.png"
              aria-invalid={!!errors.avatarUrl}
              {...register("avatarUrl")}
            />
            {errors.avatarUrl ? (
              <p className="text-sm text-destructive">{errors.avatarUrl.message}</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Only http(s) links are allowed.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="bio">Bio</Label>
              <span className="text-xs text-muted-foreground">{bio.length}/280</span>
            </div>
            <Textarea
              id="bio"
              rows={4}
              placeholder="Tell other developers about yourself…"
              aria-invalid={!!errors.bio}
              {...register("bio")}
            />
            {errors.bio ? (
              <p className="text-sm text-destructive">{errors.bio.message}</p>
            ) : null}
          </div>

          <div className="flex justify-end">
            <Button type="submit" disabled={isSubmitting || !isDirty}>
              {isSubmitting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
              ) : null}
              Save profile
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* GitHub linking                                                             */
/* -------------------------------------------------------------------------- */

function GithubCard({
  username,
  onLink,
  onUnlink,
}: {
  username: string | null;
  onLink: (username: string) => void;
  onUnlink: () => void;
}) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleLink = () => {
    const result = githubUsernameSchema.safeParse(value);
    if (!result.success) {
      setError(result.error.issues[0].message);
      return;
    }
    setError(null);
    onLink(result.data);
    setValue("");
    toast.success(`Linked @${result.data} on GitHub`);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Github className="h-5 w-5" aria-hidden />
          GitHub
        </CardTitle>
        <CardDescription>
          Connect your GitHub account to showcase your open-source work.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {username ? (
          <div className="flex items-center justify-between gap-4 rounded-lg border bg-muted/30 p-4">
            <div className="flex items-center gap-3">
              <Avatar className="h-10 w-10">
                <AvatarImage
                  src={`https://github.com/${username}.png?size=80`}
                  alt=""
                />
                <AvatarFallback>{username.slice(0, 2).toUpperCase()}</AvatarFallback>
              </Avatar>
              <div>
                <a
                  href={`https://github.com/${username}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-foreground hover:underline"
                >
                  @{username}
                </a>
                <p className="text-xs text-muted-foreground">Connected</p>
              </div>
            </div>
            <ConfirmButton
              title="Unlink GitHub?"
              description={`@${username} will be disconnected from your profile.`}
              actionLabel="Unlink"
              onConfirm={() => {
                onUnlink();
                toast.success("GitHub account unlinked");
              }}
            >
              <Button variant="outline" size="sm">
                <Unlink className="mr-2 h-4 w-4" aria-hidden />
                Unlink
              </Button>
            </ConfirmButton>
          </div>
        ) : (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
            <div className="flex-1 space-y-2">
              <Label htmlFor="github-username" className="sr-only">
                GitHub username
              </Label>
              <div className="flex items-center rounded-md border bg-background focus-within:ring-1 focus-within:ring-ring">
                <span className="pl-3 text-sm text-muted-foreground">github.com/</span>
                <Input
                  id="github-username"
                  value={value}
                  onChange={(e) => {
                    setValue(e.target.value);
                    if (error) setError(null);
                  }}
                  onKeyDown={(e) => e.key === "Enter" && handleLink()}
                  placeholder="username"
                  aria-invalid={!!error}
                  className="border-0 focus-visible:ring-0"
                />
              </div>
              {error ? <p className="text-sm text-destructive">{error}</p> : null}
            </div>
            <Button onClick={handleLink}>
              <Link2 className="mr-2 h-4 w-4" aria-hidden />
              Link account
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Stellar accounts                                                           */
/* -------------------------------------------------------------------------- */

function StellarCard({
  accounts,
  onAdd,
  onRemove,
  onSetPrimary,
}: {
  accounts: { address: string; label?: string; primary: boolean }[];
  onAdd: (address: string, label?: string) => void;
  onRemove: (address: string) => void;
  onSetPrimary: (address: string) => void;
}) {
  const [address, setAddress] = useState("");
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const handleAdd = () => {
    const result = stellarAccountSchema.safeParse({ address, label });
    if (!result.success) {
      setError(result.error.issues[0].message);
      return;
    }
    if (accounts.some((a) => a.address === result.data.address)) {
      setError("That account is already linked");
      return;
    }
    setError(null);
    onAdd(result.data.address, result.data.label);
    setAddress("");
    setLabel("");
    toast.success("Stellar account linked");
  };

  const handleCopy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(value);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      toast.error("Couldn't copy to clipboard");
    }
  };

  // Surface the secret-key warning as soon as the user pastes one.
  const secretKeyWarning = isStellarSecretKey(address);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wallet className="h-5 w-5" aria-hidden />
          Stellar accounts
        </CardTitle>
        <CardDescription>
          Link the public keys of the Stellar accounts you own.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {accounts.length > 0 ? (
          <ul className="space-y-2">
            {accounts.map((account) => (
              <li
                key={account.address}
                className="flex items-center justify-between gap-3 rounded-lg border p-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm text-foreground">
                      {truncateAddress(account.address, 6, 6)}
                    </span>
                    {account.primary ? (
                      <Badge className="gap-1">
                        <Star className="h-3 w-3" aria-hidden />
                        Primary
                      </Badge>
                    ) : null}
                  </div>
                  {account.label ? (
                    <p className="truncate text-xs text-muted-foreground">
                      {account.label}
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Copy address"
                    onClick={() => handleCopy(account.address)}
                  >
                    {copied === account.address ? (
                      <Check className="h-4 w-4 text-green-500" aria-hidden />
                    ) : (
                      <Copy className="h-4 w-4" aria-hidden />
                    )}
                  </Button>
                  {!account.primary ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        onSetPrimary(account.address);
                        toast.success("Primary account updated");
                      }}
                    >
                      Make primary
                    </Button>
                  ) : null}
                  <ConfirmButton
                    title="Remove account?"
                    description={`${truncateAddress(
                      account.address,
                      6,
                      6,
                    )} will be unlinked from your profile.`}
                    actionLabel="Remove"
                    onConfirm={() => {
                      onRemove(account.address);
                      toast.success("Stellar account removed");
                    }}
                  >
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Remove account"
                    >
                      <Trash2 className="h-4 w-4 text-destructive" aria-hidden />
                    </Button>
                  </ConfirmButton>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
            No Stellar accounts linked yet.
          </p>
        )}

        <div className="space-y-2 border-t pt-4">
          <Label htmlFor="stellar-address">Add an account</Label>
          <Input
            id="stellar-address"
            value={address}
            onChange={(e) => {
              setAddress(e.target.value);
              if (error) setError(null);
            }}
            placeholder="G… public key"
            aria-invalid={!!error}
            className="font-mono"
            autoComplete="off"
            spellCheck={false}
          />
          <Input
            aria-label="Account label (optional)"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Label (optional), e.g. Testnet wallet"
            maxLength={30}
          />
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {secretKeyWarning ? (
            <p className="flex items-center gap-1.5 text-sm text-destructive">
              <Shield className="h-4 w-4" aria-hidden />
              Never enter a secret key. Only public keys (starting with G) are stored.
            </p>
          ) : (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Shield className="h-3.5 w-3.5" aria-hidden />
              Only public keys are stored — never share your secret key.
            </p>
          )}
          <div className="flex justify-end">
            <Button onClick={handleAdd} disabled={!address.trim()}>
              <Plus className="mr-2 h-4 w-4" aria-hidden />
              Link account
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Shared confirm dialog                                                      */
/* -------------------------------------------------------------------------- */

function ConfirmButton({
  title,
  description,
  actionLabel,
  onConfirm,
  children,
}: {
  title: string;
  description: string;
  actionLabel: string;
  onConfirm: () => void;
  children: React.ReactNode;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{children}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>{actionLabel}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
