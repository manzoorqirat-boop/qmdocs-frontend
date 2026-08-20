import { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { cn } from '@/lib/utils';

// Client-side paging over an in-memory array. Returns the current page
// slice plus controls. Page resets to 1 whenever the underlying list
// length changes (e.g. after filtering/search).
export function usePagination<T>(items: T[] | undefined, initialPageSize = 10) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const total = items?.length || 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  // Reset to page 1 when the dataset or page size changes — done during
  // render (React's documented "adjusting state when a prop changes"
  // pattern), not in a useEffect. An effect here would mean an extra
  // committed render showing the stale page before snapping back, and it's
  // exactly the kind of impure-during-render side effect that stops the
  // React Compiler from optimizing the hook.
  const [prevTotal, setPrevTotal] = useState(total);
  const [prevPageSize, setPrevPageSize] = useState(pageSize);
  if (total !== prevTotal || pageSize !== prevPageSize) {
    setPrevTotal(total);
    setPrevPageSize(pageSize);
    setPage(1);
  }
  const safePage = Math.min(page, pageCount);

  const pageItems = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return (items || []).slice(start, start + pageSize);
  }, [items, safePage, pageSize]);

  return {
    page: safePage,
    pageCount,
    pageSize,
    total,
    setPage,
    setPageSize,
    next: () => setPage((p) => Math.min(p + 1, pageCount)),
    prev: () => setPage((p) => Math.max(p - 1, 1)),
    pageItems,
    rangeStart: total === 0 ? 0 : (safePage - 1) * pageSize + 1,
    rangeEnd: Math.min(safePage * pageSize, total),
  };
}

interface PaginationProps {
  page: number;
  pageCount: number;
  total: number;
  rangeStart: number;
  rangeEnd: number;
  setPage: (p: number) => void;
  next: () => void;
  prev: () => void;
  pageSize?: number;
  onPageSize?: (n: number) => void;
  label?: string;
}

// Compact control bar: "X–Y of N", prev/next, and a windowed page list with
// ellipses for large ranges. Hidden when there's nothing to page through.
export function Pagination({
  page,
  pageCount,
  total,
  rangeStart,
  rangeEnd,
  setPage,
  next,
  prev,
  pageSize,
  onPageSize,
  label = 'items',
}: PaginationProps) {
  if (total === 0) return null;

  const pages: (number | '…')[] = [];
  const window = 1;
  for (let i = 1; i <= pageCount; i++) {
    if (i === 1 || i === pageCount || (i >= page - window && i <= page + window)) {
      pages.push(i);
    } else if (pages[pages.length - 1] !== '…') {
      pages.push('…');
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 pt-3">
      <div className="text-[12.5px] text-slate">
        Showing <strong className="font-semibold text-ink-soft">{rangeStart}–{rangeEnd}</strong> of {total} {label}
      </div>

      <div className="flex items-center gap-1">
        {onPageSize && pageSize && (
          <Select value={String(pageSize)} onValueChange={(v) => onPageSize(Number(v))}>
            <SelectTrigger size="sm" className="mr-2 w-24" aria-label="Rows per page">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[10, 25, 50, 100].map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n} / page
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Button variant="ghost" size="icon" className="size-7" onClick={prev} disabled={page <= 1} aria-label="Previous page">
          <ChevronLeft size={15} />
        </Button>
        {pages.map((p, i) =>
          p === '…' ? (
            <span key={`e${i}`} className="px-1 text-[13px] text-slate">
              …
            </span>
          ) : (
            <Button
              key={p}
              variant={p === page ? 'default' : 'ghost'}
              size="icon"
              className={cn('size-7 text-[12.5px]', p === page && 'pointer-events-none')}
              onClick={() => setPage(p)}
              aria-label={`Page ${p}`}
              aria-current={p === page ? 'page' : undefined}
            >
              {p}
            </Button>
          ),
        )}
        <Button variant="ghost" size="icon" className="size-7" onClick={next} disabled={page >= pageCount} aria-label="Next page">
          <ChevronRight size={15} />
        </Button>
      </div>
    </div>
  );
}
