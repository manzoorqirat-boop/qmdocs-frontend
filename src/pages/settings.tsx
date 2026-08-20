import { useState, useMemo, useEffect } from 'react';
import { Check, X } from 'lucide-react';
import { useSession } from '@/features/auth/session-context';
import { useDepartments } from '@/features/departments/hooks';
import {
  useSettingsList,
  useSaveSettings,
  useReminderConfig,
  useSaveReminderConfig,
  useRunRemindersNow,
  useTestEmail,
  useCompanyLogoAdmin,
  useSaveCompanyLogo,
  useDesignations,
  useSaveDesignations,
} from '@/features/settings/hooks';
import { useChangePasswordMutation } from '@/features/auth/hooks';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { PasswordConfirmDialog, type PasswordConfirmAction } from '@/components/password-confirm-dialog';
import { cn } from '@/lib/utils';

function StatusMsg({ msg }: { msg: string }) {
  if (!msg) return null;
  const ok = msg.startsWith('✓');
  const text = ok ? msg.slice(1).trim() : msg;
  return (
    <div className={`flex items-center gap-1.5 text-[13px] ${ok ? 'text-success' : 'text-danger'}`}>
      {ok && <Check size={14} />}
      <span>{text}</span>
    </div>
  );
}

const SECTIONS: Record<string, string> = {
  security: 'Security Settings',
  email: 'Email Notifications',
  masterData: 'Signing Statements',
  qaDept: 'Approval Department',
  printDepts: 'Print & Download Access',
  makerChecker: 'Dual Approval (Maker-Checker)',
};
const SECURITY_KEYS = ['minPasswordLength', 'passwordExpiry', 'passwordHistory', 'maxFailedAttempts', 'lockoutDuration', 'sessionTimeout', 'systemVersion'];
const EMAIL_KEYS = ['emailEnabled', 'smtpHost', 'smtpPort', 'gmailUser', 'gmailPass', 'fromEmail', 'fromName'];

// Sectioned nav instead of one long scroll of 9+ stacked cards — the
// standard pattern for an admin settings page with this many distinct
// areas (same shape as Slack/GitHub/Linear settings). Each key maps to
// exactly one of the existing cards below; content and logic underneath
// is unchanged, only how you get to it.
const SECTION_NAV = [
  { key: 'logo', label: 'Homepage Banner', adminOnly: true },
  { key: 'security', label: 'Security Settings', adminOnly: true },
  { key: 'email', label: 'Email Notifications', adminOnly: true },
  { key: 'masterData', label: 'Signing Statements', adminOnly: true },
  { key: 'qaDept', label: 'Approval Department', adminOnly: true },
  { key: 'printDepts', label: 'Print & Download Access', adminOnly: true },
  { key: 'makerChecker', label: 'Dual Approval', adminOnly: true },
  { key: 'reminders', label: 'Signature Reminders', adminOnly: true },
  { key: 'designations', label: 'Job Titles', adminOnly: true },
  { key: 'password', label: 'Change Password', adminOnly: false },
] as const;
type SectionKey = (typeof SECTION_NAV)[number]['key'];

function Field({
  value,
  onChange,
  label,
  type = 'text',
  placeholder = '',
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  type?: string;
  placeholder?: string;
  disabled: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      <Input
        type={type}
        placeholder={placeholder}
        value={value}
        disabled={disabled}
        title={disabled ? 'View-only — changes require an Administrator (Super Admin)' : undefined}
        onChange={(e) => !disabled && onChange(e.target.value)}
      />
    </div>
  );
}

function SaveBtn({ savedHere, pending, onClick }: { savedHere: boolean; pending: boolean; onClick: () => void }) {
  return (
    <Button size="sm" onClick={onClick} disabled={pending}>
      {savedHere ? (
        <>
          <Check size={14} /> Saved
        </>
      ) : pending ? (
        'Saving…'
      ) : (
        'Save'
      )}
    </Button>
  );
}

export function SettingsPage() {
  const { user, refreshSession } = useSession();
  const isAdmin = ['IT Admin', 'Administrator'].includes(user?.role || '');
  const isSuperAdmin = user?.role === 'Administrator';
  const [activeSection, setActiveSection] = useState<SectionKey>(isAdmin ? 'logo' : 'password');

  const { data: settingsRaw = [], isLoading } = useSettingsList();
  const { data: departments = [] } = useDepartments();
  const saveSettings = useSaveSettings();

  const [settings, setSettings] = useState<Record<string, string>>({});
  const [prevSettingsRaw, setPrevSettingsRaw] = useState(settingsRaw);
  if (settingsRaw !== prevSettingsRaw) {
    setPrevSettingsRaw(settingsRaw);
    const map: Record<string, string> = {};
    settingsRaw.forEach((s) => {
      map[s.key] = s.value;
    });
    setSettings(map);
  }

  const [signingMeanings, setSigningMeanings] = useState({ Author: '', Reviewer: '', Approver: '' });
  const [printDept, setPrintDept] = useState('');
  const [printDepts, setPrintDepts] = useState<string[]>([]);
  const [makerChecker, setMakerChecker] = useState({ Site: false, Department: false, Settings: false });
  const [masterDataLoaded, setMasterDataLoaded] = useState(false);
  const activeDepts = useMemo(() => departments.filter((d) => d.isActive !== false).map((d) => d.name), [departments]);

  useEffect(() => {
    if (masterDataLoaded) return;
    import('@/lib/api').then(({ api }) =>
      api.getMasterData().then((md) => {
        if (md?.signingMeanings) setSigningMeanings((prev) => ({ ...prev, ...md.signingMeanings }));
        if (md?.printDownloadDepartment) setPrintDept(md.printDownloadDepartment);
        if (Array.isArray(md?.printDownloadDepartments)) setPrintDepts(md.printDownloadDepartments);
        setMasterDataLoaded(true);
      }),
    );
  }, [masterDataLoaded]);

  // Parse makerCheckerConfig once it arrives in the settings map.
  const [mcSourceKey, setMcSourceKey] = useState('');
  if (settings.makerCheckerConfig && settings.makerCheckerConfig !== mcSourceKey) {
    setMcSourceKey(settings.makerCheckerConfig);
    try {
      const cfg = JSON.parse(settings.makerCheckerConfig);
      setMakerChecker({ Site: !!cfg.Site, Department: !!cfg.Department, Settings: !!cfg.Settings });
    } catch {
      /* keep defaults */
    }
  }

  // ── Section save (shared e-signature confirm dialog) ──────────────────
  const [pwAction, setPwAction] = useState<PasswordConfirmAction | null>(null);
  const [pwBusy, setPwBusy] = useState(false);
  const [pwError, setPwError] = useState('');
  const [savedSection, setSavedSection] = useState('');

  function sectionPayload(section: string): Record<string, unknown> {
    switch (section) {
      case 'security':
        return Object.fromEntries(SECURITY_KEYS.map((k) => [k, settings[k] ?? '']));
      case 'email':
        return Object.fromEntries(EMAIL_KEYS.map((k) => [k, settings[k] ?? '']));
      case 'masterData':
        return { signingMeanings: JSON.stringify(signingMeanings) };
      case 'qaDept':
        return { printDownloadDepartment: printDept };
      case 'printDepts':
        return { printDownloadDepartments: JSON.stringify(printDepts) };
      case 'makerChecker':
        return { makerCheckerConfig: JSON.stringify(makerChecker) };
      default:
        return {};
    }
  }

  function openSaveModal(section: string) {
    if (!isSuperAdmin) return;
    setPwError('');
    setPwAction({
      title: 'Confirm Settings Update',
      message: `You are saving: ${SECTIONS[section]}. Re-enter your password as an electronic signature. Only this section's changed values are saved and recorded in the audit trail.`,
      confirmLabel: 'Save & Sign',
      run: async (password) => {
        const payload = sectionPayload(section);
        await saveSettings.mutateAsync({ adminUsername: user!.username, adminPassword: password, settings: payload });
        setSavedSection(section);
        setTimeout(() => setSavedSection(''), 3000);
      },
    });
  }
  async function runPwAction(password: string) {
    if (!pwAction) return;
    setPwBusy(true);
    setPwError('');
    try {
      await pwAction.run(password);
      setPwAction(null);
    } catch (e) {
      setPwError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setPwBusy(false);
    }
  }

  // ── Company logo ─────────────────────────────────────────────────────
  const { data: logoData } = useCompanyLogoAdmin();
  const saveLogo = useSaveCompanyLogo();
  const [logoPwd, setLogoPwd] = useState('');
  const [logoMsg, setLogoMsg] = useState('');

  async function handleLogoUpload(file: File | undefined) {
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/jpg', 'image/webp'].includes(file.type)) return setLogoMsg('Only PNG, JPEG, or WebP images allowed');
    if (file.size > 2 * 1024 * 1024) return setLogoMsg('File too large (max 2 MB)');
    if (!logoPwd) return setLogoMsg('Enter your password to confirm the change');
    setLogoMsg('');
    try {
      const dataUri = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error('Could not read file'));
        reader.readAsDataURL(file);
      });
      await saveLogo.mutateAsync({ adminUsername: user!.username, adminPassword: logoPwd, companyLogo: dataUri });
      setLogoPwd('');
      setLogoMsg('✓ Company logo saved');
      setTimeout(() => setLogoMsg(''), 3000);
    } catch (e) {
      setLogoMsg(e instanceof Error ? e.message : 'Upload failed');
    }
  }
  async function handleLogoRemove() {
    if (!logoPwd) return setLogoMsg('Enter your password to confirm removal');
    setLogoMsg('');
    try {
      await saveLogo.mutateAsync({ adminUsername: user!.username, adminPassword: logoPwd, companyLogo: '' });
      setLogoPwd('');
      setLogoMsg('Company logo removed');
      setTimeout(() => setLogoMsg(''), 3000);
    } catch (e) {
      setLogoMsg(e instanceof Error ? e.message : 'Removal failed');
    }
  }

  // ── Test email ───────────────────────────────────────────────────────
  const testEmail = useTestEmail();
  const [testEmailTo, setTestEmailTo] = useState('');
  const [testMsg, setTestMsg] = useState('');
  async function handleTestEmail() {
    if (!testEmailTo || !testEmailTo.includes('@')) return setTestMsg('Enter a valid email');
    setTestMsg('');
    try {
      const r = await testEmail.mutateAsync(testEmailTo);
      setTestMsg('✓ ' + (r.message || `Test email sent to ${testEmailTo}`));
    } catch (e) {
      setTestMsg(e instanceof Error ? e.message : 'Failed to send test email');
    }
  }

  // ── Reminder config — uses the DEDICATED endpoint + sendHour (int),
  // not the generic settings list (see MIGRATION_STATUS.md: the legacy
  // app read a "reminderConfig" key that doesn't exist server-side, and
  // saved a "sendTimeHHMM" field the backend has never understood). ────
  const { data: reminderData } = useReminderConfig();
  const saveReminder = useSaveReminderConfig();
  const runRemindersNow = useRunRemindersNow();
  const [reminderCfg, setReminderCfg] = useState({ enabled: false, sendHour: 9, repeatEveryDays: 1 });
  const [prevReminderData, setPrevReminderData] = useState(reminderData);
  if (reminderData && reminderData !== prevReminderData) {
    setPrevReminderData(reminderData);
    setReminderCfg({ enabled: reminderData.enabled, sendHour: reminderData.sendHour, repeatEveryDays: reminderData.repeatEveryDays });
  }
  const [reminderMsg, setReminderMsg] = useState('');
  async function handleSaveReminder() {
    setReminderMsg('');
    try {
      await saveReminder.mutateAsync(reminderCfg);
      setReminderMsg('Reminder settings saved.');
      setTimeout(() => setReminderMsg(''), 3000);
    } catch (e) {
      setReminderMsg(e instanceof Error ? e.message : 'Save failed');
    }
  }
  async function handleRunRemindersNow() {
    setReminderMsg('');
    try {
      const r = await runRemindersNow.mutateAsync();
      const sent = r?.result?.sent;
      setReminderMsg(typeof sent === 'number' ? `Sent ${sent} reminder email(s).` : 'Reminder run complete.');
      setTimeout(() => setReminderMsg(''), 4000);
    } catch (e) {
      setReminderMsg(e instanceof Error ? e.message : 'Run failed');
    }
  }

  // ── Designations ─────────────────────────────────────────────────────
  const { data: designationsData } = useDesignations();
  const saveDesignations = useSaveDesignations();
  const [designations, setDesignations] = useState<string[]>([]);
  const [prevDesignationsData, setPrevDesignationsData] = useState(designationsData);
  if (designationsData && designationsData !== prevDesignationsData) {
    setPrevDesignationsData(designationsData);
    setDesignations(designationsData.designations || []);
  }
  const [newDesignation, setNewDesignation] = useState('');
  const [designationMsg, setDesignationMsg] = useState('');
  function addDesignation() {
    const t = newDesignation.trim();
    if (t && !designations.some((d) => d.toLowerCase() === t.toLowerCase())) setDesignations((prev) => [...prev, t]);
    setNewDesignation('');
  }
  async function handleSaveDesignations() {
    setDesignationMsg('');
    try {
      const r = await saveDesignations.mutateAsync(designations);
      setDesignations(r.designations || designations);
      setDesignationMsg('Designations saved.');
      setTimeout(() => setDesignationMsg(''), 3000);
    } catch (e) {
      setDesignationMsg(e instanceof Error ? e.message : 'Save failed');
    }
  }

  // ── Change password (any role) ─────────────────────────────────────
  const changePassword = useChangePasswordMutation();
  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [pwMsg, setPwMsg] = useState('');
  async function handlePasswordChange() {
    if (!pwForm.currentPassword || !pwForm.newPassword) return setPwMsg('All fields required');
    if (pwForm.newPassword !== pwForm.confirmPassword) return setPwMsg('Passwords do not match');
    setPwMsg('');
    try {
      const data = await changePassword.mutateAsync({ username: user!.username, currentPassword: pwForm.currentPassword, newPassword: pwForm.newPassword });
      refreshSession(data as import('@/types/api').LoginResponse);
      setPwMsg('✓ Password changed successfully');
      setPwForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (e) {
      setPwMsg(e instanceof Error ? e.message : 'Could not change password.');
    }
  }

  if (isLoading) return <div className="py-16 text-center text-[13px] text-slate">Loading settings…</div>;

  const visibleNav = SECTION_NAV.filter((s) => isAdmin || !s.adminOnly);

  return (
    <div className="mx-auto grid max-w-5xl grid-cols-1 items-start gap-5 lg:grid-cols-[220px_1fr]">
      <nav className="flex gap-1 overflow-x-auto lg:sticky lg:top-4 lg:flex-col lg:overflow-visible">
        {visibleNav.map((s) => (
          <button
            key={s.key}
            onClick={() => setActiveSection(s.key)}
            className={cn(
              'shrink-0 rounded-md px-3 py-2 text-left text-[13px] font-medium whitespace-nowrap transition-colors',
              activeSection === s.key ? 'bg-seal-soft text-seal' : 'text-ink-soft hover:bg-paper',
            )}
          >
            {s.label}
          </button>
        ))}
      </nav>

      <div className="min-w-0">
        <>
          {activeSection === 'logo' && isAdmin && (
            <>
              {/* Company Logo */}
              <Card>
            <CardHeader>
              <CardTitle>Homepage Banner</CardTitle>
              <CardDescription className="font-record uppercase">Superadmin only · shown on the login screen</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap items-start gap-5">
              <div className="flex h-[130px] w-[220px] shrink-0 items-center justify-center overflow-hidden rounded-md border border-dashed border-line-strong bg-paper p-2.5">
                {logoData?.companyLogo ? (
                  <img src={logoData.companyLogo} alt="Company logo" className="max-h-full max-w-full object-contain" />
                ) : (
                  <span className="text-[12px] text-slate">No logo set</span>
                )}
              </div>
              <div className="min-w-[240px] flex-1">
                <p className="mb-3 text-[12.5px] leading-relaxed text-slate">
                  Upload your organisation's logo (PNG, JPEG, or WebP, max 2 MB). It appears in the branding panel of the
                  login screen. Changing it requires your password and is recorded in the audit trail.
                </p>
                {!isSuperAdmin && <div className="mb-2 text-[12px] text-slate">View-only — changing the logo requires an Administrator (Super Admin).</div>}
                <Label className="mb-1.5 block">Confirm with your password</Label>
                <Input type="password" className="mb-2.5 max-w-[320px]" value={logoPwd} onChange={(e) => setLogoPwd(e.target.value)} placeholder="Your password" autoComplete="off" disabled={!isSuperAdmin} />
                {isSuperAdmin && (
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="cursor-pointer">
                      <span className="inline-flex h-9 items-center rounded-md bg-seal px-4 text-sm font-medium text-white hover:bg-seal-hover">
                        {saveLogo.isPending ? 'Working…' : logoData?.companyLogo ? 'Replace logo' : 'Upload logo'}
                      </span>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="hidden"
                        disabled={saveLogo.isPending}
                        onChange={(e) => {
                          handleLogoUpload(e.target.files?.[0]);
                          e.target.value = '';
                        }}
                      />
                    </label>
                    {logoData?.companyLogo && (
                      <Button variant="outline" size="sm" className="border-danger/30 text-danger hover:bg-danger-soft" onClick={handleLogoRemove} disabled={saveLogo.isPending}>
                        Remove
                      </Button>
                    )}
                  </div>
                )}
                {logoMsg && (
                  <div className="mt-2.5">
                    <StatusMsg msg={logoMsg} />
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

            </>
          )}

          {activeSection === 'security' && isAdmin && (
            <>
              {/* System Settings — Security */}
              <Card>
            <CardHeader className="flex-row items-center justify-between">
              <div>
                <CardTitle>Security Settings</CardTitle>
                <CardDescription className="font-record uppercase">
                  Security &amp; compliance · 21 CFR Part 11 · {isSuperAdmin ? 'Super Admin' : 'View-only (Administrator required to edit)'}
                </CardDescription>
              </div>
              {isSuperAdmin && <SaveBtn savedHere={savedSection === 'security'} pending={saveSettings.isPending} onClick={() => openSaveModal('security')} />}
            </CardHeader>
            <CardContent>
              {!isSuperAdmin && (
                <div className="mb-3.5 rounded-md border border-line bg-paper px-3 py-2 text-[12px] text-slate">
                  These settings are view-only for your role. Only an Administrator (Super Admin) can change them.
                </div>
              )}
              <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3.5">
                <Field label="Min Password Length" type="number" placeholder="8" value={settings.minPasswordLength ?? ''} onChange={(v) => setSettings((s) => ({ ...s, minPasswordLength: v }))} disabled={!isSuperAdmin} />
                <Field label="Password Expiry (days)" type="number" placeholder="60" value={settings.passwordExpiry ?? ''} onChange={(v) => setSettings((s) => ({ ...s, passwordExpiry: v }))} disabled={!isSuperAdmin} />
                <Field label="Password History Count" type="number" placeholder="3" value={settings.passwordHistory ?? ''} onChange={(v) => setSettings((s) => ({ ...s, passwordHistory: v }))} disabled={!isSuperAdmin} />
                <Field label="Max Failed Login Attempts" type="number" placeholder="5" value={settings.maxFailedAttempts ?? ''} onChange={(v) => setSettings((s) => ({ ...s, maxFailedAttempts: v }))} disabled={!isSuperAdmin} />
                <Field label="Lockout Duration (minutes)" type="number" placeholder="15" value={settings.lockoutDuration ?? ''} onChange={(v) => setSettings((s) => ({ ...s, lockoutDuration: v }))} disabled={!isSuperAdmin} />
                <Field label="Session Timeout (minutes)" type="number" placeholder="480" value={settings.sessionTimeout ?? ''} onChange={(v) => setSettings((s) => ({ ...s, sessionTimeout: v }))} disabled={!isSuperAdmin} />
                <Field label="System Version (shown on exports)" placeholder="1.0" value={settings.systemVersion ?? ''} onChange={(v) => setSettings((s) => ({ ...s, systemVersion: v }))} disabled={!isSuperAdmin} />
              </div>
            </CardContent>
          </Card>

            </>
          )}

          {activeSection === 'email' && isAdmin && (
            <>
              {/* Email / SMTP */}
              <Card>
            <CardHeader className="flex-row items-center justify-between">
              <div>
                <CardTitle>Email Notifications</CardTitle>
                <CardDescription className="font-record uppercase">Notifications · {isSuperAdmin ? 'Super Admin' : 'View-only (Administrator required to edit)'}</CardDescription>
              </div>
              {isSuperAdmin && <SaveBtn savedHere={savedSection === 'email'} pending={saveSettings.isPending} onClick={() => openSaveModal('email')} />}
            </CardHeader>
            <CardContent>
              <div className="mb-4 grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3.5">
                <Field label="Email Notifications (Yes/No)" placeholder="Yes" value={settings.emailEnabled ?? ''} onChange={(v) => setSettings((s) => ({ ...s, emailEnabled: v }))} disabled={!isSuperAdmin} />
                <Field label="SMTP Host" placeholder="smtp.gmail.com" value={settings.smtpHost ?? ''} onChange={(v) => setSettings((s) => ({ ...s, smtpHost: v }))} disabled={!isSuperAdmin} />
                <Field label="SMTP Port" type="number" placeholder="587" value={settings.smtpPort ?? ''} onChange={(v) => setSettings((s) => ({ ...s, smtpPort: v }))} disabled={!isSuperAdmin} />
                <Field label="Gmail Address / SMTP User" type="email" value={settings.gmailUser ?? ''} onChange={(v) => setSettings((s) => ({ ...s, gmailUser: v }))} disabled={!isSuperAdmin} />
                <Field label="Gmail App Password" type="password" value={settings.gmailPass ?? ''} onChange={(v) => setSettings((s) => ({ ...s, gmailPass: v }))} disabled={!isSuperAdmin} />
                <Field label="From Email Address" type="email" value={settings.fromEmail ?? ''} onChange={(v) => setSettings((s) => ({ ...s, fromEmail: v }))} disabled={!isSuperAdmin} />
                <Field label="From Name" placeholder="QMDocs" value={settings.fromName ?? ''} onChange={(v) => setSettings((s) => ({ ...s, fromName: v }))} disabled={!isSuperAdmin} />
              </div>
              <div className="rounded-md border border-line bg-paper p-3.5">
                <div className="mb-2 text-[13px] font-semibold">Send Test Email</div>
                <div className="flex gap-2">
                  <Input className="flex-1" type="email" placeholder="your.email@example.com" value={testEmailTo} onChange={(e) => setTestEmailTo(e.target.value)} />
                  <Button variant="ghost" size="sm" onClick={handleTestEmail} disabled={testEmail.isPending}>
                    {testEmail.isPending ? 'Sending…' : 'Send Test'}
                  </Button>
                </div>
                {testMsg && (
                  <div className="mt-2">
                    <StatusMsg msg={testMsg} />
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

            </>
          )}

          {activeSection === 'masterData' && isAdmin && (
            <>
              {/* Document Master Data */}
              <Card>
            <CardHeader className="flex-row items-center justify-between">
              <div>
                <CardTitle>Signing Statements</CardTitle>
                <CardDescription className="font-record uppercase">Signing attestation statements · saved independently</CardDescription>
              </div>
              {isSuperAdmin && <SaveBtn savedHere={savedSection === 'masterData'} pending={saveSettings.isPending} onClick={() => openSaveModal('masterData')} />}
            </CardHeader>
            <CardContent>
              <div className="mb-2.5 text-[12px] text-slate">Shown to the signer and recorded on the signed PDF for each role.</div>
              {(['Author', 'Reviewer', 'Approver'] as const).map((roleKey) => (
                <div key={roleKey} className="mb-3 flex flex-col gap-1.5">
                  <Label>{roleKey}</Label>
                  <textarea
                    rows={2}
                    className="w-full resize-y rounded-md border border-line-strong bg-paper-raised px-3 py-2 text-sm text-ink outline-none focus-visible:border-seal focus-visible:ring-2 focus-visible:ring-seal-ring disabled:opacity-60"
                    value={signingMeanings[roleKey] || ''}
                    disabled={!isSuperAdmin}
                    onChange={(e) => setSigningMeanings((s) => ({ ...s, [roleKey]: e.target.value }))}
                  />
                </div>
              ))}
            </CardContent>
          </Card>

            </>
          )}

          {activeSection === 'qaDept' && isAdmin && (
            <>
              {/* QA / Checker department */}
              <Card>
            <CardHeader className="flex-row items-center justify-between">
              <div>
                <CardTitle>Approval Department</CardTitle>
                <CardDescription className="font-record uppercase">Maker-checker approvers · saved independently</CardDescription>
              </div>
              {isSuperAdmin && <SaveBtn savedHere={savedSection === 'qaDept'} pending={saveSettings.isPending} onClick={() => openSaveModal('qaDept')} />}
            </CardHeader>
            <CardContent>
              <div className="max-w-[420px]">
                <div className="mb-2 text-[12px] text-slate">Approvers in this department review and approve staged change requests.</div>
                <Select value={printDept || '__none'} onValueChange={(v) => setPrintDept(v === '__none' ? '' : v)} disabled={!isSuperAdmin}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="— Select department —" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">— Select department —</SelectItem>
                    {printDept && !activeDepts.includes(printDept) && <SelectItem value={printDept}>{printDept} (legacy)</SelectItem>}
                    {activeDepts.map((d) => (
                      <SelectItem key={d} value={d}>
                        {d}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

            </>
          )}

          {activeSection === 'printDepts' && isAdmin && (
            <>
              {/* Print / Download departments */}
              <Card>
            <CardHeader className="flex-row items-center justify-between">
              <div>
                <CardTitle>Print & Download Access</CardTitle>
                <CardDescription className="font-record uppercase">Multi-select · saved independently</CardDescription>
              </div>
              {isSuperAdmin && <SaveBtn savedHere={savedSection === 'printDepts'} pending={saveSettings.isPending} onClick={() => openSaveModal('printDepts')} />}
            </CardHeader>
            <CardContent>
              <div className="max-w-[420px]">
                <div className="mb-2 text-[12px] text-slate">
                  All active users in the selected departments may print or download fully-signed PDFs (the document
                  initiator always can). If none are selected, the Approval department applies.
                </div>
                {activeDepts.length === 0 ? (
                  <div className="text-[12px] text-slate">No active departments found.</div>
                ) : (
                  <div className="flex max-h-[220px] flex-col gap-1.5 overflow-y-auto rounded-md border border-line p-2.5">
                    {activeDepts.map((name) => (
                      <label key={name} className="flex cursor-pointer items-center gap-2 text-[13px]">
                        <Checkbox
                          checked={printDepts.includes(name)}
                          disabled={!isSuperAdmin}
                          onCheckedChange={(c) => setPrintDepts((prev) => (c ? [...prev, name] : prev.filter((d) => d !== name)))}
                        />
                        {name}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

            </>
          )}

          {activeSection === 'makerChecker' && isAdmin && (
            <>
              {/* Maker-Checker */}
              <Card>
            <CardHeader className="flex-row items-center justify-between">
              <div>
                <CardTitle>Dual Approval (Maker-Checker)</CardTitle>
                <CardDescription className="font-record uppercase">4-eyes change control · saved independently</CardDescription>
              </div>
              {isSuperAdmin && <SaveBtn savedHere={savedSection === 'makerChecker'} pending={saveSettings.isPending} onClick={() => openSaveModal('makerChecker')} />}
            </CardHeader>
            <CardContent>
              <p className="mb-3 text-[12px] leading-relaxed text-slate">
                When enabled, create/edit/deactivate actions on the selected master data are staged as a Change Request
                and only take effect after a different QA Approver approves them with an e-signature. Operational
                settings (email, security) are never gated.
              </p>
              {(
                [
                  { key: 'Site' as const, label: 'Sites', desc: 'New, edited, or deactivated sites require approval.' },
                  { key: 'Department' as const, label: 'Departments', desc: 'New, edited, or deactivated departments require approval.' },
                  { key: 'Settings' as const, label: 'Signing Statements', desc: 'Changes to signing attestations & print/download department require approval.' },
                ]
              ).map((row) => (
                <div key={row.key} className="flex items-center gap-2.5 border-t border-line py-2 first:border-t-0">
                  <Checkbox checked={makerChecker[row.key]} disabled={!isSuperAdmin} onCheckedChange={(c) => setMakerChecker((mc) => ({ ...mc, [row.key]: !!c }))} />
                  <div className="flex-1">
                    <div className="text-[13px] font-semibold">{row.label}</div>
                    <div className="text-[11px] text-slate">{row.desc}</div>
                  </div>
                  <span className={`text-[11px] font-bold ${makerChecker[row.key] ? 'text-success' : 'text-slate'}`}>{makerChecker[row.key] ? 'ON' : 'OFF'}</span>
                </div>
              ))}
            </CardContent>
          </Card>

            </>
          )}

          {activeSection === 'reminders' && isAdmin && (
            <>
              {/* Pending Signature Reminders */}
              <Card>
            <CardHeader className="flex-row items-center justify-between">
              <div>
                <CardTitle>Pending Signature Reminders</CardTitle>
                <CardDescription className="font-record uppercase">Automated email to signatories · saved independently</CardDescription>
              </div>
              {isSuperAdmin && (
                <Button size="sm" onClick={handleSaveReminder} disabled={saveReminder.isPending}>
                  {saveReminder.isPending ? 'Saving…' : 'Save'}
                </Button>
              )}
            </CardHeader>
            <CardContent>
              <p className="mb-3.5 text-[12px] leading-relaxed text-slate">
                When enabled, users receive a daily digest email listing every document currently awaiting their
                signature — but only once an item has been pending for at least 24 hours, and repeated no more often
                than the interval below. Only the signatory whose turn is active is reminded.
              </p>
              <div className="flex items-center gap-2.5 border-t border-line py-2">
                <Checkbox checked={reminderCfg.enabled} disabled={!isSuperAdmin} onCheckedChange={(c) => setReminderCfg((r) => ({ ...r, enabled: !!c }))} />
                <div className="flex-1">
                  <div className="text-[13px] font-semibold">Enable reminder emails</div>
                  <div className="text-[11px] text-slate">Master switch for the daily reminder job.</div>
                </div>
                <span className={`text-[11px] font-bold ${reminderCfg.enabled ? 'text-success' : 'text-slate'}`}>{reminderCfg.enabled ? 'ON' : 'OFF'}</span>
              </div>
              <div className="flex flex-wrap gap-5 border-t border-line pt-3">
                <div className="flex flex-col gap-1.5">
                  <Label>Daily send hour (IST)</Label>
                  <Select value={String(reminderCfg.sendHour)} onValueChange={(v) => setReminderCfg((r) => ({ ...r, sendHour: Number(v) }))} disabled={!isSuperAdmin}>
                    <SelectTrigger className="w-36">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 24 }, (_, h) => (
                        <SelectItem key={h} value={String(h)}>
                          {String(h).padStart(2, '0')}:00
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Repeat every (days)</Label>
                  <Input
                    type="number"
                    min={1}
                    max={30}
                    className="w-28"
                    value={reminderCfg.repeatEveryDays}
                    disabled={!isSuperAdmin}
                    onChange={(e) => setReminderCfg((r) => ({ ...r, repeatEveryDays: Math.max(1, Math.min(30, parseInt(e.target.value) || 1)) }))}
                  />
                </div>
              </div>
              {isSuperAdmin && (
                <div className="mt-3.5 flex items-center gap-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={runRemindersNow.isPending}
                    title="Send any due reminders now (ignores the time-of-day, respects the repeat interval)"
                    onClick={handleRunRemindersNow}
                  >
                    Send due reminders now
                  </Button>
                  {reminderMsg && <span className="text-[12px] text-ink-soft">{reminderMsg}</span>}
                </div>
              )}
            </CardContent>
          </Card>

            </>
          )}

          {activeSection === 'designations' && isAdmin && (
            <>
              {/* Designation Master */}
              <Card>
            <CardHeader className="flex-row items-center justify-between">
              <div>
                <CardTitle>Job Titles</CardTitle>
                <CardDescription className="font-record uppercase">Job titles offered when creating/editing users · saved independently</CardDescription>
              </div>
              {isSuperAdmin && (
                <Button size="sm" onClick={handleSaveDesignations} disabled={saveDesignations.isPending}>
                  {saveDesignations.isPending ? 'Saving…' : 'Save'}
                </Button>
              )}
            </CardHeader>
            <CardContent>
              <p className="mb-3 text-[12px] leading-relaxed text-slate">
                These titles appear in the Designation dropdown on the user create and edit forms. A user's designation
                is printed with their signature and captured in the signature manifest and envelope audit trail.
                Editing this list does not change titles already assigned to users.
              </p>
              {isSuperAdmin && (
                <div className="mb-3 flex gap-2">
                  <Input
                    className="max-w-[320px] flex-1"
                    placeholder="Add a designation (e.g. Head of Quality)"
                    maxLength={60}
                    value={newDesignation}
                    onChange={(e) => setNewDesignation(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addDesignation()}
                  />
                  <Button variant="ghost" size="sm" onClick={addDesignation}>
                    + Add
                  </Button>
                </div>
              )}
              {designations.length === 0 ? (
                <div className="text-[12px] text-slate">No designations defined yet.</div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {designations.map((d, i) => (
                    <span key={d} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-paper px-2.5 py-1 text-[13px]">
                      {d}
                      {isSuperAdmin && (
                        <button title="Remove" onClick={() => setDesignations((list) => list.filter((_, j) => j !== i))} className="text-slate hover:text-danger">
                          <X size={13} />
                        </button>
                      )}
                    </span>
                  ))}
                </div>
              )}
              {designationMsg && <div className="mt-2.5 text-[12px] text-ink-soft">{designationMsg}</div>}
            </CardContent>
          </Card>
        </>
      )}

      {/* Change Password — everyone */}
      {activeSection === 'password' && (
        <Card>
          <CardHeader>
            <CardTitle>Change Password</CardTitle>
            <CardDescription className="font-record uppercase">Logged in as: {user?.username?.toUpperCase()}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex max-w-[420px] flex-col gap-3.5">
              <div className="flex flex-col gap-1.5">
                <Label>Current Password</Label>
                <Input type="password" value={pwForm.currentPassword} onChange={(e) => setPwForm((f) => ({ ...f, currentPassword: e.target.value }))} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>New Password</Label>
                <Input type="password" value={pwForm.newPassword} onChange={(e) => setPwForm((f) => ({ ...f, newPassword: e.target.value }))} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Confirm New Password</Label>
                <Input type="password" value={pwForm.confirmPassword} onChange={(e) => setPwForm((f) => ({ ...f, confirmPassword: e.target.value }))} />
              </div>
              {pwMsg && (
                <div className={`rounded-md px-3 py-2 ${pwMsg.startsWith('✓') ? 'bg-success-soft' : 'bg-danger-soft'}`}>
                  <StatusMsg msg={pwMsg} />
                </div>
              )}
              <Button className="self-start" onClick={handlePasswordChange} disabled={changePassword.isPending}>
                {changePassword.isPending ? 'Changing…' : 'Change Password'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
        </>
      </div>

      <PasswordConfirmDialog
        action={pwAction}
        busy={pwBusy}
        error={pwError}
        onConfirm={runPwAction}
        onClose={() => {
          if (!pwBusy) {
            setPwAction(null);
            setPwError('');
          }
        }}
      />
    </div>
  );
}
