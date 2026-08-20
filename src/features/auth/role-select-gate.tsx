// Users assigned more than one role choose the capacity they are acting in
// for this sign-in. The choice is persisted server-side (audited as
// ROLE_SWITCHED) so every authorization check and audit entry reflects the
// acting role, e.g. "signed as Approver".
import { useState } from 'react';
import { ShieldCheck, Loader2 } from 'lucide-react';
import { useSession } from '@/features/auth/session-context';
import { useSelectRoleMutation } from '@/features/auth/hooks';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

const ROLE_HINTS: Record<string, string> = {
  Author: 'Create and send documents for signature',
  Reviewer: 'Review documents routed to you',
  Approver: 'Approve and make documents effective',
  'Site Admin': 'Manage users and data within your site',
  'IT Admin': 'IT administration for your site',
  Administrator: 'Full system administration',
};

export function RoleSelectGate() {
  const { user, selectRole } = useSession();
  const mutation = useSelectRoleMutation();
  const [error, setError] = useState('');
  const roles = user?.roles && user.roles.length ? user.roles : [user?.role].filter(Boolean) as string[];

  async function choose(role: string) {
    setError('');
    try {
      const r = await mutation.mutateAsync(role);
      selectRole(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not switch role.');
    }
  }

  const busy = mutation.isPending ? mutation.variables : '';

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper p-5">
      <Card className="w-full max-w-md p-7">
        <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold tracking-widest text-seal uppercase">
          <ShieldCheck size={13} /> Select role
        </div>
        <h1 className="mb-1.5 text-xl font-semibold text-ink">
          How are you working today, {user?.fullName || user?.username}?
        </h1>
        <p className="mb-5 text-[13px] leading-relaxed text-slate">
          You hold multiple roles — choose the one you are acting in. Your choice is recorded in
          the audit trail; switch again next time you sign in.
        </p>
        <div className="flex flex-col gap-2">
          {roles.map((r) => (
            <button
              key={r}
              disabled={!!busy}
              onClick={() => choose(r)}
              className={cn(
                'rounded-lg border px-4 py-3 text-left transition-colors disabled:opacity-60',
                r === user?.role
                  ? 'border-seal bg-seal-soft'
                  : 'border-line hover:border-line-strong hover:bg-paper',
              )}
            >
              <div className="flex items-center gap-2 text-[14.5px] font-semibold text-ink">
                {r}
                {r === user?.role && <span className="text-[11px] font-medium text-seal">current</span>}
                {busy === r && <Loader2 size={13} className="animate-spin text-slate" />}
              </div>
              <div className="mt-0.5 text-[12.5px] text-slate">{ROLE_HINTS[r] || ''}</div>
            </button>
          ))}
        </div>
        {error && (
          <div className="mt-4 rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-[13px] text-danger">
            {error}
          </div>
        )}
      </Card>
    </div>
  );
}
