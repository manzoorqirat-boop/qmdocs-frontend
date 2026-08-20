import { useState, useMemo, useEffect, useRef, Suspense, lazy } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  MoveRight,
  Check,
  Circle,
  FileText,
  Paperclip,
  PenLine,
} from 'lucide-react';
import { useCreateEnvelope, useCheckDocNumbers } from '@/features/envelopes/hooks';
import { UserSearchPicker } from '@/features/signatures/user-search-picker';
import { SignaturePad } from '@/features/signatures/signature-pad';
import { ErrorBoundary } from '@/components/error-boundary';
import { STEP_DEFS, ALL_ROLES_FOR_CUSTOM, stepColor, SIGNING_MEANING } from '@/features/signatures/constants';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { VIOLET_HEX } from '@/lib/theme-colors';
import type { UserDirectoryEntry, Site, Department, SessionUser } from '@/types/api';
import type { FileSource, SignatureBox as PlacementBox } from '@/features/signatures/types';

const PdfSignaturePlacer = lazy(() =>
  import('@/features/signatures/pdf-signature-placer').then((m) => ({ default: m.PdfSignaturePlacer })),
);
const PDF_LOADING_FALLBACK = <div className="p-6 text-[13px] text-slate">Loading PDF viewer…</div>;

const WIZARD_STEPS = ['Details', 'Recipients', 'Place Signatures', 'Sign as Author'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface CustomSig {
  label: string;
  username: string;
  isExternal: boolean;
  email?: string;
  validityDays?: number | string;
}
interface WizardRecipient {
  username: string;
  stepLabel: string;
  isExternal?: boolean;
  email?: string;
  validityDays?: number;
}
/** Local box shape carries a docIndex, unlike the placer's per-document SignatureBox. */
interface WizardBox extends PlacementBox {
  docIndex: number;
}

interface CreateEnvelopeWizardProps {
  currentUser: SessionUser;
  users: UserDirectoryEntry[];
  departments: Department[];
  sites?: Site[];
  onClose: () => void;
  onCreated: () => void;
}

export function CreateEnvelopeWizard({ currentUser, users, departments, sites = [], onClose, onCreated }: CreateEnvelopeWizardProps) {
  const homeSiteId = currentUser?.siteId;
  const [step, setStep] = useState(1);
  const [err, setErr] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const createMutation = useCreateEnvelope();
  const checkDocNumbers = useCheckDocNumbers();

  // Step 1 — Details
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [docNumbers, setDocNumbers] = useState<string[]>([]);
  const [dupDetail, setDupDetail] = useState<{ number: string; usedIn: string[] }[]>([]);
  const [dupNumbers, setDupNumbers] = useState<string[]>([]);
  const [overrodeDup, setOverrodeDup] = useState(false);

  // Step 2 — Recipients
  const [routingType, setRoutingType] = useState<'sequential' | 'parallel'>('sequential');
  const [reviewers, setReviewers] = useState<string[]>(['']);
  const [approver, setApprover] = useState('');
  const [includeReviewers, setIncludeReviewers] = useState(true);
  const [includeApprover, setIncludeApprover] = useState(true);
  const [customSigs, setCustomSigs] = useState<CustomSig[]>([]);

  // Step 3 — Placement
  const [activeRecipient, setActiveRecipient] = useState('');
  const [boxes, setBoxes] = useState<WizardBox[]>([]);
  const [effDateBoxes, setEffDateBoxes] = useState<WizardBox[]>([]);
  const [previewDocIdx, setPreviewDocIdx] = useState(0);

  // Step 4 — Author sign
  const [esigPassword, setEsigPassword] = useState('');
  const [authorSigData, setAuthorSigData] = useState('');
  const [authorComment, setAuthorComment] = useState('');

  const allRecipients: WizardRecipient[] = useMemo(() => {
    const r: WizardRecipient[] = [{ username: currentUser.username, stepLabel: 'Author' }];
    if (includeReviewers) reviewers.forEach((u) => u && r.push({ username: u, stepLabel: 'Reviewer' }));
    if (includeApprover && approver) r.push({ username: approver, stepLabel: 'Approver' });
    customSigs.forEach((c) => {
      const label = c.label.trim();
      if (!label) return;
      if (c.isExternal) {
        if (c.email?.trim()) r.push({ username: '', isExternal: true, email: c.email.trim(), stepLabel: label, validityDays: Number(c.validityDays) || 7 });
      } else if (c.username) {
        r.push({ username: c.username, stepLabel: label });
      }
    });
    return r;
  }, [currentUser, reviewers, approver, includeReviewers, includeApprover, customSigs]);

  const recipientKey = (r: WizardRecipient) => (r.isExternal ? `external:${(r.email || '').toLowerCase()}` : r.username);
  const recipientUsernames = useMemo(() => allRecipients.map(recipientKey), [allRecipients]);

  const placerFileSource: FileSource | null = useMemo(
    () => (files[previewDocIdx] ? { type: 'file', file: files[previewDocIdx] } : null),
    [files, previewDocIdx],
  );
  const placerBoxes = useMemo(() => {
    const sig = boxes.filter((b) => b.docIndex === previewDocIdx);
    const eff = effDateBoxes.filter((b) => b.docIndex === previewDocIdx).map((b) => ({ ...b, recipientUsername: '__EFFDATE__' }));
    return [...sig, ...eff];
  }, [boxes, effDateBoxes, previewDocIdx]);

  function handlePlacerChange(next: PlacementBox[]) {
    const effForDoc = next.filter((b) => b.recipientUsername === '__EFFDATE__').map((b) => ({ ...b, docIndex: previewDocIdx }));
    const sigForDoc = next.filter((b) => b.recipientUsername !== '__EFFDATE__').map((b) => ({ ...b, docIndex: previewDocIdx }));
    setBoxes((prev) => [...prev.filter((b) => b.docIndex !== previewDocIdx), ...sigForDoc]);
    setEffDateBoxes((prev) => [...prev.filter((b) => b.docIndex !== previewDocIdx), ...effForDoc]);
  }

  function handleFileAdd(fileList: FileList | File[]) {
    const arr = Array.from(fileList);
    const accepted = arr.filter((f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'));
    if (accepted.length !== arr.length) setErr('Only PDF files allowed; non-PDFs were ignored.');
    setFiles((prev) => [...prev, ...accepted].slice(0, 10));
    setDocNumbers((prev) => [...prev, ...accepted.map(() => '')].slice(0, 10));
  }
  function removeFile(idx: number) {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
    setDocNumbers((prev) => prev.filter((_, i) => i !== idx));
    setBoxes((prev) => prev.filter((b) => b.docIndex !== idx).map((b) => (b.docIndex > idx ? { ...b, docIndex: b.docIndex - 1 } : b)));
    setEffDateBoxes((prev) => prev.filter((b) => b.docIndex !== idx).map((b) => (b.docIndex > idx ? { ...b, docIndex: b.docIndex - 1 } : b)));
    if (previewDocIdx >= idx && previewDocIdx > 0) setPreviewDocIdx((p) => p - 1);
  }
  function addReviewer() {
    if (reviewers.length < 10) setReviewers((p) => [...p, '']);
  }
  function removeReviewer(idx: number) {
    if (reviewers.length > 1) setReviewers((p) => p.filter((_, i) => i !== idx));
  }
  function updateReviewer(idx: number, un: string) {
    setReviewers((p) => p.map((u, i) => (i === idx ? un : u)));
  }

  // Soft duplicate check — debounced, advisory only.
  useEffect(() => {
    const entered = docNumbers.map((n) => (n || '').trim()).filter(Boolean);
    if (entered.length === 0) {
      setDupNumbers([]);
      setDupDetail([]);
      setOverrodeDup(false);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const res = await checkDocNumbers.mutateAsync(entered);
        if (cancelled) return;
        const dups = res?.duplicates || [];
        // duplicates come back as bare strings from the API; pair with usage
        // is not returned by this lightweight endpoint, so show the number only.
        setDupDetail(dups.map((n: string) => ({ number: n, usedIn: [] })));
        setDupNumbers(dups.map((n: string) => n.trim().toLowerCase()));
        setOverrodeDup(false);
      } catch {
        if (!cancelled) {
          setDupNumbers([]);
          setDupDetail([]);
        }
      }
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docNumbers]);

  function step2Valid() {
    const expected = recipientUsernames.length * files.length;
    return new Set(boxes.map((b) => `${b.recipientUsername}|${b.docIndex}`)).size >= expected;
  }
  function step3Valid() {
    return !!esigPassword && !!authorSigData;
  }

  async function handleSubmit() {
    if (!step3Valid()) return setErr('Password and signature are required.');
    setErr('');
    try {
      const fd = new FormData();
      fd.append('title', title.trim());
      fd.append('message', message);
      fd.append('routingType', routingType);
      fd.append('createdBy', currentUser.username);
      const recipients = allRecipients.map((r) =>
        r.isExternal
          ? { isExternal: true, email: r.email, stepLabel: r.stepLabel, validityDays: r.validityDays || 7 }
          : { username: r.username, fullName: users.find((x) => x.username === r.username)?.fullName || '', stepLabel: r.stepLabel },
      );
      fd.append('recipients', JSON.stringify(recipients));
      fd.append(
        'signatureFields',
        JSON.stringify(boxes.map((b) => ({ docIndex: b.docIndex, recipientUsername: b.recipientUsername, page: b.page, x: b.x, y: b.y, width: b.width, height: b.height }))),
      );
      fd.append(
        'effectiveDateFields',
        JSON.stringify(effDateBoxes.map((b) => ({ docIndex: b.docIndex, page: b.page, x: b.x, y: b.y, width: b.width, height: b.height }))),
      );
      fd.append('authorPassword', esigPassword);
      fd.append('authorSignatureType', 'typed');
      fd.append('authorSignatureData', authorSigData);
      fd.append('authorComment', authorComment.trim());
      fd.append('documentNumbers', JSON.stringify(docNumbers.map((n) => (n || '').trim())));
      if (dupDetail.length > 0 && overrodeDup) fd.append('overrodeDuplicateWarning', 'true');
      files.forEach((f) => fd.append('files', f));
      await createMutation.mutateAsync(fd);
      onCreated();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not create envelope.');
    }
  }

  function goNext() {
    setErr('');
    if (step === 1) {
      if (!title.trim()) return setErr('Document title is required.');
      if (files.length === 0) return setErr('Upload at least one PDF document.');
      if (docNumbers.some((n) => n && n.length > 0 && !n.trim())) return setErr('A document number cannot be just spaces.');
      if (dupDetail.length > 0 && !overrodeDup) return setErr('Acknowledge the duplicate document number warning to continue.');
    }
    if (step === 2) {
      if (includeReviewers && reviewers.some((r) => !r)) return setErr('Select a user for every Reviewer slot, or turn off "Include Reviewers".');
      if (includeApprover && !approver) return setErr('Select an Approver, or turn off "Require approval".');
      for (const c of customSigs) {
        const label = c.label.trim();
        if (c.isExternal) {
          if (!label) return setErr('Each external signatory needs a role label.');
          if (!c.email || !EMAIL_RE.test(c.email.trim())) return setErr(`Enter a valid email for the external signatory "${label || '(unnamed)'}".`);
          const v = Number(c.validityDays ?? 7);
          if (!Number.isFinite(v) || v < 1 || v > 30) return setErr('External link validity must be 1–30 days.');
        } else if ((c.username && !label) || (!c.username && label)) {
          return setErr('Each additional signatory needs both a capacity label and a person.');
        }
        if (['Author', 'Reviewer', 'Approver'].includes(label)) return setErr('Use the built-in Reviewer/Approver steps for those capacities.');
      }
      const uniq = new Set(recipientUsernames);
      if (uniq.size !== recipientUsernames.length) return setErr('Each person can appear only once in the workflow.');
    }
    if (step === 3 && !step2Valid()) {
      const expected = recipientUsernames.length * files.length;
      const placed = new Set(boxes.map((b) => `${b.recipientUsername}|${b.docIndex}`)).size;
      return setErr(`Place a signature box for every recipient on every document (${expected} needed, ${placed} placed).`);
    }
    setStep((s) => s + 1);
  }

  const busy = createMutation.isPending;

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className={cn(step === 3 ? 'max-w-5xl' : 'max-w-3xl')}>
        <DialogHeader>
          <DialogTitle>New Document</DialogTitle>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {WIZARD_STEPS.map((label, i) => {
              const n = i + 1;
              const done = n < step;
              const current = n === step;
              return (
                <div key={n} className="flex items-center gap-1.5">
                  <div
                    className={cn(
                      'flex size-[22px] items-center justify-center rounded-full text-[11px] font-bold',
                      done ? 'bg-success text-white' : current ? 'bg-seal text-white' : 'bg-paper text-slate',
                    )}
                  >
                    {done ? <Check size={13} /> : n}
                  </div>
                  <span className={cn('text-[11px]', current ? 'font-semibold text-seal' : done ? 'text-success' : 'text-slate')}>{label}</span>
                  {i < WIZARD_STEPS.length - 1 && <span className="ml-0.5 text-[13px] text-line-strong">›</span>}
                </div>
              );
            })}
          </div>
        </DialogHeader>

        {err && <div className="rounded-md bg-danger-soft px-3 py-2 text-[13px] text-danger">{err}</div>}

        {/* STEP 1: Details */}
        {step === 1 && (
          <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
            <div>
              <div className="mb-2.5 flex flex-col gap-1.5">
                <Label>Document Title *</Label>
                <Input placeholder="e.g. SOP-42 Revision Approval" maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>
                  Message to Recipients <span className="font-normal text-slate">(optional)</span>
                </Label>
                <textarea
                  rows={4}
                  className="w-full rounded-md border border-line-strong bg-paper-raised px-3 py-2 text-sm text-ink outline-none focus-visible:border-seal focus-visible:ring-2 focus-visible:ring-seal-ring"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                />
              </div>
            </div>

            <div>
              <div className="mb-2.5 flex flex-col gap-1.5">
                <Label>
                  Upload PDFs * <span className="font-normal text-slate">up to 10</span>
                </Label>
                <div
                  onDrop={(e) => {
                    e.preventDefault();
                    handleFileAdd(e.dataTransfer.files);
                  }}
                  onDragOver={(e) => e.preventDefault()}
                  onClick={() => fileInputRef.current?.click()}
                  className="cursor-pointer rounded-md border-2 border-dashed border-line-strong bg-paper px-3 py-4 text-center"
                >
                  <div className="mb-1 flex justify-center text-slate">
                    <Paperclip size={20} />
                  </div>
                  <div className="text-[13px] text-ink-soft">Drop PDFs here or click to browse</div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept="application/pdf"
                    className="hidden"
                    onChange={(e) => e.target.files && handleFileAdd(e.target.files)}
                  />
                </div>
              </div>

              {files.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  {files.map((f, i) => (
                    <div key={i} className="flex items-center justify-between gap-2.5 rounded-md border border-line bg-paper px-2.5 py-1.5 text-[12px]">
                      <span className="flex min-w-0 flex-1 items-center gap-1.5">
                        <FileText size={13} className="shrink-0" />
                        <span className="truncate">{f.name}</span>
                        <span className="shrink-0 text-slate">({(f.size / 1024).toFixed(0)} KB)</span>
                      </span>
                      <Input
                        className={cn(
                          'h-7 w-[150px] shrink-0 text-[12px]',
                          dupNumbers.includes((docNumbers[i] || '').trim().toLowerCase()) && (docNumbers[i] || '').trim() && 'border-warning',
                        )}
                        placeholder="Document No. (optional)"
                        value={docNumbers[i] || ''}
                        onChange={(e) => setDocNumbers((prev) => prev.map((n, j) => (j === i ? e.target.value : n)))}
                      />
                      <Button variant="ghost" size="sm" className="h-7 shrink-0 px-2" onClick={() => removeFile(i)}>
                        Remove
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {dupDetail.length > 0 && (
                <div className="mt-2.5 rounded-md border border-warning/40 bg-warning-soft px-3 py-2.5 text-[12.5px]">
                  <div className="mb-1.5 font-semibold text-warning">
                    ⚠ Duplicate document number{dupDetail.length > 1 ? 's' : ''} detected
                  </div>
                  <div className="mb-2 text-ink-soft">
                    {dupDetail.map((d, k) => (
                      <div key={k}>
                        <strong>{d.number}</strong> already exists on another envelope.
                      </div>
                    ))}
                  </div>
                  <label className="flex cursor-pointer items-center gap-1.5 text-ink-soft">
                    <Checkbox checked={overrodeDup} onCheckedChange={(c) => setOverrodeDup(!!c)} />
                    Use {dupDetail.length > 1 ? 'these numbers' : 'this number'} anyway (this override will be recorded in the
                    audit trail)
                  </label>
                </div>
              )}
            </div>
          </div>
        )}

        {/* STEP 2: Recipients */}
        {step === 2 && (
          <div>
            <div className="mb-3.5 text-[12px] text-slate">
              Search by name, username, email or department. Use the department pills (and the site toggle, if shown) to
              narrow a long list.
            </div>

            <div className="mb-3 flex flex-col gap-1.5">
              <Label>Routing</Label>
              <div className="flex gap-1.5">
                {(['sequential', 'parallel'] as const).map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setRoutingType(opt)}
                    className={cn(
                      'flex-1 rounded-md border-[1.5px] px-2.5 py-2 text-left text-[12px] font-semibold',
                      routingType === opt ? 'border-seal bg-seal-soft text-seal' : 'border-line-strong bg-paper-raised text-ink-soft',
                    )}
                  >
                    <span className="flex items-center gap-1.5">
                      {opt === 'sequential' ? <ArrowRight size={13} /> : <MoveRight size={13} />}
                      {opt === 'sequential' ? 'Sequential' : 'Parallel'}
                    </span>
                    <div className={cn('mt-0.5 text-[10px] font-normal', routingType === opt ? 'text-seal' : 'text-slate')}>
                      {opt === 'sequential' ? 'One by one in order' : 'All reviewers at once'}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-2 rounded-md border border-seal bg-seal-soft px-3 py-2">
              <div className="mb-0.5 text-[10px] font-bold tracking-wide text-seal uppercase">Author · Step 1 · Signs at creation</div>
              <div className="text-[13px] font-semibold text-ink">{currentUser.fullName || currentUser.username}</div>
              <div className="text-[11px] text-slate">
                @{currentUser.username} · {currentUser.role}
              </div>
            </div>

            <div className="mb-2">
              <div className="mb-1.5 flex items-center justify-between">
                <label className="flex items-center gap-2 text-[13px] font-medium text-ink-soft">
                  <Checkbox checked={includeReviewers} onCheckedChange={(c) => setIncludeReviewers(!!c)} />
                  Include Reviewers{includeReviewers ? ` (${reviewers.length}/10)` : ''}
                  <span className="ml-1.5 text-[10px] font-normal text-slate">role: Reviewer</span>
                </label>
                {includeReviewers && (
                  <Button variant="ghost" size="sm" className="h-7 px-2" onClick={addReviewer} disabled={reviewers.length >= 10}>
                    + Add
                  </Button>
                )}
              </div>
              {!includeReviewers ? (
                <div className="px-0.5 py-1.5 text-[12px] text-slate">Review step skipped — no Reviewer will sign this document.</div>
              ) : (
                <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
                  {reviewers.map((u, idx) => (
                    <div key={idx} className="flex items-center gap-1.5">
                      <div
                        className="flex size-[22px] shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
                        style={{ background: STEP_DEFS.Reviewer.color }}
                      >
                        R{idx + 1}
                      </div>
                      <div className="min-w-0 flex-1">
                        <UserSearchPicker
                          users={users}
                          departments={departments}
                          sites={sites}
                          homeSiteId={homeSiteId}
                          allowedRoles={STEP_DEFS.Reviewer.allowedRoles}
                          excludeUsernames={recipientUsernames.filter((un) => un && un !== u)}
                          value={u}
                          onChange={(v) => updateReviewer(idx, v)}
                          label="— Search reviewer —"
                          accentColor={STEP_DEFS.Reviewer.color}
                        />
                      </div>
                      <Button variant="ghost" size="sm" className="h-7 shrink-0 px-2" onClick={() => removeReviewer(idx)} disabled={reviewers.length <= 1}>
                        −
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="mb-2">
              <label className="mb-1.5 flex items-center gap-2 text-[13px] font-medium text-ink-soft">
                <Checkbox checked={includeApprover} onCheckedChange={(c) => setIncludeApprover(!!c)} />
                Require approval
                <span className="ml-1.5 text-[10px] font-normal text-slate">role: Approver</span>
              </label>
              {!includeApprover ? (
                <div className="px-0.5 py-1.5 text-[12px] text-slate">
                  Approval step skipped — the document completes once the Author{includeReviewers ? ' and Reviewers have' : ' has'}{' '}
                  signed. Effective-date placement is unavailable without an Approver.
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <div
                    className="flex size-[22px] shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
                    style={{ background: STEP_DEFS.Approver.color }}
                  >
                    A
                  </div>
                  <div className="min-w-0 flex-1">
                    <UserSearchPicker
                      users={users}
                      departments={departments}
                      sites={sites}
                      homeSiteId={homeSiteId}
                      allowedRoles={STEP_DEFS.Approver.allowedRoles}
                      excludeUsernames={recipientUsernames.filter((u) => u && u !== approver)}
                      value={approver}
                      onChange={setApprover}
                      label="— Search approver —"
                      accentColor={STEP_DEFS.Approver.color}
                    />
                  </div>
                </div>
              )}
            </div>

            <div>
              <label className="mb-1.5 flex flex-wrap items-center gap-2 text-[13px] font-medium text-ink-soft">
                Additional signatories
                <span className="text-[10px] font-normal text-slate">optional · sign after the Approver · e.g. HOD, SAP SME, Executed By (IT)</span>
              </label>
              {customSigs.map((c, i) => (
                <div key={i} className={cn('mb-2', c.isExternal && 'rounded-md border border-violet/30 bg-violet-soft p-2')}>
                  <div className={cn('flex items-center gap-1.5', c.isExternal && 'mb-1.5')}>
                    <div
                      className="flex size-[22px] shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
                      style={{ background: c.isExternal ? VIOLET_HEX : stepColor(c.label.trim() || 'Custom') }}
                    >
                      {(c.label.trim()[0] || '+').toUpperCase()}
                    </div>
                    <Input
                      className="h-8 w-[170px] shrink-0 text-[13px]"
                      placeholder={c.isExternal ? 'Role (e.g. Vendor)' : 'Capacity label * (e.g. HOD)'}
                      maxLength={40}
                      value={c.label}
                      onChange={(e) => setCustomSigs((list) => list.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
                    />
                    <div className="flex shrink-0 overflow-hidden rounded-md border border-line-strong">
                      <button
                        type="button"
                        className={cn('px-2 py-1 text-[11px] font-semibold', !c.isExternal ? 'bg-seal text-white' : 'text-ink-soft')}
                        onClick={() => setCustomSigs((list) => list.map((x, j) => (j === i ? { ...x, isExternal: false, email: '' } : x)))}
                      >
                        Internal
                      </button>
                      <button
                        type="button"
                        className={cn('px-2 py-1 text-[11px] font-semibold', c.isExternal ? 'bg-violet text-white' : 'text-ink-soft')}
                        onClick={() => setCustomSigs((list) => list.map((x, j) => (j === i ? { ...x, isExternal: true, username: '' } : x)))}
                      >
                        External
                      </button>
                    </div>
                    {!c.isExternal && (
                      <div className="min-w-0 flex-1">
                        <UserSearchPicker
                          users={users}
                          departments={departments}
                          sites={sites}
                          homeSiteId={homeSiteId}
                          allowedRoles={ALL_ROLES_FOR_CUSTOM}
                          excludeUsernames={recipientUsernames.filter((u) => u && u !== c.username)}
                          value={c.username}
                          onChange={(v) => setCustomSigs((list) => list.map((x, j) => (j === i ? { ...x, username: v } : x)))}
                          label="— Search signatory (any role) —"
                          accentColor={stepColor(c.label.trim() || 'Custom')}
                        />
                      </div>
                    )}
                    <button
                      title="Remove signatory"
                      className="shrink-0 text-slate hover:text-danger"
                      onClick={() => setCustomSigs((list) => list.filter((_, j) => j !== i))}
                    >
                      ✕
                    </button>
                  </div>
                  {c.isExternal && (
                    <div className="flex items-center gap-1.5 pl-7">
                      <Input
                        className="h-8 flex-1 text-[13px]"
                        type="email"
                        placeholder="Vendor email *"
                        value={c.email || ''}
                        onChange={(e) => setCustomSigs((list) => list.map((x, j) => (j === i ? { ...x, email: e.target.value } : x)))}
                      />
                      <Input
                        className="h-8 w-[150px] shrink-0 text-[13px]"
                        type="number"
                        min={1}
                        max={30}
                        placeholder="Link valid (days)"
                        value={c.validityDays ?? 7}
                        onChange={(e) => setCustomSigs((list) => list.map((x, j) => (j === i ? { ...x, validityDays: e.target.value } : x)))}
                      />
                      <span className="shrink-0 text-[10.5px] font-semibold whitespace-nowrap text-violet">EXTERNAL</span>
                    </div>
                  )}
                </div>
              ))}
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2"
                onClick={() => setCustomSigs((list) => [...list, { label: '', username: '', isExternal: false }])}
              >
                + Add signatory
              </Button>
            </div>
          </div>
        )}

        {/* STEP 3: Placement */}
        {step === 3 && (
          <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-[1fr_260px]">
            <div>
              {files.length > 1 && (
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {files.map((f, i) => (
                    <Button key={i} variant={previewDocIdx === i ? 'default' : 'ghost'} size="sm" onClick={() => setPreviewDocIdx(i)}>
                      Doc {i + 1}: {f.name.slice(0, 22)}
                      {f.name.length > 22 ? '…' : ''}
                    </Button>
                  ))}
                </div>
              )}
              <ErrorBoundary label="Signature placement">
                {placerFileSource ? (
                  <Suspense fallback={PDF_LOADING_FALLBACK}>
                    <PdfSignaturePlacer
                      fileSource={placerFileSource}
                      recipients={allRecipients.map((r) => ({ username: recipientKey(r), role: r.stepLabel === 'Approver' ? 'Approver' : 'Signer', stepLabel: r.stepLabel }))}
                      activeRecipient={activeRecipient}
                      boxes={placerBoxes}
                      onBoxesChange={handlePlacerChange}
                      mode="place"
                    />
                  </Suspense>
                ) : (
                  <div className="p-5 text-[13px] text-slate">No document selected.</div>
                )}
              </ErrorBoundary>
            </div>

            <aside className={files.length > 1 ? 'pt-9' : ''}>
              <div className="mb-2 text-[11px] font-bold tracking-wide text-slate uppercase">Select recipient, then drag on PDF</div>
              {allRecipients.map((r, i) => {
                const rKey = recipientKey(r);
                const color = STEP_DEFS[r.stepLabel]?.color || (r.isExternal ? VIOLET_HEX : stepColor(r.stepLabel));
                const placedHere = boxes.some((b) => b.recipientUsername === rKey && b.docIndex === previewDocIdx);
                const placedAll = files.every((_, di) => boxes.some((b) => b.recipientUsername === rKey && b.docIndex === di));
                const isActive = activeRecipient === rKey;
                return (
                  <button
                    key={i}
                    onClick={() => setActiveRecipient(rKey)}
                    className="mb-1.5 flex w-full items-center rounded-md border px-2.5 py-1.5 text-left"
                    style={{ background: isActive ? color : 'var(--color-paper-raised)', borderColor: isActive ? color : 'var(--color-line-strong)', color: isActive ? '#fff' : 'var(--color-ink)' }}
                  >
                    <span className="mr-2 size-2 shrink-0 rounded-full" style={{ background: isActive ? '#fff' : color }} />
                    <span className="flex-1 truncate text-[12px]">
                      <strong>{r.stepLabel}</strong>: {r.isExternal ? r.email : r.username}
                      {r.isExternal && <span className="ml-1 text-[9.5px] font-bold" style={{ color: isActive ? '#fff' : VIOLET_HEX }}>EXT</span>}
                    </span>
                    <span className="shrink-0 text-[11px] opacity-80">
                      {placedAll ? (
                        <span className="flex items-center gap-1">
                          <Check size={12} /> all
                        </span>
                      ) : placedHere ? (
                        <span className="flex items-center gap-1">
                          <Check size={12} /> here
                        </span>
                      ) : (
                        <Circle size={12} />
                      )}
                    </span>
                  </button>
                );
              })}

              {includeApprover && (
                <div className="mt-2.5 border-t border-line pt-2.5">
                  <div className="mb-1.5 text-[11px] font-bold tracking-wide text-slate uppercase">Optional</div>
                  {(() => {
                    const isActive = activeRecipient === '__EFFDATE__';
                    const placedHere = effDateBoxes.some((b) => b.docIndex === previewDocIdx);
                    return (
                      <button
                        onClick={() => setActiveRecipient('__EFFDATE__')}
                        className="flex w-full items-center rounded-md border px-2.5 py-1.5 text-left"
                        style={{ background: isActive ? VIOLET_HEX : 'var(--color-paper-raised)', borderColor: isActive ? VIOLET_HEX : 'var(--color-line-strong)', color: isActive ? '#fff' : 'var(--color-ink)' }}
                      >
                        <span className="mr-2 size-2 shrink-0 rounded-full" style={{ background: isActive ? '#fff' : VIOLET_HEX }} />
                        <span className="flex-1 text-[12px]">Effective Date box</span>
                        <span className="text-[11px] opacity-80">{placedHere ? <Check size={12} /> : <Circle size={12} />}</span>
                      </button>
                    );
                  })()}
                  <div className="mt-1.5 text-[11px] leading-relaxed text-slate">Approver fills in the date at approval time.</div>
                </div>
              )}

              <div className="mt-2.5 rounded-md bg-paper px-2.5 py-2 text-[11px] leading-relaxed text-slate">
                Every recipient needs a box on every document.
              </div>
            </aside>
          </div>
        )}

        {/* STEP 4: Author sign & send */}
        {step === 4 && (
          <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
            <div>
              <div className="mb-2 text-[12px] font-bold tracking-wide text-slate uppercase">Document Summary</div>
              <div className="rounded-md border border-line bg-paper px-3.5 py-3 text-[13px] leading-loose">
                <div>
                  <span className="text-slate">Title:</span> <strong>{title}</strong>
                </div>
                <div>
                  <span className="text-slate">Routing:</span> {routingType === 'sequential' ? 'Sequential' : 'Parallel'}
                </div>
                <div>
                  <span className="text-slate">Documents:</span> {files.map((f, i) => `${f.name} (No. ${docNumbers[i] || '—'})`).join(', ')}
                </div>
                <div className="mt-2 border-t border-line pt-2">
                  <div className="mb-1 text-[11px] font-bold tracking-wide text-slate uppercase">Workflow</div>
                  {allRecipients.map((r, i) => {
                    const color = STEP_DEFS[r.stepLabel]?.color || stepColor(r.stepLabel);
                    return (
                      <div key={i} className="mb-1 flex items-center gap-2">
                        <span className="size-1.5 shrink-0 rounded-full" style={{ background: color }} />
                        <span className="text-[12px] font-semibold" style={{ color }}>
                          {r.stepLabel}:
                        </span>
                        <span className="text-[12px]">{r.isExternal ? r.email : r.username}</span>
                      </div>
                    );
                  })}
                </div>
                {effDateBoxes.length > 0 && (
                  <div className="mt-2 border-t border-line pt-2 text-[12px]">
                    <span className="font-semibold text-violet">Effective Date boxes: </span>
                    {files.map((f, i) => {
                      const has = effDateBoxes.some((b) => b.docIndex === i);
                      return (
                        <span key={i} className="mr-2">
                          {f.name.slice(0, 16)}: {has ? <Check size={12} className="inline align-middle" /> : '—'}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="mt-3 rounded-md bg-seal-soft px-3 py-3 text-[12px] leading-relaxed text-seal">
                <strong>Your role: Author</strong>
                <br />
                {SIGNING_MEANING.Author}
              </div>
            </div>

            <div>
              <div className="mb-3 flex flex-col gap-1.5">
                <Label>Your signature *</Label>
                <div className="mb-1 text-[11.5px] text-slate">
                  Your signature is a typed signature using your registered account name. Every signer on this document signs the
                  same way.
                </div>
                <ErrorBoundary label="Signature pad">
                  <SignaturePad onChange={setAuthorSigData} signerName={currentUser.fullName || currentUser.username} />
                </ErrorBoundary>
              </div>
              <div className="mb-3 flex flex-col gap-1.5">
                <Label>
                  Comment <span className="font-normal text-slate">(optional)</span>
                </Label>
                <textarea
                  rows={2}
                  className="w-full rounded-md border border-line-strong bg-paper-raised px-3 py-2 text-sm text-ink outline-none focus-visible:border-seal focus-visible:ring-2 focus-visible:ring-seal-ring"
                  value={authorComment}
                  onChange={(e) => setAuthorComment(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Your password (e-signature confirmation) *</Label>
                <Input
                  type="password"
                  autoFocus
                  value={esigPassword}
                  onChange={(e) => setEsigPassword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && step3Valid() && handleSubmit()}
                />
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          {step > 1 && (
            <Button
              variant="ghost"
              onClick={() => {
                setErr('');
                setStep((s) => s - 1);
              }}
              disabled={busy}
            >
              <ArrowLeft size={13} /> Back
            </Button>
          )}
          {step < 4 && (
            <Button onClick={goNext}>
              Next <ArrowRight size={14} />
            </Button>
          )}
          {step === 4 && (
            <Button onClick={handleSubmit} disabled={busy || !step3Valid()}>
              {busy ? (
                'Signing & sending…'
              ) : (
                <>
                  <PenLine size={15} /> Sign as Author & Send
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
