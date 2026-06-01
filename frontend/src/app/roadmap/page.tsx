"use client";

import React, { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { ChevronUp, Loader2, Plus, Sparkles } from "lucide-react";

import Footer from "@/components/Footer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useRoadmap } from "@/hooks/use-roadmap";
import {
  FeatureRequestInput,
  RoadmapItem,
  STATUS_META,
  STATUS_ORDER,
  featureRequestSchema,
} from "@/lib/roadmap";

export default function RoadmapPage() {
  const { isLoaded, items, votesFor, hasVoted, toggleVote, submitRequest } =
    useRoadmap();

  // Group + sort items by status; most-voted first within each column.
  const columns = useMemo(() => {
    return STATUS_ORDER.map((status) => ({
      status,
      items: items
        .filter((item) => item.status === status)
        .sort((a, b) => votesFor(b) - votesFor(a)),
    }));
  }, [items, votesFor]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <main
        id="main-content"
        className="flex-1 w-full max-w-6xl mx-auto py-12 px-4 sm:px-6 lg:px-8"
      >
        <header className="mb-10 text-center">
          <h1 className="text-4xl font-bold tracking-tight text-foreground">
            Roadmap &amp; Feature Requests
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-lg text-muted-foreground">
            See what we&apos;re building, upvote the ideas you care about, and
            submit your own to help shape Stellar Kit.
          </p>
          <div className="mt-6 flex justify-center">
            <SubmitRequestDialog onSubmit={submitRequest} />
          </div>
        </header>

        {!isLoaded ? (
          <div className="flex items-center justify-center py-24 text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden />
            Loading roadmap…
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {columns.map((column) => {
              const meta = STATUS_META[column.status];
              return (
                <section
                  key={column.status}
                  aria-label={meta.label}
                  className="flex flex-col rounded-xl border bg-card/40 p-4"
                >
                  <div className="mb-4 flex items-center gap-2 border-b pb-3">
                    <span
                      className={cn("h-2.5 w-2.5 rounded-full", meta.dotClass)}
                      aria-hidden
                    />
                    <h2 className="font-semibold text-card-foreground">
                      {meta.label}
                    </h2>
                    <span className="ml-auto text-sm text-muted-foreground">
                      {column.items.length}
                    </span>
                  </div>

                  <div className="flex-1 space-y-3">
                    {column.items.map((item) => (
                      <RoadmapCard
                        key={item.id}
                        item={item}
                        votes={votesFor(item)}
                        voted={hasVoted(item.id)}
                        onVote={() => toggleVote(item.id)}
                      />
                    ))}
                    {column.items.length === 0 ? (
                      <p className="py-8 text-center text-sm text-muted-foreground">
                        Nothing here yet.
                      </p>
                    ) : null}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Roadmap card                                                               */
/* -------------------------------------------------------------------------- */

function RoadmapCard({
  item,
  votes,
  voted,
  onVote,
}: {
  item: RoadmapItem;
  votes: number;
  voted: boolean;
  onVote: () => void;
}) {
  const meta = STATUS_META[item.status];
  return (
    <Card className="transition-colors hover:border-primary/40">
      <CardHeader className="space-y-2 pb-3">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-medium leading-snug text-foreground">
            {item.title}
          </h3>
          {item.community ? (
            <Badge variant="outline" className="shrink-0 gap-1">
              <Sparkles className="h-3 w-3" aria-hidden />
              Community
            </Badge>
          ) : null}
        </div>
        {item.description ? (
          <p className="text-sm text-muted-foreground">{item.description}</p>
        ) : null}
      </CardHeader>
      <CardContent className="pb-3">
        <span
          className={cn(
            "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
            meta.badgeClass,
          )}
        >
          {meta.label}
        </span>
      </CardContent>
      <CardFooter className="justify-between border-t pt-3">
        <span className="text-sm text-muted-foreground">
          {votes} {votes === 1 ? "vote" : "votes"}
        </span>
        <Button
          variant={voted ? "default" : "outline"}
          size="sm"
          onClick={onVote}
          aria-pressed={voted}
          aria-label={voted ? `Remove your vote from ${item.title}` : `Upvote ${item.title}`}
        >
          <ChevronUp className="mr-1 h-4 w-4" aria-hidden />
          {voted ? "Voted" : "Upvote"}
        </Button>
      </CardFooter>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Submit feature request                                                     */
/* -------------------------------------------------------------------------- */

function SubmitRequestDialog({
  onSubmit,
}: {
  onSubmit: (input: FeatureRequestInput) => RoadmapItem;
}) {
  const [open, setOpen] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FeatureRequestInput>({
    resolver: zodResolver(featureRequestSchema),
    defaultValues: { title: "", description: "" },
  });

  const description = watch("description") ?? "";

  const submit = (values: FeatureRequestInput) => {
    onSubmit(values);
    toast.success("Feature request submitted", {
      description: "It's now in the Planned column with your upvote.",
    });
    reset();
    setOpen(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" aria-hidden />
          Submit a feature request
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Submit a feature request</DialogTitle>
          <DialogDescription>
            Share an idea with the community. It starts in Planned and others can
            upvote it.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(submit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="request-title">Title</Label>
            <Input
              id="request-title"
              placeholder="e.g. Multi-sig transaction builder"
              aria-invalid={!!errors.title}
              {...register("title")}
            />
            {errors.title ? (
              <p className="text-sm text-destructive">{errors.title.message}</p>
            ) : null}
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="request-description">Description (optional)</Label>
              <span className="text-xs text-muted-foreground">
                {description.length}/280
              </span>
            </div>
            <Textarea
              id="request-description"
              rows={4}
              placeholder="What problem would this solve?"
              aria-invalid={!!errors.description}
              {...register("description")}
            />
            {errors.description ? (
              <p className="text-sm text-destructive">
                {errors.description.message}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
              ) : null}
              Submit request
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
