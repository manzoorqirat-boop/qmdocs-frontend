// Status pill with a non-color-dependent meaning (tone + label), so status
// stays legible for colorblind users and in B&W print/PDF export. Ported
// from the legacy Filters.jsx StatusBadge/statusTone/statusLabel — ~10
// pages render envelope/user/change-request status through this.
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const STATUS_TONE: Record<string, 'success' | 'danger' | 'warning' | 'info' | 'default'> = {
  // success — terminal positive
  completed: 'success', signed: 'success', approved: 'success', active: 'success', reviewed: 'success',
  // danger — terminal negative
  declined: 'danger', rejected: 'danger', voided: 'danger', failed: 'danger', locked: 'danger',
  // warning — in-flight, action pending
  sent: 'warning', pending: 'warning', submitted: 'warning', returned: 'warning', returnedtoauthor: 'warning',
  // info — partial / intermediate
  'pending final approval': 'info', 'under review': 'info', delegated: 'info',
  // default — inactive / not started
  draft: 'default', inactive: 'default',
};

// Human-readable labels for raw camelCase/single-token statuses. Without
// this, "ReturnedToAuthor" renders as one unbreakable uppercase token that
// overflows its table column.
const STATUS_LABEL: Record<string, string> = {
  returnedtoauthor: 'Returned to Author',
  'pending final approval': 'Pending Final Approval',
  'under review': 'Under Review',
  // Display term only — the wire value from the backend is still "Voided"
  // (see STATUS_TONE below, keyed the same way); this just changes what
  // the user reads.
  voided: 'Cancelled',
};

export function statusLabel(status: string | null | undefined): string {
  const raw = String(status || '');
  const mapped = STATUS_LABEL[raw.toLowerCase()];
  if (mapped) return mapped;
  // Generic fallback: split camelCase/PascalCase into spaced words so any
  // future multi-word status is readable and wrappable.
  return raw.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
}

export function statusTone(status: string | null | undefined) {
  const raw = String(status || '').toLowerCase();
  if (STATUS_TONE[raw]) return STATUS_TONE[raw];
  const spaced = statusLabel(status).toLowerCase();
  return STATUS_TONE[spaced] || 'default';
}

export function StatusBadge({ status, className }: { status: string | null | undefined; className?: string }) {
  return (
    <Badge variant={statusTone(status)} className={cn(className)}>
      {statusLabel(status)}
    </Badge>
  );
}
