import { useState, useMemo } from 'react';
import { Check } from 'lucide-react';
import { useSession } from '@/features/auth/session-context';
import { useRolePrivileges, useSaveRolePrivileges } from '@/features/privileges/hooks';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { PrivilegeSet } from '@/types/api';

type Level = 'live' | 'nav' | 'fixed';
const PRIV_GROUPS: { title: string; keys: [keyof PrivilegeSet, string, Level][] }[] = [
  {
    title: 'Signatures',
    keys: [
      ['canCreateEnvelope', 'Create Envelope', 'live'],
      ['canSign', 'Sign', 'live'],
      ['canApprove', 'Approve', 'live'],
      ['canVoidEnvelope', 'Void Envelope', 'live'],
      ['canDelegate', 'Delegate', 'live'],
      ['canPushback', 'Return to Author', 'live'],
    ],
  },
  {
    title: 'Records',
    keys: [
      ['canViewAudit', 'View Audit Trail', 'nav'],
      ['canViewReports', 'View Reports', 'nav'],
      ['canViewAllDepartments', 'View All Departments', 'fixed'],
    ],
  },
  {
    title: 'Administration',
    keys: [
      ['canViewUsers', 'View Users', 'nav'],
      ['canManageUsers', 'Manage Users', 'fixed'],
      // This key is `canManageItAdmins` (lowercase "t"), matching the
      // backend's `CanManageItAdmins` C# property exactly. The legacy
      // frontend used `canManageITAdmins` — that key never matched what
      // the API actually returns, so that toggle always displayed OFF
      // regardless of the real stored value. Fixed here.
      ['canManageItAdmins', 'Manage IT Admins', 'fixed'],
      ['canManageDepartments', 'Manage Departments', 'fixed'],
      ['canViewSettings', 'View Settings', 'fixed'],
      ['canEditSettings', 'Edit Settings', 'fixed'],
      ['canManagePrivileges', 'Manage Privileges', 'fixed'],
    ],
  },
];

const ENFORCEMENT_BADGE: Record<Level, { text: string; title: string; className: string }> = {
  live: { text: 'Live', title: 'Enforced by the server on every action — changes apply immediately.', className: 'bg-success-soft text-success' },
  nav: {
    text: 'Menu · re-login',
    title: 'Controls sidebar visibility; users must sign out and back in to see the change. Data stays department/site-scoped either way.',
    className: 'bg-warning-soft text-warning',
  },
  fixed: {
    text: 'Role-fixed',
    title: 'Reserved in this version — behaviour is bound to the role itself; this toggle has no effect yet.',
    className: 'bg-paper text-slate',
  },
};

const ROLE_ORDER = ['Author', 'Reviewer', 'Approver', 'IT Admin', 'Administrator'];

export function PrivilegesPage() {
  const { user } = useSession();
  const isAdministrator = user?.role === 'Administrator';
  const { data, isLoading, error } = useRolePrivileges();
  const saveMutation = useSaveRolePrivileges();

  const initialRows = useMemo(() => {
    const list = (data || []).filter((r) => ROLE_ORDER.includes(r.role));
    return [...list].sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role));
  }, [data]);

  const [rows, setRows] = useState<PrivilegeSet[]>([]);
  const [prevInitialRows, setPrevInitialRows] = useState(initialRows);
  if (initialRows !== prevInitialRows) {
    setPrevInitialRows(initialRows);
    setRows(initialRows);
  }

  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState('');

  function toggle(roleIdx: number, key: keyof PrivilegeSet) {
    if (!isAdministrator) return;
    const row = rows[roleIdx];
    if (!row || row.role === 'Administrator') return;
    setRows((prev) => prev.map((r, i) => (i === roleIdx ? { ...r, [key]: !r[key] } : r)));
    setDirty(true);
    setMsg('');
  }

  async function save() {
    setMsg('');
    try {
      const payload = rows.filter((r) => r.role !== 'Administrator');
      await saveMutation.mutateAsync(payload);
      setMsg('Privilege matrix saved. Changes are recorded in change history.');
      setDirty(false);
    } catch {
      /* error surfaced via saveMutation.error below */
    }
  }

  const activeError = error || saveMutation.error;

  if (isLoading) return <div className="py-16 text-center text-[13px] text-slate">Loading privilege matrix…</div>;

  return (
    <div className="mx-auto max-w-5xl">
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle>Role Privilege Matrix</CardTitle>
            <CardDescription>{isAdministrator ? 'Toggle privileges per role. The Administrator role is fixed.' : 'Read-only — only an Administrator can edit privileges.'}</CardDescription>
          </div>
          {isAdministrator && (
            <Button size="sm" onClick={save} disabled={!dirty || saveMutation.isPending}>
              {saveMutation.isPending ? 'Saving…' : 'Save Changes'}
            </Button>
          )}
        </CardHeader>

        {activeError && (
          <div className="mx-5 mb-4 rounded-md border border-danger/30 bg-danger-soft px-3 py-2.5 text-[13px] text-danger">
            {activeError instanceof Error ? activeError.message : 'Something went wrong'}
          </div>
        )}
        {msg && <div className="mx-5 mb-4 rounded-md border border-success/30 bg-success-soft px-3 py-2.5 text-[13px] text-success">{msg}</div>}

        <div className="overflow-x-auto p-5 pt-0">
          <table className="w-full min-w-[680px] border-collapse">
            <thead>
              <tr>
                <th className="pb-2 text-left text-[11px] font-semibold text-slate uppercase">Privilege</th>
                {rows.map((r) => (
                  <th key={r.role} className="min-w-[90px] pb-2 text-center text-[13px] font-semibold text-ink">
                    {r.role}
                    {r.role === 'Administrator' && <div className="text-[9px] font-normal text-slate">locked</div>}
                  </th>
                ))}
              </tr>
            </thead>
            {PRIV_GROUPS.map((group) => (
              <tbody key={group.title}>
                <tr>
                  <td colSpan={rows.length + 1} className="bg-paper py-1.5 text-[11px] font-bold tracking-wide text-slate uppercase">
                    {group.title}
                  </td>
                </tr>
                {group.keys.map(([key, label, level]) => (
                  <tr key={key} className="border-b border-line">
                    <td className="py-2 text-[13px]">
                      {label}
                      <span
                        title={ENFORCEMENT_BADGE[level].title}
                        className={cn('ml-1.5 cursor-help rounded-full border border-line px-1.5 py-0.5 align-middle text-[9.5px] font-bold tracking-wide', ENFORCEMENT_BADGE[level].className)}
                      >
                        {ENFORCEMENT_BADGE[level].text}
                      </span>
                    </td>
                    {rows.map((r, roleIdx) => {
                      const locked = r.role === 'Administrator' || !isAdministrator;
                      const on = !!r[key];
                      return (
                        <td key={r.role} className="text-center">
                          <button
                            onClick={() => toggle(roleIdx, key)}
                            disabled={locked}
                            aria-label={`${label} for ${r.role}`}
                            className={cn(
                              'inline-flex size-[26px] items-center justify-center rounded-md border font-bold',
                              on ? 'border-success bg-success text-white' : 'border-line-strong bg-paper-raised text-slate',
                              locked ? 'cursor-default' : 'cursor-pointer',
                              locked && !on && 'opacity-40',
                            )}
                          >
                            {on && <Check size={14} />}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </div>

        <div className="px-5 pb-5 text-[12px] leading-relaxed text-slate">
          The <strong className="text-ink-soft">Administrator</strong> role always retains full control and cannot be
          modified. Only an Administrator can change this matrix. Every change is written to the change-history log
          with the editor's name and a timestamp.
        </div>
      </Card>
    </div>
  );
}
