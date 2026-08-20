import { Construction } from 'lucide-react';
import { Card } from '@/components/ui/card';

interface PagePlaceholderProps {
  title: string;
  legacyFile: string;
}

/** Used only for pages not yet ported — see MIGRATION_STATUS.md at the repo root. */
export function PagePlaceholder({ title, legacyFile }: PagePlaceholderProps) {
  return (
    <div className="mx-auto max-w-lg py-16">
      <Card className="flex flex-col items-center gap-3 p-8 text-center">
        <span className="flex size-11 items-center justify-center rounded-full bg-warning-soft text-warning">
          <Construction size={20} />
        </span>
        <h1 className="text-lg font-semibold text-ink">{title}</h1>
        <p className="text-[13px] leading-relaxed text-slate">
          Not yet ported to the new frontend — being built next, against{' '}
          <code className="font-record rounded bg-paper px-1.5 py-0.5 text-[12px]">{legacyFile}</code> as
          the spec. See <code className="font-record rounded bg-paper px-1.5 py-0.5 text-[12px]">MIGRATION_STATUS.md</code>.
        </p>
      </Card>
    </div>
  );
}
