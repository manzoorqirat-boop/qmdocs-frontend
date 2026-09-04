import { useEffect, useState } from 'react';
import { useParams } from '@tanstack/react-router';
import { BadgeCheck, ShieldAlert, ShieldCheck } from 'lucide-react';

const BASE_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

async function pub<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}/api/public/verify${path}`, {
    headers: { 'Content-Type': 'application/json' },
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

interface Signer {
  stepLabel: string;
  signerName: string;
  designation: string;
  department: string;
  signingMeaning: string;
  signedAt: string;
  isExternal: boolean;
  organization: string | null;
}

interface VerifyResult {
  valid: boolean;
  message?: string;
  documentNumber?: string;
  documentTitle?: string;
  envelopeTitle?: string;
  issuedAt?: string;
  completedAt?: string;
  signers?: Signer[];
}

type Phase = 'loading' | 'error' | 'result';

function formatDate(iso?: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function VerifyPage() {
  const params = useParams({ strict: false }) as { code?: string };
  const code = params.code || '';

  const [phase, setPhase] = useState<Phase>('loading');
  const [err, setErr] = useState('');
  const [result, setResult] = useState<VerifyResult | null>(null);

  useEffect(() => {
    if (!code) {
      setErr('No verification code was given.');
      setPhase('error');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const d = await pub<VerifyResult>(`/${encodeURIComponent(code)}`);
        if (cancelled) return;
        setResult(d);
        setPhase('result');
      } catch (e) {
        if (cancelled) return;
        setErr(e instanceof Error ? e.message : 'Could not check this code right now.');
        setPhase('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code]);

  return (
    <div className="flex min-h-screen items-start justify-center bg-paper px-4 py-8">
      <div className="w-full max-w-[640px] overflow-hidden rounded-xl border border-line bg-paper-raised shadow-modal">
        <div className="bg-ink px-6 py-5 text-white">
          <div className="flex items-center gap-1.5 text-[12px] tracking-wide text-white/70 uppercase">
            <ShieldCheck size={13} /> QMDocs · Document Verification
          </div>
          <div className="mt-1 text-[18px] font-semibold">Verify an electronic signature record</div>
        </div>

        <div className="p-6">
          {phase === 'loading' && <p className="text-slate">Checking this code…</p>}

          {phase === 'error' && (
            <div className="rounded-md border border-danger/30 bg-danger-soft px-3 py-2.5 text-[13px] text-danger">{err}</div>
          )}

          {phase === 'result' && result && !result.valid && (
            <div>
              <div className="mb-3.5 flex items-center gap-2 rounded-md border border-danger/30 bg-danger-soft px-3 py-2.5 text-[13px] text-danger">
                <ShieldAlert size={16} className="shrink-0" />
                Code not recognised
              </div>
              <p className="text-[13.5px] leading-relaxed text-slate">
                {result.message || 'This verification code does not match any record. Check the code and try again.'}
              </p>
            </div>
          )}

          {phase === 'result' && result?.valid && (
            <div>
              <div className="mb-4 flex items-center gap-2 rounded-md border border-success/30 bg-success-soft px-3 py-2.5 text-[13px] text-success">
                <BadgeCheck size={16} className="shrink-0" />
                This document is authentic and matches our records
              </div>

              <div className="mb-4">
                <div className="text-[15px] font-semibold text-ink">{result.documentTitle}</div>
                <div className="mt-0.5 text-[13px] text-slate">{result.documentNumber}</div>
                {result.envelopeTitle && result.envelopeTitle !== result.documentTitle && (
                  <div className="mt-0.5 text-[12.5px] text-slate">Part of: {result.envelopeTitle}</div>
                )}
                {result.completedAt && (
                  <div className="mt-1 text-[12.5px] text-slate">Completed {formatDate(result.completedAt)}</div>
                )}
              </div>

              <div className="border-t border-line pt-4">
                <div className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-slate">Signatures</div>
                <ol className="space-y-3">
                  {result.signers?.map((s, i) => (
                    <li key={i} className="flex gap-3">
                      <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-seal-soft text-[11px] font-semibold text-seal">
                        {i + 1}
                      </div>
                      <div className="min-w-0">
                        <div className="text-[13.5px] font-semibold text-ink-soft">{s.signerName}</div>
                        <div className="text-[12.5px] text-slate">
                          {s.stepLabel}
                          {s.isExternal
                            ? s.organization
                              ? ` · ${s.designation}, ${s.organization}`
                              : ' · External signatory'
                            : s.designation || s.department
                              ? ` · ${[s.designation, s.department].filter(Boolean).join(' — ')}`
                              : ''}
                        </div>
                        <div className="text-[12px] text-slate">{formatDate(s.signedAt)}</div>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
