import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="min-h-screen bg-background">
      <section className="pt-32 pb-14 px-6 border-b border-border">
        <div className="mx-auto max-w-6xl space-y-4">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-10 w-1/2" />
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-12 w-full max-w-xl" />
        </div>
      </section>
      <main className="py-16 px-6">
        <div className="mx-auto max-w-6xl space-y-6">
          <Skeleton className="h-52 w-full rounded-2xl" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-44 w-full rounded-2xl" />
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
