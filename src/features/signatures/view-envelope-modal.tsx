import { useState, Suspense, lazy } from 'react';
import {
  FileText,
  Users as UsersIcon,
  ShieldCheck,
  Download,
  Printer,
  Lock,
  Eye,
  ArrowLeftRight,
  Loader2,
} from 'lucide-react';
import { useEnvelopeDetail, useEnvelopeDocument, useReassignSignatory } from '@/features/envelopes/hooks';
import { formatDateTime, STEP_DEFS, stepColor, PRINT_DOWNLOAD_DEPARTMENTS } from '@/features/signatures/constants';
import { StatusBadge } from '@/components/status-badge';
import { ErrorBoundary } from '@/components/error-boundary';
import { AuditTrailTab } from '@/features/signatures/audit-trail-tab';
import { ExternalSignersTab } from '@/features/signatures/external-signers-tab';
import { toast } from '@/lib/toast';
import { ApiRequestError, api } from '@/lib/api';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import type { EnvelopeSummary, EnvelopeRecipientDetail, UserDirectoryEntry, SessionUser } from '@/types/api';

const PdfSignaturePlacer = lazy(() =>
  import('@/features/signatures/pdf-signature-placer').then((m) => ({ default: m.PdfSignaturePlacer })),
);
const PDF_LOADING_FALLBACK = <div className="p-6 text-[13px] text-slate">Loading PDF viewer…</div>;

interface ViewEnvelopeModalProps {
  envelope: EnvelopeSummary;
  currentUser: SessionUser;
  users: UserDirectoryEntry[];
  onReassigned: () => void;
  onClose: () => void;
  canVoid: boolean;
  onVoid: () => void;
}

export function ViewEnvelopeModal({ envelope: envSummary, currentUser, users, onReassigned, onClose, canVoid, onVoid }: ViewEnvelopeModalProps) {
  const [tab, setTab] = useState('documents');
  const [docIdx, setDocIdx] = useState(0);

  const { data: envelope, isLoading: envLoading, error: envError } = useEnvelopeDetail(envSummary.id);
  const { data: docData, isLoading: docLoading, error: docError } = useEnvelopeDocument(envSummary.id, docIdx, tab === 'documents' && !!envelope);

  // Reassign-signatory state (Author changing a pending Reviewer/Approver).
  const [reassignTarget, setReassignTarget] = useState<EnvelopeRecipientDetail | null>(null);
  const [reassignTo, setReassignTo] = useState('');
  const [reassignPw, setReassignPw] = useState('');
  const [reassignReason, setReassignReason] = useState('');
  const [reassignErr, setReassignErr] = useState('');
  const [reassignMismatch, setReassignMismatch] = useState<{ requiredDepartment: string; targetDepartment: string } | null>(null);
  const [mismatchReason, setMismatchReason] = useState('');
  const reassignMutation = useReassignSignatory();

  const isAuthor = envelope?.createdBy === currentUser?.username;
  const envelopeActive = envelope ? ['Sent', 'ReturnedToAuthor'].includes(envelope.status) : false;
  const recipKey = (r: EnvelopeRecipientDetail) => (r.isExternal ? `ext:${(r.email || '').toLowerCase()}` : `usr:${r.username}`);
  function canReassign(r: EnvelopeRecipientDetail) {
    if (r.isExternal) return false;
    return isAuthor && envelopeActive && r.stepLabel !== 'Author' && ['Pending', 'Sent'].includes(r.status);
  }
  const onEnvelope = new Set((envelope?.recipients || []).map((r) => r.username));
  const reassignCandidates = users.filter((u) => u.status === 'Active' && !onEnvelope.has(u.username));

  async function submitReassign() {
    if (!reassignTarget) return;
    setReassignErr('');
    if (!reassignTo) return setReassignErr('Select a replacement user');
    if (!reassignPw) return setReassignErr('Enter your e-signature password');
    if (reassignMismatch && !mismatchReason.trim()) return setReassignErr('A reason is required to reassign outside the department');
    try {
      await reassignMutation.mutateAsync({
        id: envSummary.id,
        body: {
          authorUsername: currentUser.username,
          authorPassword: reassignPw,
          targetStepUsername: reassignTarget.username,
          newUsername: reassignTo,
          reason: reassignReason,
          ...(reassignMismatch ? { acknowledgeDeptMismatch: true, mismatchReason: mismatchReason.trim() } : {}),
        },
      });
      onReassigned();
    } catch (e) {
      if (e instanceof ApiRequestError && e.data?.deptMismatch) {
        setReassignMismatch({
          requiredDepartment: (e.data.requiredDepartment as string) || '',
          targetDepartment: (e.data.targetDepartment as string) || '—',
        });
        setReassignErr('');
      } else {
        setReassignErr(e instanceof Error ? e.message : 'Reassignment failed');
      }
    }
  }

  const docCount = envelope?.documents.length || 0;
  const recipientsSorted = [...(envelope?.recipients || [])].sort((a, b) => (a.routingOrder || 0) - (b.routingOrder || 0));

  // Print/download eligibility — the server computes canPrintDownload
  // authoritatively; this is only a fallback for envelopes predating that
  // flag. Uses the CURRENT user's session data, which is already flat
  // (siteId is a plain id, not a nested object — that's a legacy defensive
  // unwrap for data that no longer has that shape).
  function computeCanPrintDownload(): boolean {
    if (!envelope) return false;
    if (typeof (envelope as unknown as { canPrintDownload?: boolean }).canPrintDownload === 'boolean') {
      return (envelope as unknown as { canPrintDownload: boolean }).canPrintDownload;
    }
    const isCompleted = envelope.status === 'Completed';
    const isCreator = envelope.createdBy === currentUser?.username;
    const grants = currentUser?.additionalAccess || [];
    const myDepts = [currentUser?.department, ...grants.map((g) => g.department)].filter(Boolean);
    const matchedDepts = PRINT_DOWNLOAD_DEPARTMENTS.filter((d) => myDepts.includes(d));
    const siteOk =
      !envelope.ownerSiteId ||
      String(currentUser?.siteId) === String(envelope.ownerSiteId) ||
      grants.some((g) => String(g.siteId) === String(envelope.ownerSiteId) && matchedDepts.includes(g.department));
    return isCompleted && (isCreator || (matchedDepts.length > 0 && siteOk));
  }
  const canPrintDownload = computeCanPrintDownload();
  const matchedDepts = envelope
    ? PRINT_DOWNLOAD_DEPARTMENTS.filter((d) => [currentUser?.department, ...(currentUser?.additionalAccess || []).map((g) => g.department)].includes(d))
    : [];

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Document — {envSummary.title}</DialogTitle>
        </DialogHeader>

        {envLoading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-slate">
            <Loader2 size={18} className="animate-spin" /> Loading envelope…
          </div>
        ) : envError || !envelope ? (
          <div className="rounded-md border border-danger/30 bg-danger-soft px-3 py-2.5 text-[13px] text-danger">
            {envError instanceof Error ? envError.message : 'Could not load envelope.'}
          </div>
        ) : (
          <>
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList>
                <TabsTrigger value="documents">
                  <FileText size={14} /> Documents
                </TabsTrigger>
                <TabsTrigger value="workflow">
                  <UsersIcon size={14} /> Workflow
                </TabsTrigger>
                <TabsTrigger value="external">
                  <UsersIcon size={14} /> External Signers
                </TabsTrigger>
                <TabsTrigger value="audit">
                  <ShieldCheck size={14} /> Audit Trail
                </TabsTrigger>
              </TabsList>

              <TabsContent value="documents">
                {docCount > 1 && (
                  <div className="mb-2.5 flex flex-wrap gap-1.5">
                    {envelope.documents.map((d, i) => (
                      <Button key={i} variant={docIdx === i ? 'default' : 'ghost'} size="sm" onClick={() => setDocIdx(i)}>
                        Doc {i + 1}: {d.fileName?.slice(0, 24)}
                      </Button>
                    ))}
                  </div>
                )}
                {envelope.documents[docIdx]?.documentNumber && (
                  <div className="mb-2.5 text-[13px]">
                    <span className="text-slate">Document Number: </span>
                    <strong className="text-ink">{envelope.documents[docIdx].documentNumber}</strong>
                  </div>
                )}
                {docLoading && <div className="py-4 text-center text-[13px] text-slate">Loading PDF…</div>}
                {docError && (
                  <div className="mb-2.5 rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-[13px] text-danger">
                    {docError instanceof Error ? docError.message : 'Could not load document.'}
                  </div>
                )}
                {docData && (
                  <>
                    <div className="mb-2.5 flex items-center justify-end gap-2">
                      {!canPrintDownload && (
                        <span className="mr-auto text-[12px] text-slate">
                          {envelope.status !== 'Completed' ? (
                            <span className="inline-flex items-center gap-1.5">
                              <Lock size={13} /> Print & download available once fully signed
                            </span>
                          ) : matchedDepts.length > 0 ? (
                            <span className="inline-flex items-center gap-1.5">
                              <Eye size={13} /> View only — restricted to this site's members
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5">
                              <Eye size={13} /> View only — print/download restricted to the initiator and{' '}
                              {PRINT_DOWNLOAD_DEPARTMENTS.join(' / ')}
                            </span>
                          )}
                        </span>
                      )}
                      {canPrintDownload && (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={async () => {
                              try {
                                const name = (envelope.documents[docIdx]?.fileName || envelope.title || 'document').replace(/\.pdf$/i, '') + '-signed.pdf';
                                await api.downloadSignedDocument(envSummary.id, docIdx, name);
                              } catch (e) {
                                toast.error(e instanceof Error ? e.message : 'Download failed.');
                              }
                            }}
                          >
                            <Download size={13} /> Download
                          </Button>
                          <Button
                            size="sm"
                            onClick={async () => {
                              try {
                                await api.printSignedDocument(envSummary.id, docIdx);
                              } catch (e) {
                                toast.error(e instanceof Error ? e.message : 'Print failed.');
                              }
                            }}
                          >
                            <Printer size={13} /> Print
                          </Button>
                        </>
                      )}
                    </div>
                    <ErrorBoundary label="Document preview">
                      <Suspense fallback={PDF_LOADING_FALLBACK}>
                        <PdfSignaturePlacer
                          fileSource={{ type: 'base64', data: docData.fileData }}
                          recipients={envelope.recipients}
                          boxes={docData.signatureFields.map((sf) => ({ ...sf }))}
                          mode="preview"
                          appliedSignatures={docData.appliedSignatures}
                          effectiveDateFields={docData.effectiveDateFields}
                          appliedEffectiveDates={docData.appliedEffectiveDates}
                          annotations={docData.appliedAnnotations}
                        />
                      </Suspense>
                    </ErrorBoundary>
                  </>
                )}
              </TabsContent>

              <TabsContent value="workflow">
                <div className="mb-3.5 space-y-1 text-[13px] leading-relaxed">
                  <div>
                    <strong>Status:</strong> {envelope.status}
                  </div>
                  {(envelope.round || 1) > 1 && (
                    <div>
                      <strong>Round:</strong> {envelope.round} <span className="text-[12px] text-slate">(re-sent after return)</span>
                    </div>
                  )}
                  <div>
                    <strong>Sender:</strong> {envelope.createdBy}
                  </div>
                  <div>
                    <strong>Routing:</strong> {envelope.routingType}
                  </div>
                  <div>
                    <strong>Created:</strong> {formatDateTime(envelope.createdAt)}
                  </div>
                  {envelope.completedAt && (
                    <div>
                      <strong>Completed:</strong> {formatDateTime(envelope.completedAt)}
                    </div>
                  )}
                </div>
                <Label className="mb-2 block">Recipients</Label>
                {recipientsSorted.map((r, i) => (
                  <div key={i} className="mb-2 rounded-md border border-line bg-paper px-3 py-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <strong className="text-[13px]" style={{ color: (STEP_DEFS[r.stepLabel] || { color: stepColor(r.stepLabel) }).color }}>
                        {r.stepLabel || r.role}
                      </strong>
                      <StatusBadge status={r.status} />
                    </div>
                    <div className="mt-0.5 text-[13px] text-ink">
                      {r.isExternal ? r.email || '—' : r.fullName || r.username}
                      {r.isExternal && <span className="ml-1.5 text-[9.5px] font-bold text-violet">EXTERNAL</span>}
                    </div>
                    <div className="mt-0.5 text-[11px] text-slate">
                      order #{r.routingOrder} · {r.isExternal ? r.email || '—' : `@${r.username}`}
                      {!r.isExternal && r.department ? ` · ${r.department}` : ''}
                    </div>
                    {r.delegatedFrom && (
                      <div className="mt-1 flex items-center gap-1.5 text-[12px] text-warning">
                        <ArrowLeftRight size={12} /> Delegated from {r.delegatedFrom}
                      </div>
                    )}
                    {r.actionAt && <div className="mt-0.5 text-[11px] text-slate">Acted: {formatDateTime(r.actionAt)}</div>}

                    {canReassign(r) && (!reassignTarget || recipKey(reassignTarget) !== recipKey(r)) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="mt-2 h-7 px-2"
                        onClick={() => {
                          setReassignTarget(r);
                          setReassignTo('');
                          setReassignPw('');
                          setReassignReason('');
                          setReassignErr('');
                          setReassignMismatch(null);
                          setMismatchReason('');
                        }}
                      >
                        <ArrowLeftRight size={12} /> Reassign
                      </Button>
                    )}

                    {reassignTarget && recipKey(reassignTarget) === recipKey(r) && (
                      <div className="mt-2.5 rounded-md border border-line bg-paper-raised p-3">
                        <div className="mb-2 text-[12px] font-semibold text-ink">
                          Reassign {r.stepLabel} — currently @{r.username}
                        </div>
                        <Label className="mb-1 block">Replace with</Label>
                        <Select
                          value={reassignTo}
                          onValueChange={(v) => {
                            setReassignTo(v);
                            setReassignMismatch(null);
                            setMismatchReason('');
                            setReassignErr('');
                          }}
                        >
                          <SelectTrigger className="mb-2 w-full">
                            <SelectValue placeholder="Select a user…" />
                          </SelectTrigger>
                          <SelectContent>
                            {reassignCandidates.map((u) => (
                              <SelectItem key={u.username} value={u.username}>
                                {u.fullName || u.username} (@{u.username}){u.department ? ` · ${u.department}` : ''}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Label className="mb-1 block">Reason (recorded in audit trail)</Label>
                        <Input
                          className="mb-2"
                          value={reassignReason}
                          onChange={(e) => setReassignReason(e.target.value)}
                          placeholder="e.g. original reviewer on leave"
                        />
                        <Label className="mb-1 block">Your e-signature password</Label>
                        <Input
                          type="password"
                          className="mb-2"
                          value={reassignPw}
                          onChange={(e) => setReassignPw(e.target.value)}
                          placeholder="Confirm your identity"
                          autoComplete="off"
                        />
                        {reassignMismatch && (
                          <div className="mb-2 rounded-md border border-warning/30 bg-warning-soft p-3">
                            <div className="mb-1 text-[12px] font-bold text-warning">Department mismatch</div>
                            <div className="mb-2 text-[12px] leading-relaxed text-ink-soft">
                              This step belongs to <strong>{reassignMismatch.requiredDepartment}</strong>, but the selected user is in{' '}
                              <strong>{reassignMismatch.targetDepartment}</strong>. You may proceed, but a reason is required and this
                              override will be recorded in the audit trail.
                            </div>
                            <Label className="mb-1 block">Reason for cross-department reassignment *</Label>
                            <textarea
                              rows={2}
                              className="w-full rounded-md border border-line-strong bg-paper-raised px-2.5 py-1.5 text-[13px] text-ink outline-none focus-visible:border-seal focus-visible:ring-2 focus-visible:ring-seal-ring"
                              value={mismatchReason}
                              onChange={(e) => setMismatchReason(e.target.value)}
                              placeholder="e.g. no eligible signatory available in the department"
                            />
                          </div>
                        )}
                        {reassignErr && <div className="mb-2 text-[12px] text-danger">{reassignErr}</div>}
                        <div className="flex gap-2">
                          <Button size="sm" disabled={reassignMutation.isPending} onClick={submitReassign}>
                            {reassignMutation.isPending ? 'Reassigning…' : reassignMismatch ? 'Confirm Cross-Department Reassignment' : 'Confirm Reassignment'}
                          </Button>
                          <Button variant="ghost" size="sm" disabled={reassignMutation.isPending} onClick={() => setReassignTarget(null)}>
                            Cancel
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </TabsContent>

              <TabsContent value="external">
                <ExternalSignersTab envelope={envelope} onChanged={onReassigned} />
              </TabsContent>

              <TabsContent value="audit">
                <AuditTrailTab envelopeId={envSummary.id} envelope={envelope} />
              </TabsContent>
            </Tabs>

            <DialogFooter>
              {canVoid && (
                <Button variant="destructive" onClick={onVoid} title="Cancel this document (reason + e-signature on the next step)">
                  Cancel Document
                </Button>
              )}
              <Button variant="ghost" onClick={onClose}>
                Close
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
