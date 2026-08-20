import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SignaturePad } from '@/features/signatures/signature-pad';
import { ErrorBoundary } from '@/components/error-boundary';
import { useResendEnvelope } from '@/features/envelopes/hooks';
import type { EnvelopeSummary, SessionUser } from '@/types/api';

interface ResendEnvelopeModalProps {
  envelope: EnvelopeSummary;
  currentUser: SessionUser;
  onClose: () => void;
  onResent: () => void;
}

// Author re-sends a pushed-back envelope (round N+1). Allows editing
// title/message, optionally replacing the document file, and re-signing
// with the Author's e-signature. Reviewers/Approvers can be changed
// beforehand via View → Workflow → Reassign.
export function ResendEnvelopeModal({ envelope, currentUser, onClose, onResent }: ResendEnvelopeModalProps) {
  const [title, setTitle] = useState(envelope.title || '');
  const [message, setMessage] = useState((envelope as unknown as { message?: string }).message || '');
  const [file, setFile] = useState<File | null>(null);
  const [sigData, setSigData] = useState('');
  const [pwd, setPwd] = useState('');
  const [err, setErr] = useState('');
  const mutation = useResendEnvelope();

  const reviewers = envelope.recipients.filter((r) => r.stepLabel === 'Reviewer');
  const approver = envelope.recipients.find((r) => r.stepLabel === 'Approver');

  async function handleResend() {
    if (!pwd) return setErr('Your e-signature password is required.');
    if (!sigData) return setErr('Please provide your signature.');
    setErr('');
    try {
      const fd = new FormData();
      fd.append('authorPassword', pwd);
      fd.append('authorSignatureType', 'typed');
      fd.append('authorSignatureData', sigData);
      fd.append('title', title);
      fd.append('message', message);
      if (file) fd.append('files', file);
      await mutation.mutateAsync({ id: envelope.id, formData: fd });
      onResent();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Resend failed.');
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !mutation.isPending && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Re-send — {envelope.title}</DialogTitle>
        </DialogHeader>

        <div className="rounded-md bg-warning-soft px-3 py-2.5 text-[12.5px] text-warning">
          This document was returned to you for revision. Re-signing sends it out again as round{' '}
          {(envelope.round || 1) + 1}; all reviewers and the approver will sign the current version afresh. To
          change reviewers/approvers, use View → Workflow → Reassign first.
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="resend-title">Title</Label>
          <Input id="resend-title" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="resend-message">
            Message <span className="font-normal text-slate">(optional)</span>
          </Label>
          <textarea
            id="resend-message"
            rows={2}
            className="flex w-full rounded-md border border-line-strong bg-paper-raised px-3 py-2 text-sm text-ink shadow-xs outline-none focus-visible:border-seal focus-visible:ring-2 focus-visible:ring-seal-ring"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>
            Replace document <span className="font-normal text-slate">(optional — leave empty to keep current)</span>
          </Label>
          <input
            type="file"
            accept="application/pdf"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="text-[13px] text-ink-soft file:mr-3 file:rounded-md file:border-0 file:bg-paper file:px-3 file:py-1.5 file:text-[13px] file:font-medium"
          />
        </div>

        <div className="text-[12px] text-slate">
          Signatories: {reviewers.length} Reviewer(s){approver ? `, Approver @${approver.username}` : ''}.
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Your signature</Label>
          <ErrorBoundary label="Signature pad">
            <SignaturePad onChange={setSigData} signerName={currentUser.fullName || currentUser.username} />
          </ErrorBoundary>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="resend-pwd">Your e-signature password *</Label>
          <Input id="resend-pwd" type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} autoComplete="off" />
        </div>

        {err && <div className="rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-[13px] text-danger">{err}</div>}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button onClick={handleResend} disabled={mutation.isPending || !pwd}>
            {mutation.isPending ? 'Re-sending…' : `Re-sign & Send (round ${(envelope.round || 1) + 1})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
