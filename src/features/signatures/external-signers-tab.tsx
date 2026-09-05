import { useState, useCallback, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { TableSkeleton } from '@/components/ui/skeleton';
import { ApiRequestError } from '@/lib/api';
import type { EnvelopeSummary, EnvelopeDetail, ExternalSignerRow, ExternalTokenStatus } from '@/types/api';

const STATUS_VARIANT: Record<string, 'default' | 'info' | 'warning' | 'success' | 'danger'> = {
  Issued: 'default',
  Opened: 'info',
  Verified: 'info',
  Released: 'warning',
  Signed: 'success',
  Expired: 'danger',
  Revoked: 'danger',
};

type PendingAction = { kind: 'release' | 'revoke' | 'regenerate'; tokenId: string; email: string };

interface ExternalSignersTabProps {
  envelope: EnvelopeSummary | EnvelopeDetail;
  onChanged?: () => void;
}

// Lets an internal user add an external vendor (issues + emails a signing
// link), see each vendor's live status, RELEASE an opened link (the
// internal gate, e-signature required), and revoke/regenerate links.
export function ExternalSignersTab({ envelope, onChanged }: ExternalSignersTabProps) {
  const qc = useQueryClient();
  const queryKey = ['envelopes', envelope.id, 'external'];
  const { data, isLoading, error: queryError } = useQuery({
    queryKey,
    queryFn: () => api.getExternalSigners(envelope.id),
  });
  const rows = data?.recipients;

  const load = useCallback(() => qc.invalidateQueries({ queryKey }), [qc, queryKey]);

  // Auto-poll while any vendor is still in a pending state, so the tab
  // updates live when a vendor opens the link without a manual refresh.
  useEffect(() => {
    if (!rows || rows.length === 0) return;
    const pending = rows.some((r) => ['Issued', 'Opened', 'Released', 'Verified'].includes(r.token?.status || r.status || ''));
    if (!pending) return;
    const id = setInterval(load, 10000);
    return () => clearInterval(id);
  }, [rows, load]);

  // Add-vendor form
  const [showAdd, setShowAdd] = useState(false);
  const [email, setEmail] = useState('');
  const [label, setLabel] = useState('Vendor');
  const [validity, setValidity] = useState(7);
  const [addPw, setAddPw] = useState('');
  const [addErr, setAddErr] = useState('');
  const [addBusy, setAddBusy] = useState(false);

  async function submitAdd() {
    setAddErr('');
    if (!email.trim()) return setAddErr('Vendor email is required');
    if (!addPw) return setAddErr('Enter your e-signature password');
    const v = Number(validity);
    if (!Number.isFinite(v) || v < 1 || v > 30) return setAddErr('Validity must be 1–30 days');
    setAddBusy(true);
    try {
      const r = await api.addExternalSigner(envelope.id, { email: email.trim(), stepLabel: label.trim() || 'Vendor', validityDays: v, password: addPw });
      setEmail('');
      setAddPw('');
      setShowAdd(false);
      if (r.emailSent) toast.success(`Signing link sent to ${email.trim()}`);
      else toast.error('Link created, but email failed to send — check SMTP');
      await load();
      onChanged?.();
    } catch (e) {
      setAddErr(e instanceof Error ? e.message : 'Could not add signer.');
    } finally {
      setAddBusy(false);
    }
  }

  // Per-action e-sig prompt.
  const [action, setAction] = useState<PendingAction | null>(null);
  const [actionPw, setActionPw] = useState('');
  const [actionReason, setActionReason] = useState('');
  const [actionErr, setActionErr] = useState('');
  const [actionBusy, setActionBusy] = useState(false);

  async function submitAction() {
    if (!action) return;
    if (!actionPw) return setActionErr('Enter your e-signature password');
    setActionBusy(true);
    setActionErr('');
    try {
      const body = { password: actionPw, reason: actionReason.trim() };
      if (action.kind === 'release') await api.releaseExternalSigner(envelope.id, action.tokenId, body);
      else if (action.kind === 'revoke') await api.revokeExternalLink(envelope.id, action.tokenId, body);
      else await api.regenerateExternalLink(envelope.id, action.tokenId, body);
      setAction(null);
      setActionPw('');
      setActionReason('');
      await load();
      onChanged?.();
    } catch (e) {
      setActionErr(e instanceof ApiRequestError ? e.message : e instanceof Error ? e.message : 'Action failed.');
    } finally {
      setActionBusy(false);
    }
  }

  return (
    <div>
      {queryError && (
        <div className="mb-3 rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-[13px] text-danger">
          {queryError instanceof Error ? queryError.message : 'Failed to load external signers.'}
        </div>
      )}

      <div className="mb-3 flex items-start justify-between gap-3">
        <p className="text-[12.5px] text-slate">
          External vendors are added as signatories when the document is created. This tab shows each vendor's
          status; release a vendor after they open their link, or resend/revoke a link as needed.
        </p>
        <Button size="sm" variant="ghost" className="shrink-0" onClick={() => setShowAdd(true)}>
          <Plus size={14} /> Add vendor
        </Button>
      </div>

      {isLoading ? (
        <div className="py-2"><TableSkeleton rows={4} columns={4} label="Loading external signers" /></div>
      ) : !rows || rows.length === 0 ? (
        <div className="py-6 text-center text-[13px] text-slate">No external signers on this document.</div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Vendor</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Details</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r: ExternalSignerRow, i: number) => {
              const st: ExternalTokenStatus = r.token?.status || r.status || '';
              return (
                <TableRow key={i}>
                  <TableCell>
                    <div className="font-semibold text-ink">{r.email}</div>
                    <div className="text-[11px] text-slate">
                      {r.stepLabel}
                      {r.identity?.fullName ? ` · ${r.identity.fullName}` : ''}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[st] || 'default'}>{st || '—'}</Badge>
                  </TableCell>
                  <TableCell className="text-[11.5px] text-slate">
                    {r.releasedBy && <div>Released by {r.releasedBy}</div>}
                    {r.identity?.organization && <div>{r.identity.organization}</div>}
                    {r.token?.expiresAt && !['Signed', 'Revoked', 'Expired'].includes(st) && (
                      <div>Expires {new Date(r.token.expiresAt).toLocaleDateString()}</div>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {st === 'Opened' && r.token && (
                      <Button size="sm" onClick={() => setAction({ kind: 'release', tokenId: r.token!.id, email: r.email })}>
                        Release
                      </Button>
                    )}
                    {['Issued', 'Opened', 'Released', 'Verified'].includes(st) && r.token && (
                      <>
                        <Button variant="ghost" size="sm" className="ml-1.5" onClick={() => setAction({ kind: 'regenerate', tokenId: r.token!.id, email: r.email })}>
                          Resend
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="ml-1.5 border-danger/30 text-danger hover:bg-danger-soft"
                          onClick={() => setAction({ kind: 'revoke', tokenId: r.token!.id, email: r.email })}
                        >
                          Revoke
                        </Button>
                      </>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      <Dialog open={showAdd} onOpenChange={(open) => !open && !addBusy && setShowAdd(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add external vendor</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label>Vendor email *</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Role label</Label>
              <Input value={label} onChange={(e) => setLabel(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Link valid (days)</Label>
              <Input type="number" min={1} max={30} value={validity} onChange={(e) => setValidity(Number(e.target.value))} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Your e-signature password *</Label>
            <Input type="password" value={addPw} onChange={(e) => setAddPw(e.target.value)} />
          </div>
          {addErr && <div className="rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-[13px] text-danger">{addErr}</div>}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowAdd(false)} disabled={addBusy}>
              Cancel
            </Button>
            <Button onClick={submitAdd} disabled={addBusy}>
              {addBusy ? 'Adding…' : 'Add & send link'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!action} onOpenChange={(open) => !open && !actionBusy && setAction(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {action?.kind === 'release' ? 'Release vendor for signing' : action?.kind === 'revoke' ? 'Revoke signing link' : 'Resend signing link'}
            </DialogTitle>
          </DialogHeader>
          <p className="text-[13px] text-slate">
            {action?.kind === 'release' && (
              <>
                Authorize <strong className="text-ink">{action.email}</strong> to proceed to signing. They will then
                verify their email with a one-time code.
              </>
            )}
            {action?.kind === 'revoke' && (
              <>
                Revoke the signing link for <strong className="text-ink">{action.email}</strong>. The link stops
                working immediately.
              </>
            )}
            {action?.kind === 'regenerate' && (
              <>
                Issue a fresh link for <strong className="text-ink">{action.email}</strong> (valid 7 days). Any
                previous link stops working.
              </>
            )}
          </p>
          {action?.kind === 'revoke' && (
            <div className="flex flex-col gap-1.5">
              <Label>
                Reason <span className="font-normal text-slate">(optional)</span>
              </Label>
              <Input value={actionReason} onChange={(e) => setActionReason(e.target.value)} />
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <Label>Your e-signature password *</Label>
            <Input type="password" value={actionPw} onChange={(e) => setActionPw(e.target.value)} autoFocus />
          </div>
          {actionErr && <div className="rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-[13px] text-danger">{actionErr}</div>}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAction(null)} disabled={actionBusy}>
              Cancel
            </Button>
            <Button variant={action?.kind === 'revoke' ? 'destructive' : 'default'} disabled={actionBusy} onClick={submitAction}>
              {actionBusy ? 'Working…' : 'Confirm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
