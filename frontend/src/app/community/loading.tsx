import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="min-h-screen bg-background">
      <section className="pt-32 pb-14 px-6 border-b border-border">
        <div className="mx-auto max-w-5xl text-center space-y-4">
          <Skeleton className="h-10 w-2/3 mx-auto" />
          <Skeleton className="h-5 w-1/2 mx-auto" />
          <div className="flex justify-center gap-3">
            <Skeleton className="h-11 w-32 rounded-xl" />
            <Skeleton className="h-11 w-32 rounded-xl" />
          </div>
        </div>
      </section>
      <main className="py-16 px-6">
        <div className="mx-auto max-w-6xl space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-24 w-full rounded-2xl" />
            ))}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-36 w-full rounded-2xl" />
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
