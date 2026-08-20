import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { useUpdateUserProfile } from '@/features/users/hooks';
import type { UserDirectoryEntry } from '@/types/api';

interface ProfileDialogProps {
  target: UserDirectoryEntry;
  designations: string[];
  onClose: () => void;
  onSaved: (u: { id: string; fullName: string; email: string; designation: string }) => void;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Email and full name are editable (e.g. a wrongly entered email). Username
// is locked: it's the identity every audit-trail entry and signature
// references, so renaming it would orphan the history.
export function ProfileDialog({ target, designations, onClose, onSaved }: ProfileDialogProps) {
  const [fullName, setFullName] = useState(target.fullName || '');
  const [email, setEmail] = useState(target.email || '');
  const [designation, setDesignation] = useState(target.designation || '');
  const [error, setError] = useState('');
  const mutation = useUpdateUserProfile();

  async function save() {
    setError('');
    if (!fullName.trim()) return setError('Full name cannot be blank');
    if (email.trim() && !EMAIL_RE.test(email.trim())) return setError('Invalid email address');
    try {
      await mutation.mutateAsync({
        id: target.id,
        body: { fullName: fullName.trim(), email: email.trim(), designation: designation.trim() },
      });
      onSaved({ id: target.id, fullName: fullName.trim(), email: email.trim(), designation: designation.trim() });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save profile.');
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !mutation.isPending && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit — {target.username}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-1.5">
          <Label>Username</Label>
          <Input value={target.username} disabled title="Locked — the username is the audit-trail identity" />
          <p className="text-[11.5px] text-slate">Locked — every audit entry and signature references this identity.</p>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="prof-fullname">
            Full name <span className="text-danger">*</span>
          </Label>
          <Input id="prof-fullname" value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="prof-email">Email</Label>
          <Input
            id="prof-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="user@company.com"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Designation</Label>
          <Select value={designation || '__none'} onValueChange={(v) => setDesignation(v === '__none' ? '' : v)}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select designation" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none">— Select designation —</SelectItem>
              {designation && !designations.includes(designation) && (
                <SelectItem value={designation}>{designation}</SelectItem>
              )}
              {designations.map((d) => (
                <SelectItem key={d} value={d}>
                  {d}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
            {mutation.isPending ? 'Saving…' : 'Save changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
