import { useState, useMemo, useEffect, useRef, Suspense, lazy } from 'react';
import {
  ChevronDown,
  Check,
  Circle,
  FileText,
  Paperclip,
  PenLine,
  X,
  Plus,
  ArrowDown,
  Mail,
  User as UserIcon,
} from 'lucide-react';
import { useCreateEnvelope, useCheckDocNumbers } from '@/features/envelopes/hooks';
import { UserSearchPicker } from '@/features/signatures/user-search-picker';
import { SignaturePad } from '@/features/signatures/signature-pad';
import { ErrorBoundary } from '@/components/error-boundary';
import { STEP_DEFS, ALL_ROLES_FOR_CUSTOM, stepColor, SIGNING_MEANING } from '@/features/signatures/constants';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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

// A collapsible panel in the right rail — every section is independently
// open/closed, none of them gate access to the others. This is the
// structural difference from a step wizard: there's no "you must finish
// this before you can see that."
function Section({
  title,
  badge,
  defaultOpen = true,
  children,
}: {
  title: string;
  badge?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-line">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <span className="flex items-center gap-2 text-[13px] font-semibold text-ink">{title}</span>
        <span className="flex items-center gap-2">
          {badge}
          <ChevronDown size={14} className={cn('text-slate transition-transform', !open && '-rotate-90')} />
        </span>
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}

// A node in the routing chain — how each recipient is presented. Clicking
// one both lets you assign/change who it is AND activates it for
// placement on the canvas to the left, so assigning a person and placing
// their box are the same continuous motion instead of two separate steps.
// Module-scope (not defined inside CreateEnvelopeWizard) so it isn't
// recreated as a new component type on every render — activeRecipient and
// the activation handler come in as props instead of closure state.
function RoutingNode({
  color,
  letter,
  label,
  sub,
  rKey,
  placedHere,
  showCheck,
  activeRecipient,
  onActivate,
  onRemove,
  children,
}: {
  color: string;
  letter: string;
  label: string;
  sub?: string;
  rKey: string;
  placedHere: boolean;
  showCheck: boolean;
  activeRecipient: string;
  onActivate: (key: string) => void;
  onRemove?: () => void;
  children: React.ReactNode;
}) {
  const isActive = activeRecipient === rKey;
  return (
    <div className="relative flex gap-2.5 pb-3 pl-1 last:pb-0">
      <div className="absolute top-[26px] bottom-0 left-[13px] w-px bg-line last:hidden" aria-hidden="true" />
      <button
        onClick={() => onActivate(rKey)}
        title="Click, then drag on the document to place this recipient's box"
        className="relative z-10 flex size-[26px] shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
        style={{ background: color, boxShadow: isActive ? `0 0 0 3px ${color}33` : undefined }}
      >
        {placedHere && showCheck ? <Check size={13} /> : letter}
      </button>
      <div
        className={cn('min-w-0 flex-1 rounded-md border px-2.5 py-2', isActive ? 'border-2' : 'border-line-strong border-dashed')}
        style={isActive ? { borderColor: color, background: `${color}0d` } : undefined}
      >
        <div className="mb-1 flex items-center justify-between gap-1.5">
          <span className="text-[11px] font-bold tracking-wide uppercase" style={{ color }}>
            {label}
          </span>
          {onRemove && (
            <button onClick={onRemove} title="Remove" className="text-slate hover:text-danger">
              <X size={13} />
            </button>
          )}
        </div>
        {sub && <div className="mb-1 text-[10px] text-slate">{sub}</div>}
        {children}
      </div>
    </div>
  );
}

export function CreateEnvelopeWizard({ currentUser, users, departments, sites = [], onClose, onCreated }: CreateEnvelopeWizardProps) {
  const homeSiteId = currentUser?.siteId;
  const [err, setErr] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const createMutation = useCreateEnvelope();
  const checkDocNumbers = useCheckDocNumbers();

  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [docNumbers, setDocNumbers] = useState<string[]>([]);
  const [dupDetail, setDupDetail] = useState<{ number: string; usedIn: string[] }[]>([]);
  const [dupNumbers, setDupNumbers] = useState<string[]>([]);
  const [overrodeDup, setOverrodeDup] = useState(false);

  const [routingType, setRoutingType] = useState<'sequential' | 'parallel'>('sequential');
  const [reviewers, setReviewers] = useState<string[]>(['']);
  const [approver, setApprover] = useState('');
  const [includeReviewers, setIncludeReviewers] = useState(true);
  const [includeApprover, setIncludeApprover] = useState(true);
  const [customSigs, setCustomSigs] = useState<CustomSig[]>([]);

  const [activeRecipient, setActiveRecipient] = useState('');
  const [boxes, setBoxes] = useState<WizardBox[]>([]);
  const [effDateBoxes, setEffDateBoxes] = useState<WizardBox[]>([]);
  const [previewDocIdx, setPreviewDocIdx] = useState(0);

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

  const placedCount = new Set(boxes.map((b) => `${b.recipientUsername}|${b.docIndex}`)).size;
  const placementExpected = recipientUsernames.length * files.length;
  const placementComplete = files.length > 0 && placedCount >= placementExpected;

  // Every blocking condition, computed continuously rather than gating
  // navigation between steps — this is the readiness checklist shown in
  // the footer, and also what handleSubmit checks before sending.
  const blockers = useMemo(() => {
    const list: string[] = [];
    if (!title.trim()) list.push('Add a title');
    if (files.length === 0) list.push('Upload at least one document');
    if (docNumbers.some((n) => n && n.length > 0 && !n.trim())) list.push('A document number cannot be just spaces');
    if (dupDetail.length > 0 && !overrodeDup) list.push('Acknowledge the duplicate document number warning');
    if (includeReviewers && reviewers.some((r) => !r)) list.push('Assign every Reviewer slot (or turn Reviewers off)');
    if (includeApprover && !approver) list.push('Assign an Approver (or turn approval off)');
    for (const c of customSigs) {
      const label = c.label.trim();
      if (c.isExternal) {
        if (!label) list.push('Every external signatory needs a role label');
        else if (!c.email || !EMAIL_RE.test(c.email.trim())) list.push(`Enter a valid email for "${label}"`);
      } else if ((c.username && !label) || (!c.username && label)) {
        list.push('Every additional signatory needs both a label and a person');
      }
    }
    const uniq = new Set(recipientUsernames);
    if (uniq.size !== recipientUsernames.length) list.push('Each person can appear only once');
    if (files.length > 0 && !placementComplete) {
      list.push(`Place a signature box for every recipient on every document (${placedCount}/${placementExpected})`);
    }
    if (!authorSigData) list.push('Provide your signature');
    if (!esigPassword) list.push('Enter your password to sign');
    return list;
  }, [title, files, docNumbers, dupDetail, overrodeDup, includeReviewers, reviewers, includeApprover, approver, customSigs, recipientUsernames, placementComplete, placedCount, placementExpected, authorSigData, esigPassword]);

  async function handleSubmit() {
    if (blockers.length > 0) {
      setErr(blockers[0]);
      return;
    }
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

  const busy = createMutation.isPending;

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="flex h-[92vh] max-h-[92vh] w-[96vw] max-w-6xl! flex-col gap-0 p-0">
        <DialogHeader className="border-b border-line px-5 py-3.5">
          <DialogTitle>New Document</DialogTitle>
        </DialogHeader>

        <div className="flex min-h-0 flex-1">
          {/* Document canvas — always visible once a file exists, never
              hidden behind a step. */}
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-paper">
            {files.length === 0 ? (
              <div
                onDrop={(e) => {
                  e.preventDefault();
                  handleFileAdd(e.dataTransfer.files);
                }}
                onDragOver={(e) => e.preventDefault()}
                onClick={() => fileInputRef.current?.click()}
                className="m-6 flex flex-1 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-line-strong text-center"
              >
                <Paperclip size={28} className="mb-3 text-slate" />
                <div className="mb-1 text-[15px] font-semibold text-ink">Drop PDFs here, or click to browse</div>
                <div className="text-[12.5px] text-slate">Up to 10 documents · the document stays on screen the whole time you're setting this up</div>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="application/pdf"
                  className="hidden"
                  onChange={(e) => e.target.files && handleFileAdd(e.target.files)}
                />
              </div>
            ) : (
              <div className="flex flex-1 flex-col overflow-hidden p-4">
                {files.length > 1 && (
                  <div className="mb-2 flex flex-wrap gap-1.5">
                    {files.map((f, i) => (
                      <Button key={i} variant={previewDocIdx === i ? 'default' : 'ghost'} size="sm" onClick={() => setPreviewDocIdx(i)}>
                        Doc {i + 1}: {f.name.slice(0, 18)}
                        {f.name.length > 18 ? '…' : ''}
                      </Button>
                    ))}
                  </div>
                )}
                <div className="min-h-0 flex-1 overflow-y-auto">
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
              </div>
            )}
          </div>

          {/* Persistent rail — every section independently open, nothing
              gated behind finishing another one first. */}
          <div className="flex w-[400px] shrink-0 flex-col overflow-y-auto border-l border-line">
            <Section title="Document" defaultOpen={files.length === 0} badge={title.trim() && files.length > 0 ? <Check size={14} className="text-success" /> : undefined}>
              <div className="mb-2.5 flex flex-col gap-1.5">
                <Label>Title *</Label>
                <Input placeholder="e.g. SOP-42 Revision Approval" maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>
              <div className="mb-2.5 flex flex-col gap-1.5">
                <Label>
                  Message <span className="font-normal text-slate">(optional)</span>
                </Label>
                <textarea
                  rows={2}
                  className="w-full rounded-md border border-line-strong bg-paper-raised px-3 py-2 text-sm text-ink outline-none focus-visible:border-seal focus-visible:ring-2 focus-visible:ring-seal-ring"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                />
              </div>
              {files.length > 0 && (
                <div className="mb-2 flex flex-col gap-1.5">
                  {files.map((f, i) => (
                    <div key={i} className="flex items-center gap-1.5 rounded-md border border-line bg-paper px-2 py-1.5 text-[11.5px]">
                      <FileText size={12} className="shrink-0" />
                      <span className="min-w-0 flex-1 truncate">{f.name}</span>
                      <Input
                        className={cn('h-6.5 w-[110px] shrink-0 text-[11px]', dupNumbers.includes((docNumbers[i] || '').trim().toLowerCase()) && (docNumbers[i] || '').trim() && 'border-warning')}
                        placeholder="Doc No."
                        value={docNumbers[i] || ''}
                        onChange={(e) => setDocNumbers((prev) => prev.map((n, j) => (j === i ? e.target.value : n)))}
                      />
                      <button onClick={() => removeFile(i)} className="shrink-0 text-slate hover:text-danger">
                        <X size={13} />
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center justify-center gap-1.5 rounded-md border border-dashed border-line-strong py-1.5 text-[11.5px] text-slate hover:text-ink"
                  >
                    <Plus size={12} /> Add another document
                  </button>
                </div>
              )}
              {dupDetail.length > 0 && (
                <div className="mt-1 rounded-md border border-warning/40 bg-warning-soft px-2.5 py-2 text-[11.5px]">
                  <div className="mb-1 font-semibold text-warning">⚠ Duplicate document number{dupDetail.length > 1 ? 's' : ''}</div>
                  {dupDetail.map((d, k) => (
                    <div key={k} className="text-ink-soft">
                      <strong>{d.number}</strong> already exists.
                    </div>
                  ))}
                  <label className="mt-1.5 flex cursor-pointer items-center gap-1.5 text-ink-soft">
                    <Checkbox checked={overrodeDup} onCheckedChange={(c) => setOverrodeDup(!!c)} />
                    Use anyway (recorded in the audit trail)
                  </label>
                </div>
              )}
            </Section>

            <Section
              title="Routing"
              badge={<span className="text-[10.5px] text-slate">{allRecipients.length} signer{allRecipients.length === 1 ? '' : 's'}</span>}
            >
              <div className="mb-3 flex gap-1.5">
                {(['sequential', 'parallel'] as const).map((opt) => (
                  <button
                    key={opt}
                    onClick={() => setRoutingType(opt)}
                    className={cn(
                      'flex-1 rounded-md border-[1.5px] px-2 py-1.5 text-[11.5px] font-semibold',
                      routingType === opt ? 'border-seal bg-seal-soft text-seal' : 'border-line-strong text-ink-soft',
                    )}
                  >
                    {opt === 'sequential' ? 'Sequential' : 'Parallel'}
                    <div className="text-[9.5px] font-normal opacity-80">{opt === 'sequential' ? 'One after another' : 'Reviewers at once'}</div>
                  </button>
                ))}
              </div>

              <RoutingNode color={STEP_DEFS.Author.color} letter="A" label="Author" sub="You · signs now" rKey={currentUser.username} placedHere={boxes.some((b) => b.recipientUsername === currentUser.username && b.docIndex === previewDocIdx)} showCheck={files.length > 0} activeRecipient={activeRecipient} onActivate={setActiveRecipient}>
                <div className="text-[12px] font-medium text-ink">{currentUser.fullName || currentUser.username}</div>
              </RoutingNode>

              {includeReviewers ? (
                reviewers.map((u, idx) => (
                  <RoutingNode
                    key={idx}
                    color={STEP_DEFS.Reviewer.color}
                    letter={`R${idx + 1}`}
                    label={`Reviewer ${reviewers.length > 1 ? idx + 1 : ''}`}
                    rKey={u || `reviewer-${idx}`}
                    placedHere={!!u && boxes.some((b) => b.recipientUsername === u && b.docIndex === previewDocIdx)}
                    showCheck={files.length > 0}
                    activeRecipient={activeRecipient}
                    onActivate={setActiveRecipient}
                    onRemove={reviewers.length > 1 ? () => removeReviewer(idx) : undefined}
                  >
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
                  </RoutingNode>
                ))
              ) : (
                <div className="mb-2 pl-9 text-[11.5px] text-slate">Reviewers off.</div>
              )}
              <div className="mb-3 flex items-center gap-3 pl-9">
                {includeReviewers && (
                  <button onClick={addReviewer} disabled={reviewers.length >= 10} className="text-[11.5px] font-semibold text-seal disabled:opacity-40">
                    + Add reviewer
                  </button>
                )}
                <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-slate">
                  <Checkbox checked={includeReviewers} onCheckedChange={(c) => setIncludeReviewers(!!c)} /> Include Reviewers
                </label>
              </div>

              {includeApprover ? (
                <RoutingNode color={STEP_DEFS.Approver.color} letter="A" label="Approver" rKey={approver || 'approver'} placedHere={!!approver && boxes.some((b) => b.recipientUsername === approver && b.docIndex === previewDocIdx)} showCheck={files.length > 0} activeRecipient={activeRecipient} onActivate={setActiveRecipient}>
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
                </RoutingNode>
              ) : (
                <div className="mb-2 pl-9 text-[11.5px] text-slate">Approval off.</div>
              )}
              <label className="mb-3 flex cursor-pointer items-center gap-1.5 pl-9 text-[11px] text-slate">
                <Checkbox checked={includeApprover} onCheckedChange={(c) => setIncludeApprover(!!c)} /> Require approval
              </label>

              {customSigs.map((c, i) => {
                const color = c.isExternal ? VIOLET_HEX : stepColor(c.label.trim() || 'Custom');
                const rKey = c.isExternal ? `external:${(c.email || '').toLowerCase()}` : c.username || `custom-${i}`;
                return (
                  <RoutingNode
                    key={i}
                    color={color}
                    letter={(c.label.trim()[0] || '+').toUpperCase()}
                    label={c.label.trim() || 'Additional signatory'}
                    sub={c.isExternal ? 'External' : undefined}
                    rKey={rKey}
                    placedHere={boxes.some((b) => b.recipientUsername === rKey && b.docIndex === previewDocIdx)}
                    showCheck={files.length > 0}
                    activeRecipient={activeRecipient}
                    onActivate={setActiveRecipient}
                    onRemove={() => setCustomSigs((list) => list.filter((_, j) => j !== i))}
                  >
                    <Input
                      className="mb-1.5 h-7 text-[12px]"
                      placeholder="Capacity label * (e.g. HOD)"
                      maxLength={40}
                      value={c.label}
                      onChange={(e) => setCustomSigs((list) => list.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
                    />
                    <div className="mb-1.5 flex overflow-hidden rounded-md border border-line-strong text-[10.5px]">
                      <button
                        className={cn('flex-1 py-1 font-semibold', !c.isExternal ? 'bg-seal text-white' : 'text-ink-soft')}
                        onClick={() => setCustomSigs((list) => list.map((x, j) => (j === i ? { ...x, isExternal: false, email: '' } : x)))}
                      >
                        <UserIcon size={10} className="mr-1 inline" /> Internal
                      </button>
                      <button
                        className={cn('flex-1 py-1 font-semibold', c.isExternal ? 'text-white' : 'text-ink-soft')}
                        style={c.isExternal ? { background: VIOLET_HEX } : undefined}
                        onClick={() => setCustomSigs((list) => list.map((x, j) => (j === i ? { ...x, isExternal: true, username: '' } : x)))}
                      >
                        <Mail size={10} className="mr-1 inline" /> External
                      </button>
                    </div>
                    {c.isExternal ? (
                      <div className="flex gap-1.5">
                        <Input className="h-7 flex-1 text-[12px]" type="email" placeholder="Vendor email *" value={c.email || ''} onChange={(e) => setCustomSigs((list) => list.map((x, j) => (j === i ? { ...x, email: e.target.value } : x)))} />
                        <Input className="h-7 w-16 text-[12px]" type="number" min={1} max={30} placeholder="Days" value={c.validityDays ?? 7} onChange={(e) => setCustomSigs((list) => list.map((x, j) => (j === i ? { ...x, validityDays: e.target.value } : x)))} />
                      </div>
                    ) : (
                      <UserSearchPicker
                        users={users}
                        departments={departments}
                        sites={sites}
                        homeSiteId={homeSiteId}
                        allowedRoles={ALL_ROLES_FOR_CUSTOM}
                        excludeUsernames={recipientUsernames.filter((u) => u && u !== c.username)}
                        value={c.username}
                        onChange={(v) => setCustomSigs((list) => list.map((x, j) => (j === i ? { ...x, username: v } : x)))}
                        label="— Search person —"
                        accentColor={color}
                      />
                    )}
                  </RoutingNode>
                );
              })}
              <button
                onClick={() => setCustomSigs((list) => [...list, { label: '', username: '', isExternal: false }])}
                className="flex items-center gap-1.5 pl-9 text-[11.5px] font-semibold text-seal"
              >
                <Plus size={12} /> Add signatory
              </button>

              {includeApprover && (
                <div className="mt-3 border-t border-line pt-3 pl-9">
                  {(() => {
                    const isActive = activeRecipient === '__EFFDATE__';
                    const placedHere = effDateBoxes.some((b) => b.docIndex === previewDocIdx);
                    return (
                      <button
                        onClick={() => setActiveRecipient('__EFFDATE__')}
                        className="flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left text-[11.5px]"
                        style={{ borderColor: isActive ? VIOLET_HEX : 'var(--color-line-strong)', background: isActive ? `${VIOLET_HEX}15` : undefined }}
                      >
                        <span className="size-2 shrink-0 rounded-full" style={{ background: VIOLET_HEX }} />
                        Effective Date box <span className="text-slate">(optional)</span>
                        <span className="ml-auto">{placedHere ? <Check size={12} className="text-success" /> : <Circle size={12} className="text-slate" />}</span>
                      </button>
                    );
                  })()}
                </div>
              )}
            </Section>

            <Section
              title="Your signature"
              defaultOpen={placementComplete}
              badge={authorSigData && esigPassword ? <Check size={14} className="text-success" /> : undefined}
            >
              <div className="mb-2.5 rounded-md bg-seal-soft px-2.5 py-2 text-[11.5px] leading-relaxed text-seal">{SIGNING_MEANING.Author}</div>
              <div className="mb-2.5 flex flex-col gap-1.5">
                <Label>Signature</Label>
                <ErrorBoundary label="Signature pad">
                  <SignaturePad onChange={setAuthorSigData} signerName={currentUser.fullName || currentUser.username} />
                </ErrorBoundary>
              </div>
              <div className="mb-2.5 flex flex-col gap-1.5">
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
                <Label>Password *</Label>
                <Input type="password" value={esigPassword} onChange={(e) => setEsigPassword(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && blockers.length === 0 && handleSubmit()} />
              </div>
            </Section>
          </div>
        </div>

        {/* Persistent action bar — readiness shown continuously, not a
            per-step gate. */}
        <div className="flex items-center gap-3 border-t border-line px-5 py-3">
          {err && <div className="text-[12.5px] text-danger">{err}</div>}
          {!err && blockers.length > 0 && (
            <div className="flex min-w-0 items-center gap-1.5 truncate text-[12px] text-slate">
              <ArrowDown size={12} className="shrink-0 -rotate-90" />
              {blockers[0]}
              {blockers.length > 1 && <span className="shrink-0 text-slate/70"> · {blockers.length - 1} more</span>}
            </div>
          )}
          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={busy || blockers.length > 0}>
              {busy ? (
                'Signing & sending…'
              ) : (
                <>
                  <PenLine size={15} /> Sign as Author & Send
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}