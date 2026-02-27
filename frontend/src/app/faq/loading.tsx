import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="min-h-screen bg-background">
      <section className="pt-32 pb-14 px-6 border-b border-border">
        <div className="mx-auto max-w-3xl space-y-4 text-center">
          <Skeleton className="h-6 w-24 mx-auto" />
          <Skeleton className="h-10 w-2/3 mx-auto" />
          <Skeleton className="h-5 w-1/2 mx-auto" />
          <Skeleton className="h-12 w-full max-w-xl mx-auto" />
        </div>
      </section>
      <main className="py-16 px-6">
        <div className="mx-auto max-w-3xl space-y-4">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      </main>
    </div>
  );
}
