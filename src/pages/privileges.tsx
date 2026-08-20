import { useState } from 'react';
import { Check, Plus } from 'lucide-react';
import { useSession } from '@/features/auth/session-context';
import { useRolePrivileges, useSaveRolePrivileges, useCreateRolePrivilege, sortRoles } from '@/features/privileges/hooks';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { PasswordConfirmDialog, type PasswordConfirmAction } from '@/components/password-confirm-dialog';
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
      ['canManageItAdmins', 'Manage IT Admins', 'fixed'],
      ['canManageDepartments', 'Manage Departments', 'fixed'],
      ['canViewSettings', 'View Settings', 'fixed'],
      ['canEditSettings', 'Edit Settings', 'fixed'],
      ['canManagePrivileges', 'Manage Privileges', 'fixed'],
    ],
  },
];
// Flattened list of every editable privilege key, in the same order shown
// in the matrix — used to build the save payload.
const ALL_PRIV_KEYS = PRIV_GROUPS.flatMap((g) => g.keys.map(([k]) => k));

// The backend's Apply() switches on nameof(RolePrivilege.CanX) — the exact
// C# property name, PascalCase. Dictionary keys aren't run through ASP.NET's
// camelCase policy the way property names are (that only applies to an
// object's own properties), so this has to be built by hand, not assumed.
// Verified: every one of these 16 keys differs from its backend property
// name ONLY in the first letter (e.g. canManageItAdmins -> CanManageItAdmins,
// lowercase "t" preserved) — a capitalize-first-letter transform is exact
// for all of them, so no per-key lookup table is needed.
function toBackendKey(key: string): string {
  return key.charAt(0).toUpperCase() + key.slice(1);
}
function buildPrivilegesPayload(row: PrivilegeSet): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const key of ALL_PRIV_KEYS) out[toBackendKey(key)] = !!row[key];
  return out;
}

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

export function PrivilegesPage() {
  const { user } = useSession();
  const isAdministrator = user?.role === 'Administrator';
  const { data, isLoading, error } = useRolePrivileges();
  const saveMutation = useSaveRolePrivileges();
  const createMutation = useCreateRolePrivilege();

  const sortedRoles = sortRoles(data || []);

  const [rows, setRows] = useState<PrivilegeSet[]>([]);
  const [prevData, setPrevData] = useState(data);
  if (data !== prevData) {
    setPrevData(data);
    setRows(sortedRoles);
  }

  const [dirtyRoles, setDirtyRoles] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState('');

  function toggle(roleIdx: number, key: keyof PrivilegeSet) {
    if (!isAdministrator) return;
    const row = rows[roleIdx];
    if (!row || row.role === 'Administrator') return;
    setRows((prev) => prev.map((r, i) => (i === roleIdx ? { ...r, [key]: !r[key] } : r)));
    setDirtyRoles((prev) => new Set(prev).add(row.role));
    setMsg('');
  }

  // ── Save (password-confirmed — the backend requires it) ────────────────
  const [pwAction, setPwAction] = useState<PasswordConfirmAction | null>(null);
  const [pwBusy, setPwBusy] = useState(false);
  const [pwError, setPwError] = useState('');

  function openSave() {
    if (dirtyRoles.size === 0) return;
    setMsg('');
    setPwAction({
      title: 'Confirm Privilege Changes',
      message: `Save changes to: ${[...dirtyRoles].join(', ')}. Re-enter your password as an electronic signature — recorded in the change history.`,
      confirmLabel: 'Save & Sign',
      run: async (password) => {
        await Promise.all(
          [...dirtyRoles].map((role) => {
            const row = rows.find((r) => r.role === role);
            if (!row) return Promise.resolve();
            return saveMutation.mutateAsync({ role, privileges: buildPrivilegesPayload(row), adminPassword: password });
          }),
        );
        setDirtyRoles(new Set());
        setMsg('Privilege matrix saved. Changes are recorded in change history.');
      },
    });
  }

  // ── Create role ──────────────────────────────────────────────────────
  const [showCreate, setShowCreate] = useState(false);
  const [newRole, setNewRole] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [createPwd, setCreatePwd] = useState('');
  const [createErr, setCreateErr] = useState('');

  function openCreateDialog() {
    setNewRole('');
    setNewDesc('');
    setCreatePwd('');
    setCreateErr('');
    setShowCreate(true);
  }
  async function submitCreate() {
    const name = newRole.trim();
    if (!name) return setCreateErr('Role name is required');
    if (sortedRoles.some((r) => r.role.toLowerCase() === name.toLowerCase())) {
      return setCreateErr(`A role named "${name}" already exists`);
    }
    if (!createPwd) return setCreateErr('Your password is required');
    setCreateErr('');
    try {
      await createMutation.mutateAsync({ role: name, description: newDesc.trim(), adminPassword: createPwd });
      setShowCreate(false);
      setMsg(`Role "${name}" created. Set its privileges below, then Save.`);
    } catch (e) {
      setCreateErr(e instanceof Error ? e.message : 'Could not create role.');
    }
  }

  async function runPwAction(password: string) {
    if (!pwAction) return;
    setPwBusy(true);
    setPwError('');
    try {
      await pwAction.run(password);
      setPwAction(null);
    } catch (e) {
      setPwError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setPwBusy(false);
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
            <CardDescription>
              {isAdministrator ? 'Toggle privileges per role, or add a new role. The Administrator role is fixed.' : 'Read-only — only an Administrator can edit privileges.'}
            </CardDescription>
          </div>
          {isAdministrator && (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={openCreateDialog}>
                <Plus size={14} /> Add Role
              </Button>
              <Button size="sm" onClick={openSave} disabled={dirtyRoles.size === 0 || saveMutation.isPending}>
                {saveMutation.isPending ? 'Saving…' : 'Save Changes'}
              </Button>
            </div>
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
                    {!r.isSystemRole && <div className="text-[9px] font-normal text-seal">custom</div>}
                    {dirtyRoles.has(r.role) && <div className="text-[9px] font-normal text-warning">unsaved</div>}
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

      <Dialog open={showCreate} onOpenChange={(open) => !open && !createMutation.isPending && setShowCreate(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add a new role</DialogTitle>
          </DialogHeader>
          <p className="text-[12.5px] leading-relaxed text-slate">
            Creates the role with every privilege off. It appears as a new column in the matrix below — set its
            privileges there, then Save.
          </p>
          <div className="flex flex-col gap-1.5">
            <Label>Role name *</Label>
            <Input value={newRole} onChange={(e) => setNewRole(e.target.value)} placeholder="e.g. Compliance Officer" maxLength={60} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>
              Description <span className="font-normal text-slate">(optional)</span>
            </Label>
            <Input value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="Shown alongside the role elsewhere in the app" maxLength={200} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Your password *</Label>
            <Input type="password" value={createPwd} onChange={(e) => setCreatePwd(e.target.value)} autoComplete="off" />
          </div>
          {createErr && <div className="rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-[13px] text-danger">{createErr}</div>}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowCreate(false)} disabled={createMutation.isPending}>
              Cancel
            </Button>
            <Button onClick={submitCreate} disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Creating…' : 'Create role'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PasswordConfirmDialog
        action={pwAction}
        busy={pwBusy}
        error={pwError}
        onConfirm={runPwAction}
        onClose={() => {
          if (!pwBusy) {
            setPwAction(null);
            setPwError('');
          }
        }}
      />
    </div>
  );
}
