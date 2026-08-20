import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { useUpdateUserRoles } from '@/features/users/hooks';
import type { UserDirectoryEntry } from '@/types/api';

const ROLES = ['Author', 'Reviewer', 'Approver', 'IT Admin', 'Administrator'];
const ELEVATED = ['IT Admin', 'Administrator'];

interface MultiRoleDialogProps {
  target: UserDirectoryEntry;
  actorRole: string | undefined;
  onClose: () => void;
  onSaved: () => void;
}

// Assign one or more roles; the ACTIVE role is what the user acts as now.
// Users holding several roles pick their acting role at each sign-in.
// Granting IT Admin/Administrator requires the Administrator role (enforced
// server-side too). Confirmed with the admin's own password (e-signature).
export function MultiRoleDialog({ target, actorRole, onClose, onSaved }: MultiRoleDialogProps) {
  const initial = target.roles && target.roles.length ? target.roles : [target.role];
  const [selected, setSelected] = useState<string[]>(initial);
  const [activeRole, setActiveRole] = useState(target.role);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const mutation = useUpdateUserRoles();

  function toggle(r: string) {
    setSelected((prev) => {
      const next = prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r];
      if (!next.includes(activeRole) && next.length) setActiveRole(next[0]);
      return next;
    });
  }

  async function save() {
    setError('');
    if (!selected.length) return setError('Select at least one role');
    if (!selected.includes(activeRole)) return setError('The active role must be one of the selected roles');
    if (!password) return setError('Enter your password to confirm');
    try {
      await mutation.mutateAsync({ id: target.id, activeRole, roles: selected, adminPassword: password });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save roles.');
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !mutation.isPending && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Roles — {target.fullName || target.username}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-1.5">
          <Label>Assigned roles (one or more)</Label>
          <div className="flex flex-col gap-2">
            {ROLES.map((r) => {
              const restricted = ELEVATED.includes(r) && actorRole !== 'Administrator';
              return (
                <label
                  key={r}
                  className="flex items-center gap-2 text-[13.5px]"
                  style={{ opacity: restricted && !selected.includes(r) ? 0.5 : 1 }}
                >
                  <Checkbox
                    checked={selected.includes(r)}
                    disabled={restricted && !selected.includes(r)}
                    onCheckedChange={() => toggle(r)}
                  />
                  {r}
                  {ELEVATED.includes(r) ? ' (Administrator grant only)' : ''}
                </label>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Active role (acting as now)</Label>
          <Select value={activeRole} onValueChange={setActiveRole}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {selected.map((r) => (
                <SelectItem key={r} value={r}>
                  {r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selected.length > 1 && (
            <p className="text-[11.5px] text-slate">
              With multiple roles, the user chooses their acting role at each sign-in (like site selection). Each
              switch is recorded in the audit trail.
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="mr-password">
            Your password (e-signature) <span className="text-danger">*</span>
          </Label>
          <Input
            id="mr-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </div>

        {error && (
          <div className="rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-[13px] text-danger">
            {error}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button onClick={save} disabled={mutation.isPending}>
            {mutation.isPending ? 'Saving…' : 'Save roles'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
