import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { ShieldCheck, User, Lock, Eye, EyeOff, ArrowRight, Loader2, Lock as LockSmall } from 'lucide-react';
import { useLoginMutation, useForgotPasswordMutation, useResetPasswordMutation } from '@/features/auth/hooks';
import { useCompanyLogo } from '@/features/company/hooks';
import { useSession } from '@/features/auth/session-context';
import { probeActiveUsers, saveSession } from '@/lib/session';
import { ApiRequestError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import type { LoginResponse } from '@/types/api';

const COMPLIANCE = [
  { t: '21 CFR Part 11', d: 'FDA electronic records & signatures' },
  { t: 'EU Annex 11', d: 'EMA computerised systems' },
  { t: 'GAMP 5', d: 'Risk-based validation lifecycle' },
  { t: 'ALCOA+', d: 'Data integrity by design' },
];

function isPasswordExpired(data: unknown): data is { mustChangePassword: true } & Record<string, unknown> {
  return !!data && typeof data === 'object' && 'mustChangePassword' in data;
}
function isLoggedOutEverywhere(data: unknown): data is { loggedOut: true; message: string } {
  return !!data && typeof data === 'object' && 'loggedOut' in data;
}

export function LoginPage() {
  const navigate = useNavigate();
  const { login } = useSession();
  const loginMutation = useLoginMutation();
  const forgotMutation = useForgotPasswordMutation();
  const resetMutation = useResetPasswordMutation();
  const { data: logoData } = useCompanyLogo();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);

  // Password reveal auto-hides after 3s — no manual hide needed.
  const hidePwdTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const togglePwd = useCallback(() => {
    clearTimeout(hidePwdTimer.current);
    setShowPwd((prev) => {
      const next = !prev;
      if (next) hidePwdTimer.current = setTimeout(() => setShowPwd(false), 3000);
      return next;
    });
  }, []);
  useEffect(() => () => clearTimeout(hidePwdTimer.current), []);

  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [sessionPrompt, setSessionPrompt] = useState<{ message: string } | null>(null);

  // Forgot password: two-step self-service reset.
  const [mode, setMode] = useState<'login' | 'forgot'>('login');
  const [fpStep, setFpStep] = useState<1 | 2>(1);
  const [fpUsername, setFpUsername] = useState('');
  const [fpOtp, setFpOtp] = useState('');
  const [fpPwd, setFpPwd] = useState('');
  const [fpPwd2, setFpPwd2] = useState('');
  const [fpError, setFpError] = useState('');
  const [fpInfo, setFpInfo] = useState('');

  function openForgot() {
    setMode('forgot');
    setFpStep(1);
    setFpUsername(username || '');
    setFpOtp('');
    setFpPwd('');
    setFpPwd2('');
    setFpError('');
    setFpInfo('');
    setError('');
  }
  function backToLogin(noticeMsg?: string) {
    setMode('login');
    setFpStep(1);
    setFpOtp('');
    setFpPwd('');
    setFpPwd2('');
    setFpError('');
    setFpInfo('');
    if (noticeMsg) setNotice(noticeMsg);
  }

  async function requestResetCode() {
    if (!fpUsername.trim()) return setFpError('Enter your username');
    setFpError('');
    setFpInfo('');
    try {
      const r = await forgotMutation.mutateAsync(fpUsername.trim());
      setFpInfo(r.message || 'If the account exists, a reset code has been sent to the registered email.');
      setFpStep(2);
    } catch (e) {
      setFpError(e instanceof Error ? e.message : 'Could not send reset code.');
    }
  }

  async function submitReset() {
    if (!fpOtp.trim()) return setFpError('Enter the 6-digit code from your email');
    if (!fpPwd) return setFpError('Enter a new password');
    if (fpPwd !== fpPwd2) return setFpError('Passwords do not match');
    setFpError('');
    try {
      const r = await resetMutation.mutateAsync({ username: fpUsername.trim(), otp: fpOtp.trim(), newPassword: fpPwd });
      backToLogin(r.message || 'Password reset successfully. Please sign in with your new password.');
    } catch (e) {
      setFpError(e instanceof Error ? e.message : 'Could not reset password.');
    }
  }

  async function finishLogin(data: unknown) {
    if (isLoggedOutEverywhere(data)) {
      setSessionPrompt(null);
      setNotice(data.message || 'All sessions have been logged out.');
      return;
    }
    // Password-expired and full-success both carry a token + enough fields
    // for the session gate to take over from here (PasswordChangeGate).
    saveSession(data as LoginResponse);
    login(data as LoginResponse);
    // Session state is now updated, but TanStack Router route guards only
    // run on navigation — they don't watch React state. Without this call
    // the app would stay stuck on /login even after a successful response.
    navigate({ to: '/app/dashboard' });
  }

  async function decideSession(decision: 'replace' | 'logoutAll') {
    setError('');
    try {
      const data = await loginMutation.mutateAsync({ username, password, sessionDecision: decision });
      await finishLogin(data);
      setSessionPrompt(null);
    } catch (err) {
      setSessionPrompt(null);
      setError(err instanceof Error ? err.message : 'Login failed. Please check your credentials.');
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setNotice('');
    try {
      // One user per browser: ask other tabs of THIS browser who is signed
      // in; block if a different account is active.
      const others = (await probeActiveUsers()).filter((u) => u !== username.trim());
      if (others.length) {
        setError(
          `"${others[0]}" is already signed in in another tab of this browser. Sign out there first, or use a different browser/profile.`,
        );
        return;
      }
      const data = await loginMutation.mutateAsync({ username, password });
      if (isPasswordExpired(data)) {
        await finishLogin(data);
        return;
      }
      await finishLogin(data);
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 409 && err.data?.requiresSessionDecision) {
        setSessionPrompt({ message: (err.data.message as string) || 'You are already logged in on another session.' });
      } else {
        setError(err instanceof Error ? err.message : 'Login failed. Please check your credentials.');
      }
    }
  }

  const loading = loginMutation.isPending;
  const decisionBusy = loginMutation.isPending;

  return (
    <div className="grid min-h-screen grid-cols-1 md:grid-cols-[minmax(0,1fr)_480px]">
      {/* Brand panel — the login hero. The seal-stamp motif appears exactly
          once here, oversized and quiet, doing double duty as the page's
          signature element and a literal illustration of what the product
          does. */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-ink p-10 text-white md:flex">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-24 -right-24 size-[420px] rounded-full border-[3px] border-stamp/25"
          style={{ transform: 'rotate(-8deg)' }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute top-16 right-4 flex size-64 -rotate-6 items-center justify-center rounded-full border-2 border-dashed border-stamp/30"
        />

        <div className="relative flex items-center gap-2 text-lg font-semibold">
          <span className="flex size-8 items-center justify-center rounded-md bg-seal">
            <ShieldCheck size={18} />
          </span>
          QMDocs
        </div>

        <div className="relative flex flex-1 items-center">
          {logoData?.companyLogo ? (
            <img src={logoData.companyLogo} alt="Company logo" className="max-h-40 max-w-[70%] object-contain" />
          ) : (
            <div className="max-w-sm">
              <div className="mb-3 inline-flex -rotate-2 items-center gap-2 rounded-full border border-stamp/50 bg-stamp/10 px-3 py-1 font-record text-[11px] font-semibold tracking-wide text-stamp uppercase">
                <ShieldCheck size={12} /> ALCOA+ · Part 11
              </div>
              <h1 className="text-3xl leading-tight font-semibold text-balance">
                Every signature, a record that holds.
              </h1>
              <p className="mt-3 text-[14.5px] leading-relaxed text-white/60">
                Electronic records and signatures for regulated documents — routed, signed, and
                audited end to end.
              </p>
            </div>
          )}
        </div>

        <div className="relative grid grid-cols-2 gap-x-6 gap-y-3">
          {COMPLIANCE.map((c) => (
            <div key={c.t}>
              <div className="font-record text-[12px] font-semibold tracking-wide text-white/90">{c.t}</div>
              <div className="text-[11.5px] text-white/45">{c.d}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Form panel */}
      <div className="flex min-h-screen items-center justify-center bg-paper p-6 md:p-10">
        <div className="w-full max-w-sm">
          <div className="mb-7 flex flex-col items-center text-center md:hidden">
            <span className="mb-3 flex size-12 items-center justify-center rounded-xl bg-seal text-white">
              <ShieldCheck size={24} />
            </span>
            <div className="text-xl font-semibold text-ink">QMDocs</div>
          </div>

          <div className="mb-1 text-[11px] font-semibold tracking-widest text-seal uppercase">Secure access</div>
          <h1 className="mb-1.5 text-2xl font-semibold text-ink">Sign in to your account</h1>
          <p className="mb-6 text-[13.5px] leading-relaxed text-slate">
            Authenticate to access electronic records, signatures, and the compliance audit trail.
          </p>

          {notice && (
            <div className="mb-4 rounded-md border border-success/30 bg-success-soft px-3 py-2.5 text-[13px] text-success">
              {notice}
            </div>
          )}

          {mode === 'login' ? (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="username">Username</Label>
                <div className="relative">
                  <User size={16} className="absolute top-1/2 left-3 -translate-y-1/2 text-slate" />
                  <Input
                    id="username"
                    className="pl-9"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Enter your username"
                    autoComplete="username"
                    required
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  <button
                    type="button"
                    onClick={openForgot}
                    className="text-[12.5px] font-semibold text-seal hover:underline"
                  >
                    Forgot password?
                  </button>
                </div>
                <div className="relative">
                  <Lock size={16} className="absolute top-1/2 left-3 -translate-y-1/2 text-slate" />
                  <Input
                    id="password"
                    className="pr-9 pl-9"
                    type={showPwd ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    autoComplete="current-password"
                    required
                  />
                  <button
                    type="button"
                    onClick={togglePwd}
                    tabIndex={-1}
                    aria-label={showPwd ? 'Hide password' : 'Show password'}
                    title={showPwd ? 'Hide password' : 'Show password (auto-hides in 3s)'}
                    className="absolute top-1/2 right-3 -translate-y-1/2 text-slate hover:text-ink"
                  >
                    {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-[13px] text-danger">
                  {error}
                </div>
              )}

              <Button type="submit" size="lg" disabled={loading} className="mt-1">
                {loading ? (
                  <>
                    <Loader2 size={16} className="animate-spin" /> Authenticating…
                  </>
                ) : (
                  <>
                    Sign in <ArrowRight size={16} />
                  </>
                )}
              </Button>
            </form>
          ) : (
            <div className="flex flex-col gap-4">
              <div>
                <div className="mb-1 text-[15px] font-semibold text-ink">Reset your password</div>
                <div className="text-[12.5px] text-slate">
                  {fpStep === 1
                    ? 'Enter your username and we will email a 6-digit reset code to your registered address.'
                    : 'Enter the 6-digit code from your email and choose a new password (it must meet the password policy and all sessions will be signed out).'}
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="fp-username">Username</Label>
                <Input
                  id="fp-username"
                  value={fpUsername}
                  onChange={(e) => setFpUsername(e.target.value)}
                  placeholder="Enter your username"
                  disabled={fpStep === 2 || forgotMutation.isPending}
                  required
                />
              </div>

              {fpStep === 2 && (
                <>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="fp-otp">Reset code</Label>
                    <Input
                      id="fp-otp"
                      inputMode="numeric"
                      maxLength={6}
                      value={fpOtp}
                      onChange={(e) => setFpOtp(e.target.value.replace(/\D/g, ''))}
                      placeholder="6-digit code from email"
                      disabled={resetMutation.isPending}
                      className="font-record tracking-[0.3em]"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="fp-pwd">New password</Label>
                    <div className="relative">
                      <Input
                        id="fp-pwd"
                        className="pr-9"
                        type={showPwd ? 'text' : 'password'}
                        value={fpPwd}
                        onChange={(e) => setFpPwd(e.target.value)}
                        placeholder="New password"
                        autoComplete="new-password"
                        disabled={resetMutation.isPending}
                      />
                      <button
                        type="button"
                        onClick={togglePwd}
                        tabIndex={-1}
                        aria-label={showPwd ? 'Hide password' : 'Show password'}
                        className="absolute top-1/2 right-3 -translate-y-1/2 text-slate hover:text-ink"
                      >
                        {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="fp-pwd2">Confirm new password</Label>
                    <Input
                      id="fp-pwd2"
                      type="password"
                      value={fpPwd2}
                      onChange={(e) => setFpPwd2(e.target.value)}
                      placeholder="Re-enter new password"
                      autoComplete="new-password"
                      disabled={resetMutation.isPending}
                    />
                  </div>
                </>
              )}

              {fpInfo && !fpError && (
                <div className="rounded-md border border-success/30 bg-success-soft px-3 py-2 text-[12.5px] text-success">
                  {fpInfo}
                </div>
              )}
              {fpError && (
                <div className="rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-[13px] text-danger">
                  {fpError}
                </div>
              )}

              <Button
                type="button"
                size="lg"
                disabled={forgotMutation.isPending || resetMutation.isPending}
                onClick={fpStep === 1 ? requestResetCode : submitReset}
              >
                {forgotMutation.isPending || resetMutation.isPending ? (
                  <>
                    <Loader2 size={16} className="animate-spin" /> {fpStep === 1 ? 'Sending code…' : 'Resetting…'}
                  </>
                ) : fpStep === 1 ? (
                  'Email me a reset code'
                ) : (
                  'Reset password'
                )}
              </Button>

              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => backToLogin()}
                  disabled={forgotMutation.isPending || resetMutation.isPending}
                  className="text-[12.5px] font-semibold text-slate hover:text-ink"
                >
                  ← Back to sign in
                </button>
                {fpStep === 2 && (
                  <button
                    type="button"
                    onClick={requestResetCode}
                    disabled={forgotMutation.isPending || resetMutation.isPending}
                    className="text-[12.5px] font-semibold text-seal hover:underline"
                  >
                    Resend code
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="mt-7 flex items-center gap-1.5 text-[11.5px] text-slate">
            <LockSmall size={13} />
            All access attempts are logged to the immutable audit trail.
          </div>
        </div>
      </div>

      <Dialog open={!!sessionPrompt} onOpenChange={(open) => !open && setSessionPrompt(null)}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Active session detected</DialogTitle>
            <DialogDescription>{sessionPrompt?.message}</DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col! gap-2">
            <Button className="w-full" disabled={decisionBusy} onClick={() => decideSession('replace')}>
              {decisionBusy ? 'Working…' : 'Log out previous & continue'}
            </Button>
            <Button
              variant="outline"
              className="w-full border-danger/30 text-danger hover:bg-danger-soft"
              disabled={decisionBusy}
              onClick={() => decideSession('logoutAll')}
            >
              Log out all sessions
            </Button>
            <Button variant="ghost" className="w-full" disabled={decisionBusy} onClick={() => setSessionPrompt(null)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
