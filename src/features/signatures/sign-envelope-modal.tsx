import { useState, Suspense, lazy } from 'react';
import { ArrowLeft, ArrowLeftRight, PenLine, Shield, ShieldCheck, X, Loader2 } from 'lucide-react';
import { useEnvelopeDetail, useEnvelopeDocument, useSignEnvelope, useDeclineEnvelope, usePushbackEnvelope } from '@/features/envelopes/hooks';
import { SIGNING_MEANING, todayISO } from '@/features/signatures/constants';
import { ErrorBoundary } from '@/components/error-boundary';
import { SignaturePad } from '@/features/signatures/signature-pad';
import { AuditTrailTab } from '@/features/signatures/audit-trail-tab';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import type { EnvelopeSummary, SessionUser } from '@/types/api';
import type { Annotation } from '@/features/signatures/types';

const PdfSignaturePlacer = lazy(() =>
  import('@/features/signatures/pdf-signature-placer').then((m) => ({ default: m.PdfSignaturePlacer })),
);
const PDF_LOADING_FALLBACK = <div className="p-6 text-[13px] text-slate">Loading PDF viewer…</div>;

type Decision = 'sign' | 'decline' | 'pushback';
interface FlatAnnotation extends Annotation {
  docIndex: number;
}

interface SignEnvelopeModalProps {
  envelope: EnvelopeSummary;
  currentUser: SessionUser;
  onClose: () => void;
  onSigned: () => void;
  canDelegate?: boolean;
  onDelegate?: (() => void) | null;
}

export function SignEnvelopeModal({ envelope: envSummary, currentUser, onClose, onSigned, canDelegate = false, onDelegate = null }: SignEnvelopeModalProps) {
  const [tab, setTab] = useState<'sign' | 'audit'>('sign');
  const [docIdx, setDocIdx] = useState(0);
  const [err, setErr] = useState('');

  const { data: envelope, isLoading: envLoading, error: envError } = useEnvelopeDetail(envSummary.id);
  const { data: docData, isLoading: docLoading } = useEnvelopeDocument(envSummary.id, docIdx, tab === 'sign' && !!envelope);

  const myRecipient = envelope?.recipients.find((r) => r.username === currentUser.username);
  const meaning = (myRecipient?.stepLabel && SIGNING_MEANING[myRecipient.stepLabel]) || myRecipient?.signingMeaning || 'Signed';
  const isApprover = myRecipient?.stepLabel === 'Approver';

  const [sigData, setSigData] = useState('');
  const [comment, setComment] = useState('');
  const [annotations, setAnnotations] = useState<FlatAnnotation[]>([]);
  const [pwd, setPwd] = useState('');
  const [decision, setDecision] = useState<Decision>('sign');
  const [declineReason, setDeclineReason] = useState('');
  const [pushbackReason, setPushbackReason] = useState('');
  const canPushback = !!currentUser?.privileges?.canPushback;
  const [effectiveDates, setEffectiveDates] = useState<Record<number, string>>({});
  const [docsNeedingDate, setDocsNeedingDate] = useState<number[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Hydrate the effective-date map once the envelope (and its document
  // list) arrives, and again if a different envelope is opened — during
  // render, not an effect (see components/pagination.tsx for why). The
  // dates stay freely user-editable afterward; this only sets defaults.
  const [prevEnvelopeId, setPrevEnvelopeId] = useState<string | undefined>(undefined);
  if (isApprover && envelope && envelope.id !== prevEnvelopeId) {
    setPrevEnvelopeId(envelope.id);
    const today = todayISO();
    const initial: Record<number, string> = {};
    envelope.documents.forEach((_, i) => {
      initial[i] = today;
    });
    setEffectiveDates(initial);
  }

  // Accumulate which documents need an effective date as each one's data
  // arrives (the user may flip through several documents before signing).
  // Same render-time pattern, keyed on the query result identity.
  const [prevDocData, setPrevDocData] = useState(docData);
  if (isApprover && docData && docData !== prevDocData) {
    setPrevDocData(docData);
    if ((docData.effectiveDateFields || []).length > 0) {
      setDocsNeedingDate((prev) => (prev.includes(docIdx) ? prev : [...prev, docIdx]));
    }
  }

  const signMutation = useSignEnvelope();
  const declineMutation = useDeclineEnvelope();
  const pushbackMutation = usePushbackEnvelope();

  function validateEffectiveDates(): string | null {
    if (!isApprover) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (const idx of docsNeedingDate) {
      const v = effectiveDates[idx];
      if (!v) return `Effective date required for Document ${idx + 1}`;
      const d = new Date(v);
      d.setHours(0, 0, 0, 0);
      if (Number.isNaN(d.getTime())) return `Invalid date for Document ${idx + 1}`;
      if (d < today) return `Effective date for Document ${idx + 1} cannot be in the past`;
    }
    return null;
  }

  async function handleSign() {
    if (!pwd) return setErr('Password is required.');
    if (decision === 'sign' && !sigData) return setErr('Please provide a signature.');
    const dateErr = decision === 'sign' ? validateEffectiveDates() : null;
    if (dateErr) return setErr(dateErr);
    setSubmitting(true);
    setErr('');
    try {
      if (decision === 'decline') {
        if (!declineReason.trim()) {
          setSubmitting(false);
          return setErr('Reason is required to decline.');
        }
        await declineMutation.mutateAsync({ id: envSummary.id, body: { username: currentUser.username, password: pwd, reason: declineReason.trim() } });
      } else if (decision === 'pushback') {
        if (!pushbackReason.trim()) {
          setSubmitting(false);
          return setErr('Reason is required to return.');
        }
        await pushbackMutation.mutateAsync({ id: envSummary.id, body: { username: currentUser.username, password: pwd, reason: pushbackReason.trim() } });
      } else {
        const payload: Record<string, unknown> = {
          username: currentUser.username,
          password: pwd,
          signatureType: 'typed',
          signatureData: sigData,
          signingMeaning: meaning,
          comment: comment.trim(),
          annotations,
        };
        if (isApprover && docsNeedingDate.length > 0) {
          payload.effectiveDates = docsNeedingDate.map((idx) => ({ docIndex: idx, date: effectiveDates[idx] }));
        }
        await signMutation.mutateAsync({ id: envSummary.id, body: payload });
      }
      onSigned();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Action failed.');
    } finally {
      setSubmitting(false);
    }
  }

  const docCount = envelope?.documents.length || 0;
  const today = todayISO();
  const docNeedsDate = isApprover && docsNeedingDate.includes(docIdx);
  const primaryLabel =
    decision === 'decline' ? 'Submit decline' : decision === 'pushback' ? 'Return to Author' : isApprover ? 'Approve & Make Effective' : 'Sign document';

  return (
    <Dialog open onOpenChange={(open) => !open && !submitting && onClose()}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>
            {decision === 'decline' ? 'Decline' : decision === 'pushback' ? 'Return' : isApprover ? 'Approve' : 'Sign'} — {envSummary.title}
          </DialogTitle>
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
            <Tabs value={tab} onValueChange={(v) => setTab(v as 'sign' | 'audit')}>
              <TabsList>
                <TabsTrigger value="sign">
                  {decision === 'decline' ? (
                    <>
                      <X size={14} /> Decline
                    </>
                  ) : isApprover ? (
                    <>
                      <Shield size={14} /> Final Approval
                    </>
                  ) : (
                    <>
                      <PenLine size={14} /> Review &amp; Sign
                    </>
                  )}
                </TabsTrigger>
                <TabsTrigger value="audit">
                  <ShieldCheck size={14} /> Audit Trail
                </TabsTrigger>
              </TabsList>

              <TabsContent value="sign">
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
                  <div>
                    {docCount > 1 && (
                      <div className="mb-2 flex flex-wrap gap-1.5">
                        {envelope.documents.map((d, i) => (
                          <Button key={i} variant={docIdx === i ? 'default' : 'ghost'} size="sm" onClick={() => setDocIdx(i)}>
                            Doc {i + 1}: {d.fileName?.slice(0, 18)}
                          </Button>
                        ))}
                      </div>
                    )}
                    {docLoading && <div className="py-4 text-center text-[13px] text-slate">Loading PDF…</div>}
                    {err && !submitting && (
                      <div className="mb-2.5 rounded-md bg-danger-soft px-2.5 py-2 text-[13px] text-danger">{err}</div>
                    )}
                    {docData && (
                      <ErrorBoundary label="Document preview">
                        <Suspense fallback={PDF_LOADING_FALLBACK}>
                          <PdfSignaturePlacer
                            fileSource={{ type: 'base64', data: docData.fileData }}
                            recipients={envelope.recipients}
                            boxes={docData.signatureFields.map((sf) => ({ ...sf }))}
                            mode="preview"
                            highlightUsername={currentUser.username}
                            appliedSignatures={docData.appliedSignatures}
                            effectiveDateFields={docData.effectiveDateFields}
                            appliedEffectiveDates={docData.appliedEffectiveDates}
                            annotations={[
                              ...docData.appliedAnnotations,
                              ...annotations.filter((a) => a.docIndex === docIdx),
                            ] as Annotation[]}
                            onAnnotationsChange={
                              decision === 'sign'
                                ? (next) => {
                                    // Keep only this doc's unsaved marks — applied
                                    // historical ones are read-only and come back
                                    // out via the byUsername check.
                                    const mine = (next as FlatAnnotation[]).filter((a) => !a.byUsername).map((a) => ({ ...a, docIndex: docIdx }));
                                    setAnnotations((prev) => [...prev.filter((a) => a.docIndex !== docIdx), ...mine]);
                                  }
                                : null
                            }
                          />
                        </Suspense>
                      </ErrorBoundary>
                    )}
                  </div>

                  <aside>
                    <div className="mb-3 rounded-md bg-seal-soft px-2.5 py-2.5 text-[12px] leading-relaxed text-seal">
                      <strong>Your role:</strong> {myRecipient?.stepLabel || myRecipient?.role}
                      <br />
                      <span className="text-[11px]">{meaning}</span>
                    </div>

                    {decision === 'sign' ? (
                      <>
                        <div className="mb-2.5 flex flex-col gap-1.5">
                          <Label>Signature</Label>
                          <ErrorBoundary label="Signature pad">
                            <SignaturePad onChange={setSigData} signerName={currentUser.fullName || currentUser.username} />
                          </ErrorBoundary>
                        </div>
                        {isApprover && docNeedsDate && (
                          <div className="mb-2.5 rounded-md border border-[#d8c9f5] bg-[#f3eefd] p-2.5">
                            <Label className="text-[#5b21b6]">Effective Date — Doc {docIdx + 1} *</Label>
                            <Input
                              type="date"
                              className="mt-1"
                              min={today}
                              value={effectiveDates[docIdx] || today}
                              onChange={(e) => setEffectiveDates((prev) => ({ ...prev, [docIdx]: e.target.value }))}
                            />
                            <div className="mt-1.5 text-[11px] leading-relaxed text-[#6b21a8]">Today or any future date.</div>
                          </div>
                        )}
                        <div className="mb-2.5 flex flex-col gap-1.5">
                          <Label>
                            Comment <span className="font-normal text-slate">(optional)</span>
                          </Label>
                          <textarea
                            rows={2}
                            className="w-full rounded-md border border-line-strong bg-paper-raised px-2.5 py-1.5 text-[13px] text-ink outline-none focus-visible:border-seal focus-visible:ring-2 focus-visible:ring-seal-ring"
                            value={comment}
                            onChange={(e) => setComment(e.target.value)}
                          />
                        </div>
                      </>
                    ) : decision === 'decline' ? (
                      <div className="mb-2.5 flex flex-col gap-1.5">
                        <Label>Reason for declining *</Label>
                        <textarea
                          rows={3}
                          className="w-full rounded-md border border-line-strong bg-paper-raised px-2.5 py-1.5 text-[13px] text-ink outline-none focus-visible:border-seal focus-visible:ring-2 focus-visible:ring-seal-ring"
                          value={declineReason}
                          onChange={(e) => setDeclineReason(e.target.value)}
                        />
                      </div>
                    ) : (
                      <div className="mb-2.5 flex flex-col gap-1.5">
                        <div className="rounded-md bg-warning-soft px-2.5 py-2 text-[12.5px] text-warning">
                          Returning sends this document back to the Author ({envelope.createdBy}) for revision. All signatures
                          collected so far will be cancelled (and recorded in the audit trail), and the workflow will restart from
                          the beginning when the Author re-sends.
                        </div>
                        <Label>Reason for return *</Label>
                        <textarea
                          rows={3}
                          className="w-full rounded-md border border-line-strong bg-paper-raised px-2.5 py-1.5 text-[13px] text-ink outline-none focus-visible:border-seal focus-visible:ring-2 focus-visible:ring-seal-ring"
                          value={pushbackReason}
                          onChange={(e) => setPushbackReason(e.target.value)}
                        />
                      </div>
                    )}

                    <div className="flex flex-col gap-1.5">
                      <Label>Your password *</Label>
                      <Input type="password" autoFocus value={pwd} onChange={(e) => setPwd(e.target.value)} />
                    </div>
                    {err && !submitting && (
                      <div className="mt-2.5 rounded-md bg-danger-soft px-2.5 py-2 text-[13px] text-danger">{err}</div>
                    )}
                  </aside>
                </div>
              </TabsContent>

              <TabsContent value="audit">
                <AuditTrailTab envelopeId={envSummary.id} envelope={envelope} />
              </TabsContent>
            </Tabs>

            <DialogFooter>
              {tab === 'sign' ? (
                <>
                  <Button variant="ghost" onClick={onClose} disabled={submitting}>
                    Cancel
                  </Button>
                  {decision === 'sign' && (
                    <Button variant="destructive" onClick={() => setDecision('decline')} disabled={submitting}>
                      Decline instead
                    </Button>
                  )}
                  {decision === 'sign' && canDelegate && onDelegate && (
                    <Button variant="ghost" className="text-warning" onClick={onDelegate} disabled={submitting}>
                      <ArrowLeftRight size={13} /> Delegate
                    </Button>
                  )}
                  {decision === 'sign' && canPushback && (
                    <Button variant="ghost" onClick={() => setDecision('pushback')} disabled={submitting}>
                      <ArrowLeft size={13} /> Return
                    </Button>
                  )}
                  {decision !== 'sign' && (
                    <Button variant="ghost" onClick={() => setDecision('sign')} disabled={submitting}>
                      Back to signing
                    </Button>
                  )}
                  <Button onClick={handleSign} disabled={submitting || !pwd}>
                    {submitting ? 'Processing…' : primaryLabel}
                  </Button>
                </>
              ) : (
                <Button variant="ghost" onClick={() => setTab('sign')}>
                  <ArrowLeft size={13} /> Back to signing
                </Button>
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
