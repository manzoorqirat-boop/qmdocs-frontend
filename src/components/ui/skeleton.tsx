import { cn } from '@/lib/utils';

/**
 * A shaped placeholder for content that is still loading.
 *
 * Replaces centred "Loading…" text. Two reasons it is worth the component:
 * the layout stays put instead of jumping when data lands, and the shape
 * tells the reader roughly what is coming. The shimmer itself lives in
 * `.skeleton` in index.css, where the app's reduced-motion rule can flatten
 * it along with every other animation.
 *
 * Marked aria-hidden and paired with a visually-hidden live message by the
 * wrappers below — a screen reader should hear "loading", not encounter a
 * fleet of meaningless empty boxes.
 */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton', className)} aria-hidden="true" />;
}

/** Announces loading state to assistive tech without showing visible text. */
function LoadingAnnouncement({ label }: { label: string }) {
  return (
    <span role="status" aria-live="polite" className="sr-only">
      {label}
    </span>
  );
}

/**
 * Placeholder rows sized for a data table, the shape most loading states in
 * this app resolve into.
 */
export function TableSkeleton({
  rows = 6,
  columns = 4,
  label = 'Loading records',
}: {
  rows?: number;
  columns?: number;
  label?: string;
}) {
  return (
    <div className="w-full">
      <LoadingAnnouncement label={label} />
      <div className="space-y-px">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="flex items-center gap-4 border-b border-line px-1 py-3 last:border-0">
            {Array.from({ length: columns }).map((_, c) => (
              <Skeleton
                key={c}
                className={cn(
                  'h-3.5',
                  // Varied widths read as text rather than as a grid of
                  // identical bars; the first column is widest because it is
                  // almost always the name/title.
                  c === 0 ? 'flex-[2]' : c === columns - 1 ? 'flex-[0.6]' : 'flex-1',
                )}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Placeholder for a card-shaped panel of text. */
export function CardSkeleton({ lines = 3, label = 'Loading' }: { lines?: number; label?: string }) {
  return (
    <div className="w-full space-y-2.5 py-1">
      <LoadingAnnouncement label={label} />
      <Skeleton className="h-4 w-1/3" />
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={cn('h-3.5', i === lines - 1 ? 'w-2/3' : 'w-full')} />
      ))}
    </div>
  );
}
