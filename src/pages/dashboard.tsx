import { useMemo, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { Mail, Clock, CheckCircle2, Layers, ArrowRight, ShieldCheck, PenLine, BarChart3, ClipboardList, Users, TrendingUp } from 'lucide-react';
import { useSession } from '@/features/auth/session-context';
import { useEnvelopes } from '@/features/envelopes/hooks';
import { useAudit } from '@/features/audit/hooks';
import { useDepartments } from '@/features/departments/hooks';
import { StatusBadge, statusLabel } from '@/components/status-badge';
import { CHART_PALETTE, auditEventHex } from '@/lib/theme-colors';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import type { EnvelopeSummary, AuditEntry } from '@/types/api';

const ALL_DEPT_ROLES = ['IT Admin', 'Administrator'];
const OTHER_LABELS: Record<string, string> = { ReturnedToAuthor: 'Returned', Voided: 'Cancelled' };

function formatTs(ts: string | null | undefined): string {
  if (!ts) return '';
  return (
    new Date(ts).toLocaleString('en-GB', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }) +
    ' IST'
  );
}

export function DashboardPage() {
  const { user } = useSession();
  const navigate = useNavigate();
  const seesAll = ALL_DEPT_ROLES.includes(user?.role || '');
  const isAdmin = ['IT Admin', 'Administrator'].includes(user?.role || '');

  const { data: envelopes = [], isLoading: envLoading, error: envError } = useEnvelopes();
  const { data: auditPage } = useAudit({ limit: 6 });
  const { data: departments = [] } = useDepartments();

  const [deptFilter, setDeptFilter] = useState('');
  // Snapshot once per mount, not recomputed every render — a useState lazy
  // initializer is the React-documented safe place for one-time impure
  // reads like Date.now(), unlike calling it directly in the render body.
  const [nowSnapshot] = useState(() => Date.now());

  const scopedEnvelopes = useMemo(() => {
    if (!seesAll || !deptFilter) return envelopes;
    return envelopes.filter((e) => e.ownerDepartment === deptFilter);
  }, [envelopes, deptFilter, seesAll]);
  const scopedAudit = useMemo(() => {
    const entries = auditPage?.entries || [];
    if (!seesAll || !deptFilter) return entries;
    return entries.filter((a) => (a.department || '') === deptFilter);
  }, [auditPage, deptFilter, seesAll]);

  const pendingCount = scopedEnvelopes.filter((e) => e.status === 'Sent').length;
  const completedCount = scopedEnvelopes.filter((e) => e.status === 'Completed').length;

  // total = pending + completed + other, always — "other" is everything
  // that's neither awaiting signature nor fully signed, so the tiles
  // always reconcile (this page already did this correctly in the legacy
  // app — the broken byStatus assumption was only in Signatures.jsx).
  const otherEnvelopes = scopedEnvelopes.filter((e) => e.status !== 'Sent' && e.status !== 'Completed');
  const otherCount = otherEnvelopes.length;
  const otherSub = (() => {
    const acc: Record<string, number> = {};
    otherEnvelopes.forEach((e) => {
      const s = e.status || 'Unknown';
      acc[s] = (acc[s] || 0) + 1;
    });
    const parts = Object.entries(acc).map(([s, n]) => `${OTHER_LABELS[s] || s} ${n}`);
    return parts.length ? parts.join(' · ') : 'Draft / Returned / Declined / Cancelled';
  })();

  const awaitingMe = scopedEnvelopes.filter((e) => e.status === 'Sent' && e.recipients.some((r) => r.username === user?.username && r.status === 'Sent')).length;

  // Real delta, not decorative — created-this-week vs created-prior-week,
  // both counted from the same createdAt timestamps already on hand. No
  // historical snapshot exists to compute a true "vs last period" for the
  // other tiles, so only this one gets a trend indicator; it doesn't get
  // one everywhere just for visual symmetry.
  const weekDelta = (() => {
    const now = nowSnapshot;
    const oneWeek = 7 * 24 * 60 * 60 * 1000;
    const thisWeek = scopedEnvelopes.filter((e) => e.createdAt && now - new Date(e.createdAt).getTime() < oneWeek).length;
    const priorWeek = scopedEnvelopes.filter((e) => {
      if (!e.createdAt) return false;
      const age = now - new Date(e.createdAt).getTime();
      return age >= oneWeek && age < oneWeek * 2;
    }).length;
    return { thisWeek, priorWeek };
  })();

  const envByStatus = useMemo(() => {
    const acc: Record<string, number> = {};
    scopedEnvelopes.forEach((e) => {
      const s = e.status || 'Unknown';
      acc[s] = (acc[s] || 0) + 1;
    });
    // Chart labels go through statusLabel() too, same as <StatusBadge> —
    // otherwise the pie legend would show the raw wire value ("Voided")
    // instead of the display term ("Cancelled").
    return Object.entries(acc).map(([name, value]) => ({ name: statusLabel(name), value }));
  }, [scopedEnvelopes]);

  const envByDept = useMemo(() => {
    const acc: Record<string, number> = {};
    envelopes.forEach((e) => {
      const d = e.ownerDepartment || '— Unassigned —';
      acc[d] = (acc[d] || 0) + 1;
    });
    return Object.entries(acc)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [envelopes]);

  function goSignatures(status?: string | null) {
    navigate({ to: '/app/signatures', search: status ? { status } : {} });
  }

  if (envLoading) {
    return <div className="py-16 text-center text-[13px] text-slate">Loading dashboard…</div>;
  }

  const scopeLabel = seesAll ? deptFilter || 'All departments' : user?.department || 'Your department';
  const asOf = new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

  const STATS: { key: string; icon: React.ReactNode; accent: string; accentSoft: string; value: number; label: string; sub: string; filter: string | null }[] = [
    { key: 'total', icon: <Mail size={18} />, accent: 'text-seal', accentSoft: 'bg-seal-soft', value: scopedEnvelopes.length, label: 'Total Documents', sub: 'Across all statuses', filter: null },
    { key: 'pending', icon: <Clock size={18} />, accent: 'text-warning', accentSoft: 'bg-warning-soft', value: pendingCount, label: 'Pending Signature', sub: awaitingMe ? `${awaitingMe} awaiting you` : 'Awaiting signature', filter: 'Sent' },
    { key: 'completed', icon: <CheckCircle2 size={18} />, accent: 'text-success', accentSoft: 'bg-success-soft', value: completedCount, label: 'Completed', sub: 'Fully signed', filter: 'Completed' },
    { key: 'other', icon: <Layers size={18} />, accent: 'text-violet', accentSoft: 'bg-violet-soft', value: otherCount, label: 'Other Statuses', sub: otherSub, filter: 'Other' },
  ];

  const QUICK_ACTIONS = [
    { label: 'Start e-Sign', icon: <PenLine size={16} />, to: '/app/signatures' as const },
    { label: 'Reports', icon: <BarChart3 size={16} />, to: '/app/reports' as const },
    { label: 'Audit Trail', icon: <ClipboardList size={16} />, to: '/app/audit' as const },
    ...(isAdmin ? [{ label: 'Users', icon: <Users size={16} />, to: '/app/users' as const }] : []),
  ];

  return (
    <div className="mx-auto max-w-7xl">
      {envError && (
        <div className="mb-3 rounded-md border border-danger/30 bg-danger-soft px-3 py-2.5 text-[13px] text-danger">
          Couldn't load documents: {envError instanceof Error ? envError.message : 'unknown error'}
        </div>
      )}

      {/* Compact header — the "as of" timestamp and scope label are what an
          operator actually needs to trust the numbers below, not a large
          greeting. */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
        <div>
          <div className="text-[17px] font-semibold text-ink">{scopeLabel}</div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[12px] text-slate">
            <span className="inline-block size-1.5 rounded-full bg-success" /> Live · as of {asOf} IST
          </div>
        </div>
        {seesAll && (
          <Select value={deptFilter || 'all'} onValueChange={(v) => setDeptFilter(v === 'all' ? '' : v)}>
            <SelectTrigger className="w-52">
              <SelectValue placeholder="All departments" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All departments</SelectItem>
              {departments.map((d) => (
                <SelectItem key={d.id || d.name} value={d.name}>
                  {d.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Launchpad — the actions an operator actually comes to a dashboard
          to reach, not just numbers to look at. */}
      <div className="mb-5 flex flex-wrap gap-2">
        {QUICK_ACTIONS.map((a) => (
          <Button key={a.label} variant="outline" size="sm" onClick={() => navigate({ to: a.to })}>
            {a.icon} {a.label}
          </Button>
        ))}
      </div>

      {awaitingMe > 0 && (
        <button
          onClick={() => goSignatures()}
          className="mb-5 flex w-full items-center gap-3 rounded-lg border border-warning/30 bg-warning-soft px-4 py-3 text-left transition-colors hover:bg-warning-soft/70"
        >
          <Clock size={17} className="shrink-0 text-warning" />
          <span className="text-[13.5px] text-ink-soft">
            <strong className="font-semibold text-ink">
              {awaitingMe} document{awaitingMe === 1 ? '' : 's'}
            </strong>{' '}
            awaiting your signature
          </span>
          <span className="ml-auto inline-flex shrink-0 items-center gap-1 text-[12.5px] font-semibold text-warning">
            Review now <ArrowRight size={13} />
          </span>
        </button>
      )}

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {STATS.map((s) => (
          <button
            key={s.key}
            onClick={() => goSignatures(s.filter)}
            className="group rounded-lg border border-line bg-paper-raised p-4 text-left shadow-card transition-[border-color,box-shadow,transform] duration-(--duration-base) ease-(--ease-out-quart) hover:-translate-y-0.5 hover:border-line-strong hover:shadow-card-hover active:translate-y-0"
          >
            <div className="flex items-start justify-between">
              <div className={`flex size-9 items-center justify-center rounded-md ${s.accentSoft} ${s.accent}`}>{s.icon}</div>
              {s.key === 'total' && weekDelta.priorWeek > 0 && (
                <span
                  className={`flex items-center gap-0.5 text-[11px] font-semibold ${weekDelta.thisWeek >= weekDelta.priorWeek ? 'text-success' : 'text-slate'}`}
                  title={`${weekDelta.thisWeek} created this week vs ${weekDelta.priorWeek} the week before`}
                >
                  <TrendingUp size={11} />
                  {Math.round(((weekDelta.thisWeek - weekDelta.priorWeek) / weekDelta.priorWeek) * 100)}%
                </span>
              )}
            </div>
            <div className="mt-2.5 text-[24px] leading-none font-bold tracking-tight text-ink">{s.value}</div>
            <div className="mt-1.5 text-[12.5px] font-medium text-ink-soft">{s.label}</div>
            <div className="mt-0.5 truncate text-[11.5px] text-slate">{s.sub}</div>
          </button>
        ))}
      </div>

      {/* Primary content (Recent Documents, the thing you're most likely
          here to check) + a narrower right rail for distribution/activity
          context — the standard enterprise-dashboard split, not a
          symmetric grid of equally-weighted cards. */}
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[1fr_340px]">
        <Card>
          <CardHeader className="flex-row items-center justify-between pb-3">
            <div>
              <CardTitle>Recent Documents</CardTitle>
              <CardDescription>Latest signature requests · {scopeLabel}</CardDescription>
            </div>
            <Button size="sm" onClick={() => goSignatures()}>
              Open Start e-Sign →
            </Button>
          </CardHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Sender</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {scopedEnvelopes.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-6 text-center text-slate">
                    No documents yet
                  </TableCell>
                </TableRow>
              ) : (
                scopedEnvelopes.slice(0, 8).map((env: EnvelopeSummary) => (
                  <TableRow key={env.id} className="cursor-pointer" onClick={() => goSignatures()}>
                    <TableCell className="font-medium text-ink">{env.title}</TableCell>
                    <TableCell className="font-record text-[12px] text-ink-soft">{env.createdBy}</TableCell>
                    <TableCell className="text-[12.5px] text-slate">{env.ownerDepartment || '—'}</TableCell>
                    <TableCell>
                      <StatusBadge status={env.status} />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Documents by Status</CardTitle>
              <CardDescription>Distribution · {scopeLabel}</CardDescription>
            </CardHeader>
            <div className="px-5 pb-5">
              {envByStatus.length === 0 ? (
                <div className="py-9 text-center text-[13px] text-slate">No data to display</div>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={160}>
                    <PieChart>
                      <Pie data={envByStatus} cx="50%" cy="50%" innerRadius={44} outerRadius={72} dataKey="value" paddingAngle={2}>
                        {envByStatus.map((_, i) => (
                          <Cell key={i} fill={CHART_PALETTE[i % CHART_PALETTE.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{ background: 'var(--color-paper-raised)', border: '1px solid var(--color-line)', borderRadius: 6, fontSize: 12, color: 'var(--color-ink)' }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1.5">
                    {envByStatus.map((d, i) => (
                      <div key={i} className="flex items-center gap-1.5 text-[12px]">
                        <span className="inline-block size-2 rounded-sm" style={{ background: CHART_PALETTE[i % CHART_PALETTE.length] }} />
                        <span className="text-ink-soft">{d.name}</span>
                        <span className="text-[11px] text-slate">{d.value}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle>{seesAll ? 'Department Overview' : 'Your Activity'}</CardTitle>
              <CardDescription>{seesAll ? 'Documents by owning department' : 'This scope, at a glance'}</CardDescription>
            </CardHeader>
            <div className="px-5 pb-5">
              {seesAll ? (
                envByDept.length === 0 ? (
                  <div className="py-6 text-center text-[13px] text-slate">No department data yet</div>
                ) : (
                  <div className="flex flex-col gap-2.5">
                    {envByDept.slice(0, 6).map((d, i) => {
                      const max = envByDept[0].value || 1;
                      const pct = Math.round((d.value / max) * 100);
                      return (
                        <div key={i}>
                          <div className="mb-1 flex justify-between text-[12.5px]">
                            <span className="truncate text-ink-soft">{d.name}</span>
                            <strong className="ml-2 shrink-0 text-ink">{d.value}</strong>
                          </div>
                          <div className="h-1.5 overflow-hidden rounded bg-paper">
                            <div className="h-full rounded" style={{ width: `${pct}%`, background: CHART_PALETTE[i % CHART_PALETTE.length] }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-[19px] font-bold text-seal">{scopedEnvelopes.length}</div>
                    <div className="text-[11.5px] text-slate">Total documents</div>
                  </div>
                  <div>
                    <div className="text-[19px] font-bold text-warning">{pendingCount}</div>
                    <div className="text-[11.5px] text-slate">Pending</div>
                  </div>
                  <div>
                    <div className="text-[19px] font-bold text-success">{completedCount}</div>
                    <div className="text-[11.5px] text-slate">Completed</div>
                  </div>
                  <div title={otherSub}>
                    <div className="text-[19px] font-bold text-violet">{otherCount}</div>
                    <div className="text-[11.5px] text-slate">Other statuses</div>
                  </div>
                </div>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="flex items-center gap-1.5">
                  <ShieldCheck size={15} className="text-seal" /> Recent Activity
                </CardTitle>
                <CardDescription>Last events · {scopeLabel}</CardDescription>
              </div>
              <Button variant="ghost" size="sm" onClick={() => navigate({ to: '/app/audit' })}>
                Full trail →
              </Button>
            </CardHeader>
            <div className="px-2 pb-2">
              {scopedAudit.length === 0 ? (
                <div className="py-6 text-center text-[13px] text-slate">No audit events</div>
              ) : (
                scopedAudit.slice(0, 5).map((ev: AuditEntry) => (
                  <div key={ev.id} className="flex items-start gap-2.5 px-3 py-2">
                    <span className="mt-1.5 size-2 shrink-0 rounded-full" style={{ background: auditEventHex(ev.event) }} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[12.5px] font-semibold text-ink">{ev.event}</div>
                      <div className="mt-0.5 truncate text-[11.5px] text-slate">
                        {ev.username} · {formatTs(ev.timestamp)}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}