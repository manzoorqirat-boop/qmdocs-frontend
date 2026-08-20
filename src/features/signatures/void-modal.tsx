import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useVoidEnvelope } from '@/features/envelopes/hooks';
import type { EnvelopeSummary } from '@/types/api';

interface VoidModalProps {
  envelope: EnvelopeSummary;
  currentUsername: string;
  onClose: () => void;
  onVoided: () => void;
}

export function VoidModal({ envelope, currentUsername, onClose, onVoided }: VoidModalProps) {
  const [reason, setReason] = useState('');
  const [pwd, setPwd] = useState('');
  const [err, setErr] = useState('');
  const mutation = useVoidEnvelope();

  async function handleVoid() {
    if (!reason.trim()) return setErr('A reason is required.');
    if (!pwd) return setErr('Password is required.');
    setErr('');
    try {
      await mutation.mutateAsync({ id: envelope.id, body: { username: currentUsername, password: pwd, reason: reason.trim() } });
      onVoided();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not cancel document.');
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !mutation.isPending && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancel document</DialogTitle>
        </DialogHeader>
        <p className="text-[13px] leading-relaxed text-slate">
          Cancelling <strong className="text-ink">{envelope.title}</strong> permanently cancels all outstanding signatures.
        </p>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="void-reason">Reason *</Label>
          <textarea
            id="void-reason"
            rows={3}
            className="flex w-full rounded-md border border-line-strong bg-paper-raised px-3 py-2 text-sm text-ink shadow-xs outline-none focus-visible:border-seal focus-visible:ring-2 focus-visible:ring-seal-ring"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="void-pwd">Your password *</Label>
          <Input id="void-pwd" type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} />
        </div>
        {err && <div className="rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-[13px] text-danger">{err}</div>}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleVoid} disabled={mutation.isPending}>
            {mutation.isPending ? 'Cancelling…' : 'Cancel document'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
