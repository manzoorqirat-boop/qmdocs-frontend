import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

// FilterBar — a titled card whose body is an auto-fit responsive grid of
// filter fields. Drop labeled inputs/selects in as children.
interface FilterBarProps {
  title?: ReactNode;
  tag?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}
export function FilterBar({ title = 'Filter', tag, actions, children, className }: FilterBarProps) {
  return (
    <Card className={className}>
      <CardHeader className="flex-row items-center justify-between pb-3">
        <CardTitle className="text-[13px]">{title}</CardTitle>
        {tag && (
          <Badge variant="outline" className="font-record text-[9px]">
            {tag}
          </Badge>
        )}
      </CardHeader>
      <CardContent className="pt-0">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] items-end gap-3">
          {children}
          {actions && <div className="flex items-end gap-2">{actions}</div>}
        </div>
      </CardContent>
    </Card>
  );
}

export function Field({ label, children, className }: { label?: string; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      {label && <label className="mb-1.5 block text-[13px] font-medium text-ink-soft">{label}</label>}
      {children}
    </div>
  );
}

// ActiveFilters — a compact "N filters active · Clear all" indicator. Pass
// the same filter-state object used to build query params; empty/falsy
// values are ignored.
interface ActiveFiltersProps {
  filters?: Record<string, string | boolean | undefined | null>;
  onClear?: () => void;
  onRemove?: (key: string) => void;
}
export function ActiveFilters({ filters = {}, onClear, onRemove }: ActiveFiltersProps) {
  const active = Object.entries(filters).filter(([, v]) => v !== '' && v != null && v !== false);
  if (active.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 text-[12px]">
      <span className="text-slate">
        {active.length} filter{active.length > 1 ? 's' : ''} active:
      </span>
      {active.map(([key, val]) => (
        <span
          key={key}
          className="inline-flex items-center gap-1 rounded-full bg-seal-soft px-2 py-0.5 text-[11px] font-semibold text-seal"
        >
          {key}: {String(val)}
          {onRemove && (
            <button onClick={() => onRemove(key)} aria-label={`Remove ${key} filter`} className="leading-none">
              <X size={11} />
            </button>
          )}
        </span>
      ))}
      {onClear && (
        <Button variant="ghost" size="sm" onClick={onClear} className="h-6 px-2 text-[11.5px]">
          Clear all
        </Button>
      )}
    </div>
  );
}

// DatePresets — quick relative-range chips that set From/To to ISO dates.
export function DatePresets({ onApply }: { onApply: (fromIso: string, toIso: string) => void }) {
  const presets = [
    { label: 'Last 7d', days: 7 },
    { label: 'Last 30d', days: 30 },
    { label: 'Last 90d', days: 90 },
  ];
  const iso = (d: Date) => d.toISOString().slice(0, 10);

  function apply(days: number) {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - days);
    onApply(iso(from), iso(to));
  }

  return (
    <div className="flex items-center gap-1">
      {presets.map((p) => (
        <Button key={p.days} variant="ghost" size="sm" className="h-6 px-2 text-[11.5px]" onClick={() => apply(p.days)}>
          {p.label}
        </Button>
      ))}
    </div>
  );
}

export function validateDateRange(from: string, to: string): string {
  if (from && to && from > to) return 'From date must be on or before To date.';
  return '';
}
