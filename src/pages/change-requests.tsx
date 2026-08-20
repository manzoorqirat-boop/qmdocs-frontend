import { useState } from 'react';
import { ClipboardCheck, ArrowRight } from 'lucide-react';
import { useSession } from '@/features/auth/session-context';
import { useChangeRequests, useMyChangeRequests, useApproveChangeRequest, useRejectChangeRequest, useWithdrawChangeRequest } from '@/features/change-requests/hooks';
import { formatDateTime } from '@/features/signatures/constants';
import { toast } from '@/lib/toast';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import type { ChangeRequestSummary } from '@/types/api';

const FIELD_LABELS: Record<string, string> = { name: 'Name', code: 'Code', description: 'Description', isActive: 'Active', sites: 'Sites' };
const fieldLabel = (k: string) => FIELD_LABELS[k] || k;
function fmtVal(v: unknown): string {
  if (Array.isArray(v)) return v.length ? v.join(', ') : '—';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  return String(v ?? '—') || '—';
}
// payload/before are JSON-encoded STRINGS on the wire (the backend's
// ChangeRequest entity stores them as raw JSON text columns — checked
// directly). Parse defensively; a malformed/empty value renders as "no
// data" rather than throwing.
function safeParse(json: string | null | undefined): Record<string, unknown> {
  if (!json) return {};
  try {
    const v = JSON.parse(json);
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

const ACTION_COLOR: Record<string, string> = { CREATE: '#15803d', UPDATE: '#b45309', DEACTIVATE: '#c0362c' };

function DiffView({ cr }: { cr: ChangeRequestSummary }) {
  const before = safeParse(cr.before);
  const after = safeParse(cr.payload);
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((k) => k !== 'siteId' && k !== 'siteIds');

  if (cr.action === 'CREATE') {
    return (
      <div className="text-[13px]">
        <div className="mb-1.5 text-slate">New {cr.entityType}:</div>
        {Object.entries(after)
          .filter(([k]) => k !== 'siteId' && k !== 'siteIds')
          .map(([k, v]) => (
            <div key={k} className="flex gap-2 py-0.5">
              <span className="min-w-[120px] text-ink-soft">{fieldLabel(k)}</span>
              <span className="font-semibold">{fmtVal(v)}</span>
            </div>
          ))}
      </div>
    );
  }
  if (cr.action === 'DEACTIVATE') {
    return (
      <div className="text-[13px] text-danger">
        Deactivate {cr.entityType}: <strong>{cr.targetLabel}</strong>
      </div>
    );
  }
  const changed = keys.filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]) && after[k] !== undefined);
  if (changed.length === 0) return <div className="text-[13px] text-slate">No field changes.</div>;
  return (
    <div className="text-[13px]">
      {changed.map((k) => (
        <div key={k} className="flex items-center gap-2 py-0.5">
          <span className="min-w-[120px] text-ink-soft">{fieldLabel(k)}</span>
          <span className="text-danger line-through">{fmtVal(before[k])}</span>
          <ArrowRight size={13} className="text-slate" />
          <span className="font-semibold text-success">{fmtVal(after[k])}</span>
        </div>
      ))}
    </div>
  );
}

type Tab = 'Pending' | 'Approved' | 'Rejected' | 'Mine';

export function ChangeRequestsPage() {
  const { user } = useSession();
  const isChecker = ['Approver', 'IT Admin', 'Administrator'].includes(user?.role || '');
  const [tab, setTab] = useState<Tab>(isChecker ? 'Pending' : 'Mine');

  const listQuery = useChangeRequests(tab === 'Mine' ? undefined : tab);
  const mineQuery = useMyChangeRequests();
  const { data: requests = [], isLoading, error } = tab === 'Mine' ? mineQuery : listQuery;

  const approve = useApproveChangeRequest();
  const reject = useRejectChangeRequest();
  const withdraw = useWithdrawChangeRequest();

  const [decision, setDecision] = useState<{ cr: ChangeRequestSummary; mode: 'approve' | 'reject' } | null>(null);
  const [password, setPassword] = useState('');
  const [reason, setReason] = useState('');
  const [decisionErr, setDecisionErr] = useState('');
  const [withdrawTarget, setWithdrawTarget] = useState<ChangeRequestSummary | null>(null);

  function openDecision(cr: ChangeRequestSummary, mode: 'approve' | 'reject') {
    setDecision({ cr, mode });
    setPassword('');
    setReason('');
    setDecisionErr('');
  }
  async function submitDecision() {
    if (!decision) return;
    const { cr, mode } = decision;
    if (mode === 'approve' && !password) return setDecisionErr('Your password is required to e-sign the approval');
    if (mode === 'reject' && !reason.trim()) return setDecisionErr('A rejection reason is required');
    setDecisionErr('');
    try {
      if (mode === 'approve') await approve.mutateAsync({ id: cr.id, body: { password, reason } });
      else await reject.mutateAsync({ id: cr.id, body: { reason } });
      setDecision(null);
    } catch (e) {
      setDecisionErr(e instanceof Error ? e.message : 'Action failed');
    }
  }
  async function confirmWithdraw() {
    if (!withdrawTarget) return;
    try {
      await withdraw.mutateAsync(withdrawTarget.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not withdraw.');
    } finally {
      setWithdrawTarget(null);
    }
  }

  const busy = approve.isPending || reject.isPending;

  return (
    <div className="mx-auto max-w-4xl">
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-1.5">
              <ClipboardCheck size={17} className="text-seal" /> Change Requests
            </CardTitle>
            <CardDescription className="font-record uppercase">Maker-checker approval · master data</CardDescription>
          </div>
          <div className="flex gap-1.5">
            {(isChecker ? (['Pending', 'Approved', 'Rejected', 'Mine'] as const) : (['Mine'] as const)).map((t) => (
              <Button key={t} size="sm" variant={tab === t ? 'default' : 'ghost'} onClick={() => setTab(t)}>
                {t === 'Mine' ? 'My Requests' : t}
              </Button>
            ))}
          </div>
        </CardHeader>
        <div className="px-5 pb-5">
          {error && (
            <div className="mb-3 rounded-md border border-danger/30 bg-danger-soft px-3 py-2.5 text-[13px] text-danger">
              {error instanceof Error ? error.message : 'Failed to load change requests'}
            </div>
          )}

          {isLoading ? (
            <div className="py-8 text-center text-[13px] text-slate">Loading…</div>
          ) : requests.length === 0 ? (
            <div className="py-8 text-center text-[13px] text-slate">
              {tab === 'Mine' ? 'You have not raised any change requests.' : `No ${tab.toLowerCase()} change requests.`}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {requests.map((cr) => (
                <div key={cr.id} className="rounded-md border border-line bg-paper-raised p-3.5">
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <div>
                      <span
                        className="mr-2 rounded px-2 py-0.5 text-[11px] font-bold"
                        style={{ background: `${ACTION_COLOR[cr.action] || '#888'}22`, color: ACTION_COLOR[cr.action] || '#888' }}
                      >
                        {cr.action}
                      </span>
                      <span className="font-semibold">{cr.entityType}</span>
                      <span className="text-slate"> · {cr.targetLabel}</span>
                    </div>
                    <div className="text-right text-[11px] text-slate">
                      by <strong>{cr.requestedBy}</strong>
                      <br />
                      {formatDateTime(cr.requestedAt)}
                    </div>
                  </div>

                  <div className="mb-2.5 rounded-md bg-paper p-2.5">
                    <DiffView cr={cr} />
                  </div>

                  {cr.requestReason && (
                    <div className="mb-2 text-[12px] text-ink-soft">
                      <strong>Reason:</strong> {cr.requestReason}
                    </div>
                  )}

                  {cr.status === 'Pending' ? (
                    <div className="flex items-center justify-end gap-1.5">
                      {cr.requestedBy === user?.username ? (
                        <>
                          <span className="mr-auto text-[11px] text-slate">You raised this — another QA Approver must decide (4-eyes).</span>
                          <Button variant="ghost" size="sm" onClick={() => setWithdrawTarget(cr)}>
                            Withdraw
                          </Button>
                        </>
                      ) : isChecker ? (
                        <>
                          <Button variant="outline" size="sm" className="border-danger/30 text-danger hover:bg-danger-soft" onClick={() => openDecision(cr, 'reject')}>
                            Reject
                          </Button>
                          <Button size="sm" onClick={() => openDecision(cr, 'approve')}>
                            Approve & Sign
                          </Button>
                        </>
                      ) : (
                        <span className="text-[11px] text-slate">Pending QA decision</span>
                      )}
                    </div>
                  ) : (
                    <div className="text-right text-[12px] text-slate">
                      {cr.status} by <strong>{cr.decidedBy}</strong> · {formatDateTime(cr.decidedAt)}
                      {cr.decisionReason ? ` · ${cr.decisionReason}` : ''}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      <Dialog open={!!decision} onOpenChange={(open) => !open && !busy && setDecision(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{decision?.mode === 'approve' ? 'Approve & E-Sign' : 'Reject Change Request'}</DialogTitle>
          </DialogHeader>
          {decision && (
            <>
              <div className="text-[13px]">
                <strong>{decision.cr.action}</strong> {decision.cr.entityType} · {decision.cr.targetLabel}
              </div>
              {decision.mode === 'approve' ? (
                <>
                  <p className="text-[12px] leading-relaxed text-slate">
                    By signing, you attest: "I approve this {decision.cr.action.toLowerCase()} of {decision.cr.entityType} with
                    an electronic signature using QMDOCS."
                  </p>
                  <div className="flex flex-col gap-1.5">
                    <Label>Your Password (e-signature) *</Label>
                    <Input type="password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label>
                      Comment <span className="font-normal text-slate">(optional)</span>
                    </Label>
                    <Input value={reason} onChange={(e) => setReason(e.target.value)} />
                  </div>
                </>
              ) : (
                <div className="flex flex-col gap-1.5">
                  <Label>Rejection Reason *</Label>
                  <textarea
                    rows={3}
                    autoFocus
                    className="w-full rounded-md border border-line-strong bg-paper-raised px-3 py-2 text-sm text-ink outline-none focus-visible:border-seal focus-visible:ring-2 focus-visible:ring-seal-ring"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </div>
              )}
              {decisionErr && <div className="rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-[13px] text-danger">{decisionErr}</div>}
            </>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDecision(null)} disabled={busy}>
              Cancel
            </Button>
            <Button variant={decision?.mode === 'reject' ? 'destructive' : 'default'} onClick={submitDecision} disabled={busy}>
              {busy ? 'Submitting…' : decision?.mode === 'approve' ? 'Sign & Approve' : 'Reject'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!withdrawTarget} onOpenChange={(open) => !open && setWithdrawTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Withdraw this pending request?</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone. You can raise a new request afterward if needed.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmWithdraw}>Withdraw</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
