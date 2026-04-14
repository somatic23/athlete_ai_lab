import { cn } from "@/lib/utils/cn";

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-md bg-surface-container-high",
        className
      )}
    />
  );
}

// ── Preset compositions ─────────────────────────────────────────────────

export function SkeletonCard() {
  return (
    <div className="rounded-xl bg-surface-container-low p-4 flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <Skeleton className="h-10 w-10 rounded-lg shrink-0" />
        <div className="flex-1 flex flex-col gap-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      </div>
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-5/6" />
    </div>
  );
}

export function SkeletonListItem() {
  return (
    <div className="rounded-lg bg-surface-container-low px-4 py-3 flex items-center gap-4">
      <Skeleton className="h-8 w-8 rounded-lg shrink-0" />
      <div className="flex-1 flex flex-col gap-2">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-3 w-1/3" />
      </div>
      <Skeleton className="h-6 w-16 shrink-0" />
    </div>
  );
}

export function SkeletonStat() {
  return (
    <div className="rounded-xl bg-surface-container-low p-4 flex flex-col gap-2">
      <Skeleton className="h-3 w-16" />
      <Skeleton className="h-8 w-24" />
      <Skeleton className="h-3 w-12" />
    </div>
  );
}

export function SkeletonPage() {
  return (
    <div className="p-4 flex flex-col gap-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <SkeletonListItem key={i} />
      ))}
    </div>
  );
}
