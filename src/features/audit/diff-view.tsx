// Before/after diff for change-history rows — shows only fields that
// actually changed, struck-through old value next to the new one.
interface DiffViewProps {
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
}
export function DiffView({ before, after }: DiffViewProps) {
  if (!before && !after) return <span className="text-[11px] text-slate">—</span>;
  const keys = [...new Set([...Object.keys(before || {}), ...Object.keys(after || {})])];
  const changed = keys.filter((k) => JSON.stringify((before || {})[k]) !== JSON.stringify((after || {})[k]));
  if (changed.length === 0) return <span className="text-[11px] text-slate">No changes</span>;
  return (
    <div className="font-record flex flex-col gap-0.5 text-[10px]">
      {changed.map((k) => (
        <div key={k}>
          <span className="text-ink-soft">{k}: </span>
          <span className="mr-1 text-danger line-through">{String((before || {})[k] ?? '—')}</span>
          <span className="text-success">{String((after || {})[k] ?? '—')}</span>
        </div>
      ))}
    </div>
  );
}
