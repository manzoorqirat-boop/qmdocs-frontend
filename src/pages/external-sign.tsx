import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from '@tanstack/react-router';
import { ShieldCheck } from 'lucide-react';

const BASE_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

async function pub<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE_URL}/api/public/external${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  let data: Record<string, unknown> = {};
  try {
    data = await res.json();
  } catch {
    /* non-JSON response */
  }
  if (!res.ok) throw new Error((data.error as string) || 'Request failed');
  return data as T;
}

// The document-preview endpoint streams a raw binary PDF (Content-Type:
// application/pdf), not JSON — a plain pub() call here would call .json()
// on binary bytes, silently fail to parse, and return {}. The legacy
// version did exactly that, so the document preview never rendered for any
// external signer. Fetched separately as a Blob.
async function fetchDocumentBlob(token: string): Promise<Blob> {
  const res = await fetch(`${BASE_URL}/api/public/external/document/${encodeURIComponent(token)}`);
  if (!res.ok) {
    let msg = 'Could not load the document';
    try {
      const d = await res.json();
      msg = d.error || msg;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  return res.blob();
}

interface OpenInfo {
  status: string;
  documentTitle: string;
  documentNumber?: string;
  stepLabel?: string;
  recipientEmail?: string;
  released: boolean;
  expiresAt?: string;
}

type Phase = 'loading' | 'invalid' | 'holding' | 'otp' | 'signing' | 'done';

interface Identity {
  fullName: string;
  vendorId: string;
  designation: string;
  organization: string;
  department: string;
}

export function ExternalSignPage() {
  const params = useParams({ strict: false }) as { token?: string };
  const token = params.token || '';

  const [phase, setPhase] = useState<Phase>('loading');
  const [err, setErr] = useState('');
  const [info, setInfo] = useState<OpenInfo | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  const [otpName, setOtpName] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState('');
  const [busy, setBusy] = useState(false);

  const [docUrl, setDocUrl] = useState('');
  const [identity, setIdentity] = useState<Identity>({ fullName: '', vendorId: '', designation: '', organization: '', department: '' });
  const [attest, setAttest] = useState(false);
  const [consent, setConsent] = useState(false);

  useEffect(() => {
    if (!token) {
      setErr('This signing link is missing its token.');
      setPhase('invalid');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const d = await pub<OpenInfo>(`/sign/${encodeURIComponent(token)}`);
        if (cancelled) return;
        setInfo(d);
        setPhase(d.status === 'Released' || d.status === 'Verified' ? 'otp' : d.status === 'Signed' ? 'done' : 'holding');
      } catch (e) {
        if (cancelled) return;
        setErr(e instanceof Error ? e.message : 'This link could not be opened.');
        setPhase('invalid');
      }
    })();
    return () => {
      cancelled = true;
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [token]);

  useEffect(() => {
    if (phase !== 'holding') return;
    pollRef.current = setInterval(async () => {
      try {
        const s = await pub<{ status: string }>(`/status/${encodeURIComponent(token)}`);
        if (s.status === 'Released' || s.status === 'Verified') {
          clearInterval(pollRef.current);
          setPhase('otp');
        }
      } catch {
        /* keep polling */
      }
    }, 5000);
    return () => clearInterval(pollRef.current);
  }, [phase, token]);

  useEffect(() => {
    return () => {
      if (docUrl) URL.revokeObjectURL(docUrl);
    };
  }, [docUrl]);

  const sendOtp = useCallback(async () => {
    setErr('');
    setBusy(true);
    try {
      await pub(`/otp/${encodeURIComponent(token)}`, { method: 'POST', body: JSON.stringify({ name: otpName }) });
      setOtpSent(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not send the verification code.');
    } finally {
      setBusy(false);
    }
  }, [token, otpName]);

  const verifyOtp = useCallback(async () => {
    setErr('');
    setBusy(true);
    try {
      await pub(`/verify/${encodeURIComponent(token)}`, { method: 'POST', body: JSON.stringify({ otp }) });
      const blob = await fetchDocumentBlob(token);
      setDocUrl(URL.createObjectURL(blob));
      setPhase('signing');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Verification failed.');
    } finally {
      setBusy(false);
    }
  }, [token, otp]);

  const submit = useCallback(async () => {
    setErr('');
    if (!identity.fullName.trim()) return setErr('Your full name is required.');
    if (!attest) return setErr('Please confirm the attestation.');
    if (!consent) return setErr('Please consent to sign electronically.');
    setBusy(true);
    try {
      const name = identity.fullName.trim();
      await pub(`/submit/${encodeURIComponent(token)}`, {
        method: 'POST',
        body: JSON.stringify({
          identity,
          // The backend requires BOTH of these — signatureData (not
          // signatureName) and signingMeaning (a hard 400 if blank). The
          // typed name doubles as the signature data, same convention the
          // internal SignaturePad uses.
          signatureData: name,
          signingMeaning: `By signing this document with an electronic signature using QMDOCS I am agreeing that I have signed this document as ${info?.stepLabel || 'an external signatory'}.`,
          attestationAccepted: attest,
          esignConsent: consent,
        }),
      });
      setPhase('done');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not submit your signature.');
    } finally {
      setBusy(false);
    }
  }, [token, identity, attest, consent, info]);

  return (
    <div className="flex min-h-screen items-start justify-center bg-paper px-4 py-8">
      <div className="w-full max-w-[640px] overflow-hidden rounded-xl border border-line bg-paper-raised shadow-modal">
        <div className="bg-ink px-6 py-5 text-white">
          <div className="flex items-center gap-1.5 text-[12px] tracking-wide text-white/70 uppercase">
            <ShieldCheck size={13} /> QMDocs · Secure External Signing
          </div>
          <div className="mt-1 text-[18px] font-semibold">{info?.documentTitle || 'Document Signing'}</div>
        </div>

        <div className="p-6">
          {err && <div className="mb-3.5 rounded-md border border-danger/30 bg-danger-soft px-3 py-2.5 text-[13px] text-danger">{err}</div>}

          {phase === 'loading' && <p className="text-slate">Loading…</p>}

          {phase === 'invalid' && <p className="text-slate">This signing link cannot be used. If you believe this is an error, please contact the person who sent it.</p>}

          {phase === 'holding' && (
            <div>
              <div className="mb-3.5 rounded-md border border-success/30 bg-success-soft px-3 py-2.5 text-[13px] text-success">
                Your access is pending approval from the sender.
              </div>
              <p className="text-[13.5px] leading-relaxed text-slate">
                You have opened the document "<strong className="text-ink-soft">{info?.documentTitle}</strong>". The sender has
                been notified and must release your access before you can proceed. This page will update automatically once
                released — you can keep it open.
              </p>
            </div>
          )}

          {phase === 'otp' && (
            <div>
              <p className="mb-4 text-[13.5px] leading-relaxed text-slate">To verify your identity, we'll email a one-time code to your registered address.</p>
              {!otpSent ? (
                <>
                  <label className="mb-1.5 block text-[12.5px] font-semibold text-ink-soft">Your name (optional, for the email greeting)</label>
                  <input
                    className="mb-3.5 w-full rounded-md border border-line-strong px-3 py-2 text-sm text-ink outline-none focus-visible:border-seal focus-visible:ring-2 focus-visible:ring-seal-ring"
                    value={otpName}
                    onChange={(e) => setOtpName(e.target.value)}
                    placeholder="Your name"
                  />
                  <button
                    className="w-full rounded-md bg-seal px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
                    disabled={busy}
                    onClick={sendOtp}
                  >
                    {busy ? 'Sending…' : 'Send verification code'}
                  </button>
                </>
              ) : (
                <>
                  <div className="mb-3.5 rounded-md border border-success/30 bg-success-soft px-3 py-2.5 text-[13px] text-success">
                    A verification code has been emailed to you.
                  </div>
                  <label className="mb-1.5 block text-[12.5px] font-semibold text-ink-soft">Enter the 6-digit code</label>
                  <input
                    className="font-record mb-3.5 w-full rounded-md border border-line-strong px-3 py-2 text-center text-[20px] tracking-[6px] outline-none focus-visible:border-seal focus-visible:ring-2 focus-visible:ring-seal-ring"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="______"
                    inputMode="numeric"
                  />
                  <button
                    className="w-full rounded-md bg-seal px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
                    disabled={busy || otp.length !== 6}
                    onClick={verifyOtp}
                  >
                    {busy ? 'Verifying…' : 'Verify & continue'}
                  </button>
                  <button className="mt-2 w-full rounded-md px-5 py-3 text-sm font-semibold text-seal disabled:opacity-50" disabled={busy} onClick={sendOtp}>
                    Resend code
                  </button>
                </>
              )}
            </div>
          )}

          {phase === 'signing' && (
            <div>
              {docUrl && (
                <div className="mb-4">
                  <label className="mb-1.5 block text-[12.5px] font-semibold text-ink-soft">Document</label>
                  <embed src={docUrl} type="application/pdf" className="h-80 w-full rounded-md border border-line" />
                </div>
              )}
              <label className="mb-1.5 block text-[12.5px] font-semibold text-ink-soft">Full name *</label>
              <input
                className="mb-3.5 w-full rounded-md border border-line-strong px-3 py-2 text-sm outline-none focus-visible:border-seal focus-visible:ring-2 focus-visible:ring-seal-ring"
                value={identity.fullName}
                onChange={(e) => setIdentity({ ...identity, fullName: e.target.value })}
                placeholder="Your full legal name"
              />
              <label className="mb-1.5 block text-[12.5px] font-semibold text-ink-soft">Vendor / Employee ID</label>
              <input
                className="mb-3.5 w-full rounded-md border border-line-strong px-3 py-2 text-sm outline-none focus-visible:border-seal focus-visible:ring-2 focus-visible:ring-seal-ring"
                value={identity.vendorId}
                onChange={(e) => setIdentity({ ...identity, vendorId: e.target.value })}
              />
              <label className="mb-1.5 block text-[12.5px] font-semibold text-ink-soft">Designation</label>
              <input
                className="mb-3.5 w-full rounded-md border border-line-strong px-3 py-2 text-sm outline-none focus-visible:border-seal focus-visible:ring-2 focus-visible:ring-seal-ring"
                value={identity.designation}
                onChange={(e) => setIdentity({ ...identity, designation: e.target.value })}
              />
              <label className="mb-1.5 block text-[12.5px] font-semibold text-ink-soft">Organization</label>
              <input
                className="mb-3.5 w-full rounded-md border border-line-strong px-3 py-2 text-sm outline-none focus-visible:border-seal focus-visible:ring-2 focus-visible:ring-seal-ring"
                value={identity.organization}
                onChange={(e) => setIdentity({ ...identity, organization: e.target.value })}
              />
              <label className="mb-1.5 block text-[12.5px] font-semibold text-ink-soft">Department / Context</label>
              <input
                className="mb-3.5 w-full rounded-md border border-line-strong px-3 py-2 text-sm outline-none focus-visible:border-seal focus-visible:ring-2 focus-visible:ring-seal-ring"
                value={identity.department}
                onChange={(e) => setIdentity({ ...identity, department: e.target.value })}
              />

              <div className="my-1 mb-3.5 rounded-md border border-line bg-paper p-3">
                <label className="flex cursor-pointer items-start gap-2 text-[13px]">
                  <input type="checkbox" className="mt-0.5" checked={attest} onChange={(e) => setAttest(e.target.checked)} />
                  <span>I confirm my identity as stated above and that I am authorized to sign this document on behalf of my organization.</span>
                </label>
                <label className="mt-2.5 flex cursor-pointer items-start gap-2 text-[13px]">
                  <input type="checkbox" className="mt-0.5" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                  <span>I consent to signing this document electronically using QMDOCS.</span>
                </label>
              </div>

              {identity.fullName.trim() && (
                <div className="mb-3.5">
                  <label className="mb-1.5 block text-[12.5px] font-semibold text-ink-soft">Your signature</label>
                  <div
                    className="flex h-16 items-center justify-center rounded-md border border-dashed border-line-strong bg-white text-[28px]"
                    style={{ fontFamily: '"Brush Script MT", "Lucida Handwriting", cursive' }}
                  >
                    {identity.fullName.trim()}
                  </div>
                </div>
              )}

              <button className="w-full rounded-md bg-seal px-5 py-3 text-sm font-semibold text-white disabled:opacity-50" disabled={busy} onClick={submit}>
                {busy ? 'Submitting…' : 'Sign & submit'}
              </button>
            </div>
          )}

          {phase === 'done' && (
            <div>
              <div className="mb-3.5 rounded-md border border-success/30 bg-success-soft px-3 py-2.5 text-[13px] text-success">
                Thank you — your signature has been recorded.
              </div>
              <p className="text-[13.5px] leading-relaxed text-slate">
                Your electronic signature for "<strong className="text-ink-soft">{info?.documentTitle || 'the document'}</strong>" has
                been submitted successfully. You may now close this page.
              </p>
            </div>
          )}
        </div>

        <div className="border-t border-line px-6 py-3 text-center text-[11px] text-slate">
          Signed securely via QMDocs · All activity is recorded in the audit trail
        </div>
      </div>
    </div>
  );
}
