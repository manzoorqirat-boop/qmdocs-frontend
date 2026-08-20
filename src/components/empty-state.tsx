import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { TableRow, TableCell } from '@/components/ui/table';

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  hint?: string;
  onClear?: () => void;
  /** Render as a full-width spanning table row instead of a standalone block. */
  colSpan?: number;
}

export function EmptyState({ icon, title, hint, onClear, colSpan }: EmptyStateProps) {
  const body = (
    <div className="flex flex-col items-center px-5 py-9 text-center">
      {icon && <div className="mb-2.5 text-slate opacity-70">{icon}</div>}
      <div className="mb-1 text-[14px] font-semibold text-ink">{title}</div>
      {hint && <div className="mb-3.5 text-[12.5px] text-slate">{hint}</div>}
      {onClear && (
        <Button variant="ghost" size="sm" onClick={onClear}>
          Clear filters
        </Button>
      )}
    </div>
  );
  if (colSpan) {
    return (
      <TableRow className="hover:bg-transparent">
        <TableCell colSpan={colSpan} className="p-0">
          {body}
        </TableCell>
      </TableRow>
    );
  }
  return body;
}
