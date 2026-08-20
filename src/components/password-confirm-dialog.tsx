import { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';

export interface PasswordConfirmAction {
  title: string;
  message?: string;
  confirmLabel?: string;
  requireRole?: boolean;
  roles?: string[];
  initialRole?: string;
  run: (password: string, role?: string) => Promise<void>;
}

interface PasswordConfirmDialogProps {
  action: PasswordConfirmAction | null;
  busy: boolean;
  error: string;
  onConfirm: (password: string, role?: string) => void;
  onClose: () => void;
}

export function PasswordConfirmDialog({ action, busy, error, onConfirm, onClose }: PasswordConfirmDialogProps) {
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('');
  const [reveal, setReveal] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Reset the form when a new action is presented — during render (see the
  // note in components/pagination.tsx for why this beats a useEffect here).
  const [prevAction, setPrevAction] = useState(action);
  if (action !== prevAction) {
    setPrevAction(action);
    if (action) {
      setPassword('');
      setRole(action.initialRole || action.roles?.[0] || '');
      setReveal(false);
    }
  }

  // Auto-hide the revealed password after 2 seconds.
  useEffect(() => {
    if (reveal) {
      clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(() => setReveal(false), 2000);
    }
    return () => clearTimeout(hideTimer.current);
  }, [reveal, password]);

  if (!action) return null;

  function submit() {
    if (!password) return;
    if (action!.requireRole && !role) return;
    onConfirm(password, role);
  }

  return (
    <Dialog open={!!action} onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{action.title}</DialogTitle>
        </DialogHeader>

        {action.message && <p className="text-[13px] leading-relaxed text-slate">{action.message}</p>}

        {action.requireRole && (
          <div className="flex flex-col gap-1.5">
            <Label>New role</Label>
            <Select value={role} onValueChange={setRole} disabled={busy}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(action.roles || []).map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="pw-confirm">Your password (e-signature)</Label>
          <div className="relative">
            <Input
              id="pw-confirm"
              className="pr-14"
              type={reveal ? 'text' : 'password'}
              value={password}
              autoFocus
              autoComplete="off"
              disabled={busy}
              placeholder="Enter your password"
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit();
              }}
            />
            <button
              type="button"
              onClick={() => setReveal((r) => !r)}
              tabIndex={-1}
              disabled={busy}
              title={reveal ? 'Hide' : 'Reveal for 2 seconds'}
              className="absolute top-1/2 right-2.5 -translate-y-1/2 text-[11px] font-bold tracking-wide text-slate hover:text-ink"
            >
              {reveal ? 'HIDE' : 'VIEW'}
            </button>
          </div>
          {reveal && <div className="text-[11px] text-slate">Hiding automatically…</div>}
        </div>

        {error && (
          <div className="rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-[13px] text-danger">
            {error}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy || !password || (action.requireRole && !role)}>
            {busy ? 'Working…' : action.confirmLabel || 'Confirm'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
