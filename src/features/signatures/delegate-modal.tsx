import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { UserSearchPicker } from '@/features/signatures/user-search-picker';
import { STEP_DEFS, ALL_ROLES_FOR_CUSTOM, stepColor } from '@/features/signatures/constants';
import { useDelegateEnvelope } from '@/features/envelopes/hooks';
import type { EnvelopeSummary, UserDirectoryEntry, Site, Department, SessionUser } from '@/types/api';

interface DelegateModalProps {
  envelope: EnvelopeSummary;
  currentUser: SessionUser;
  users: UserDirectoryEntry[];
  departments: Department[];
  sites?: Site[];
  onClose: () => void;
  onDelegated: () => void;
}

export function DelegateModal({ envelope, currentUser, users, departments, sites = [], onClose, onDelegated }: DelegateModalProps) {
  const myRecipient = envelope.recipients.find((r) => r.username === currentUser.username);
  const stepDef = STEP_DEFS[myRecipient?.stepLabel || ''] || {
    color: stepColor(myRecipient?.stepLabel || ''),
    allowedRoles: ALL_ROLES_FOR_CUSTOM,
  };
  const envHomeSiteId = envelope.ownerSiteId;
  // Department rule (hard block, mirrors the server): the delegate must
  // belong to the step's department — primary or via an additional-access
  // grant. Filtering the picker means an invalid choice can't even be selected.
  const requiredDept = envelope.ownerDepartment || '';
  const eligibleUsers = useMemo(
    () =>
      requiredDept
        ? users.filter((u) => u.department === requiredDept || (u.additionalAccess || []).some((g) => g.department === requiredDept))
        : users,
    [users, requiredDept],
  );

  const [toUsername, setToUsername] = useState('');
  const [reason, setReason] = useState('');
  const [pwd, setPwd] = useState('');
  const [err, setErr] = useState('');
  const mutation = useDelegateEnvelope();

  async function handleDelegate() {
    if (!toUsername) return setErr('Pick a user to delegate to.');
    if (!pwd) return setErr('Password is required.');
    setErr('');
    try {
      await mutation.mutateAsync({
        id: envelope.id,
        body: { fromUsername: currentUser.username, fromPassword: pwd, toUsername, reason: reason.trim() },
      });
      onDelegated();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not delegate.');
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !mutation.isPending && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delegate signing task</DialogTitle>
        </DialogHeader>
        <p className="text-[13px] leading-relaxed text-slate">
          Reassign your signing task on <strong className="text-ink">{envelope.title}</strong> to another user.
          Compatible role: {STEP_DEFS[myRecipient?.stepLabel || ''] ? stepDef.allowedRoles.join(' / ') : 'any (capacity-based step)'}.
          {requiredDept && (
            <>
              {' '}
              The delegate must belong to <strong className="text-ink">{requiredDept}</strong>.
            </>
          )}
        </p>
        <div className="flex flex-col gap-1.5">
          <Label>Delegate to *</Label>
          <UserSearchPicker
            users={eligibleUsers}
            departments={departments}
            sites={sites}
            homeSiteId={envHomeSiteId}
            allowedRoles={stepDef.allowedRoles}
            excludeUsernames={[currentUser.username]}
            value={toUsername}
            onChange={setToUsername}
            label="— Search user to delegate —"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="delegate-reason">
            Reason <span className="font-normal text-slate">(optional)</span>
          </Label>
          <textarea
            id="delegate-reason"
            rows={2}
            className="flex w-full rounded-md border border-line-strong bg-paper-raised px-3 py-2 text-sm text-ink shadow-xs outline-none focus-visible:border-seal focus-visible:ring-2 focus-visible:ring-seal-ring"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="delegate-pwd">Your password *</Label>
          <Input id="delegate-pwd" type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} />
        </div>
        {err && <div className="rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-[13px] text-danger">{err}</div>}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button onClick={handleDelegate} disabled={mutation.isPending}>
            {mutation.isPending ? 'Delegating…' : 'Delegate'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
