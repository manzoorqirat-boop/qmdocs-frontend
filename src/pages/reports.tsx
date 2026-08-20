import { useState, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell, LineChart, Line, Legend } from 'recharts';
import { Download, Clock, RotateCcw, X } from 'lucide-react';
import { useSession } from '@/features/auth/session-context';
import { useEnvelopes } from '@/features/envelopes/hooks';
import { useAllUsers } from '@/features/users/hooks';
import { useSites } from '@/features/sites/hooks';
import { exportWorkbook } from '@/lib/excel-export';
import { toast } from '@/lib/toast';
import { envelopeStatusHex, CHART_PALETTE } from '@/lib/theme-colors';
import { statusLabel } from '@/components/status-badge';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import type { EnvelopeSummary } from '@/types/api';

const TOOLTIP_STYLE = {
  contentStyle: { background: 'var(--color-paper-raised)', border: '1px solid var(--color-line)', borderRadius: 8, fontSize: 12 },
  labelStyle: { color: 'var(--color-ink)', fontWeight: 600 },
};

function fmtDate(d: string | null | undefined): string {
  if (!d) return '';
  const x = new Date(d);
  return Number.isNaN(x.getTime()) ? '' : x.toISOString().slice(0, 10);
}
function hoursBetween(a: string | null | undefined, b: string | null | undefined): number | null {
  if (!a || !b) return null;
  const ms = new Date(b).getTime() - new Date(a).getTime();
  return ms >= 0 ? ms / 3600000 : null;
}
// Turnaround in HOURS: fast approvals were collapsing to "0.1d"/"0d" and
// losing all meaning. Measured in hours, formatted adaptively — minutes
// under an hour, hours under 2 days, days beyond.
function fmtDuration(hours: number | null | undefined): string {
  if (hours == null) return '—';
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))}m`;
  if (hours < 48) return `${Math.round(hours * 10) / 10}h`;
  return `${Math.round((hours / 24) * 10) / 10}d`;
}
// documents/revisionHistory aren't sent by the list endpoint (same gap
// noted in pages/signatures.tsx and MIGRATION_STATUS.md) — read safely so
// these read as "no data" rather than a fabricated fix.
function documentsOf(e: EnvelopeSummary): { documentNumber?: string }[] {
  return (e as unknown as { documents?: { documentNumber?: string }[] }).documents || [];
}
function revisionCountOf(e: EnvelopeSummary): number {
  return (e as unknown as { revisionHistory?: unknown[] }).revisionHistory?.length || 0;
}
// activatedAt is tracked on the backend domain entity but never projected
// into the API response (checked directly — see MIGRATION_STATUS.md) — so
// this is always undefined today. Bottleneck Analysis will correctly show
// "no data" until that's fixed server-side; not faked here.
function activatedAtOf(r: EnvelopeSummary['recipients'][number]): string | undefined {
  return (r as unknown as { activatedAt?: string }).activatedAt;
}

type DrillKey = 'total' | 'completed' | 'pending' | 'returned' | 'declined' | 'draft' | 'voided';
const DRILL: Record<DrillKey, { label: string; test: (e: EnvelopeSummary) => boolean }> = {
  total: { label: 'All Documents', test: () => true },
  completed: { label: 'Completed', test: (e) => e.status === 'Completed' },
  pending: { label: 'Pending Signature', test: (e) => e.status === 'Sent' },
  returned: { label: 'Returned to Author', test: (e) => e.status === 'ReturnedToAuthor' },
  declined: { label: 'Declined', test: (e) => e.status === 'Declined' },
  draft: { label: 'Draft', test: (e) => e.status === 'Draft' },
  voided: { label: 'Cancelled / Other', test: (e) => !['Completed', 'Sent', 'ReturnedToAuthor', 'Declined', 'Draft'].includes(e.status) },
};

function KpiTile({
  label,
  value,
  color,
  sub,
  icon,
  onClick,
  active,
}: {
  label: string;
  value: string | number;
  color: string;
  sub?: string;
  icon?: React.ReactNode;
  onClick?: () => void;
  active?: boolean;
}) {
  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      title={onClick ? 'Click to view the document list' : undefined}
      className={cn('rounded-xl border border-line bg-paper-raised p-3.5', onClick && 'cursor-pointer', active && 'ring-2 ring-offset-0')}
      style={active ? { borderColor: color, boxShadow: `inset 0 0 0 1.5px ${color}` } : undefined}
    >
      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate uppercase">
        {icon} {label}
      </div>
      <div className="mt-1 text-2xl font-semibold" style={{ color }}>
        {value}
      </div>
      {sub && <div className="mt-0.5 text-[11px] text-slate">{sub}</div>}
    </div>
  );
}

export function ReportsPage() {
  const { user } = useSession();
  const isGlobalAdmin = ['Administrator', 'IT Admin'].includes(user?.role || '');

  const [siteFilter, setSiteFilter] = useState('');
  const { data: sites = [] } = useSites();
  const { data: envelopes = [], isLoading, error } = useEnvelopes();
  const { data: users = [] } = useAllUsers();

  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [sortKey, setSortKey] = useState<string>('createdAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [statusFilter, setStatusFilter] = useState('');
  const [drillStatus, setDrillStatus] = useState<DrillKey | null>(null);

  const siteScoped = useMemo(() => (siteFilter ? envelopes.filter((e) => e.ownerSiteId === siteFilter) : envelopes), [envelopes, siteFilter]);

  const filtered = useMemo(() => {
    return siteScoped.filter((e) => {
      const c = e.createdAt ? new Date(e.createdAt) : null;
      if (!c) return true;
      if (fromDate && c < new Date(fromDate)) return false;
      if (toDate) {
        const t = new Date(toDate);
        t.setHours(23, 59, 59, 999);
        if (c > t) return false;
      }
      return true;
    });
  }, [siteScoped, fromDate, toDate]);

  const kpis = useMemo(() => {
    const total = filtered.length;
    const completed = filtered.filter((e) => e.status === 'Completed').length;
    const declined = filtered.filter((e) => e.status === 'Declined').length;
    const pending = filtered.filter((e) => e.status === 'Sent').length;
    const returned = filtered.filter((e) => e.status === 'ReturnedToAuthor').length;
    const draft = filtered.filter((e) => e.status === 'Draft').length;
    const voided = filtered.filter((e) => e.status === 'Voided').length;
    const other = total - completed - declined - pending - returned - draft - voided;
    const completionRate = total ? Math.round((completed / total) * 100) : 0;

    const turnarounds = filtered.filter((e) => e.status === 'Completed' && e.completedAt).map((e) => hoursBetween(e.createdAt, e.completedAt)).filter((v): v is number => v != null);
    const avgTurnaroundHours = turnarounds.length ? turnarounds.reduce((a, b) => a + b, 0) / turnarounds.length : null;

    const pushedBack = filtered.filter((e) => (e.round || 1) > 1 || revisionCountOf(e) > 0).length;
    const pushbackRate = total ? Math.round((pushedBack / total) * 100) : 0;
    const totalRevisions = filtered.reduce((a, e) => a + revisionCountOf(e), 0);
    const activeUsers = users.filter((u) => u.status === 'Active').length;

    return { total, completed, declined, pending, returned, draft, voided, other, completionRate, avgTurnaroundHours, pushedBack, pushbackRate, totalRevisions, activeUsers };
  }, [filtered, users]);

  const envByStatus = useMemo(() => {
    const acc: Record<string, number> = {};
    filtered.forEach((e) => {
      const s = e.status || 'Unknown';
      acc[s] = (acc[s] || 0) + 1;
    });
    // `status` keeps the raw wire value (needed for envelopeStatusHex's
    // color lookup); `name` is the display label shown in the chart —
    // separate fields so relabeling ("Voided" -> "Cancelled") never
    // breaks the color mapping, which is keyed by the raw value.
    return Object.entries(acc).map(([status, value]) => ({ name: statusLabel(status), status, value }));
  }, [filtered]);

  const envBySender = useMemo(() => {
    const acc: Record<string, number> = {};
    filtered.forEach((e) => {
      const s = e.createdBy || 'Unknown';
      acc[s] = (acc[s] || 0) + 1;
    });
    return Object.entries(acc).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, value]) => ({ name, value }));
  }, [filtered]);

  const monthlyTrend = useMemo(() => {
    const m: Record<string, { month: string; created: number; completed: number }> = {};
    const key = (d: string | null | undefined) => (d ? new Date(d).toISOString().slice(0, 7) : null);
    filtered.forEach((e) => {
      const ck = key(e.createdAt);
      if (ck) {
        m[ck] = m[ck] || { month: ck, created: 0, completed: 0 };
        m[ck].created++;
      }
      if (e.status === 'Completed' && e.completedAt) {
        const xk = key(e.completedAt);
        if (xk) {
          m[xk] = m[xk] || { month: xk, created: 0, completed: 0 };
          m[xk].completed++;
        }
      }
    });
    return Object.values(m).sort((a, b) => a.month.localeCompare(b.month));
  }, [filtered]);

  // Bottleneck: median time a document sits at each step (activatedAt →
  // actionAt). Currently always empty — see activatedAtOf() note above.
  const bottleneck = useMemo(() => {
    const groups: Record<string, { durations: number[]; pending: number }> = {};
    for (const e of filtered) {
      for (const r of e.recipients || []) {
        const label = r.stepLabel || r.role || 'Signer';
        if (!groups[label]) groups[label] = { durations: [], pending: 0 };
        const acted = ['Signed', 'Approved'].includes(r.status);
        const activatedAt = activatedAtOf(r);
        if (acted && activatedAt && r.actionAt) {
          const h = (new Date(r.actionAt).getTime() - new Date(activatedAt).getTime()) / 3600000;
          if (h >= 0) groups[label].durations.push(h);
        } else if (r.status === 'Sent') {
          groups[label].pending++;
        }
      }
    }
    const median = (arr: number[]) => {
      if (!arr.length) return null;
      const s = [...arr].sort((a, b) => a - b);
      const mid = Math.floor(s.length / 2);
      return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
    };
    const rows = Object.entries(groups)
      .map(([label, g]) => ({
        label,
        samples: g.durations.length,
        pending: g.pending,
        medianHours: median(g.durations),
        avgHours: g.durations.length ? g.durations.reduce((a, b) => a + b, 0) / g.durations.length : null,
      }))
      .sort((a, b) => (b.medianHours ?? -1) - (a.medianHours ?? -1));
    return { rows, hasData: rows.some((r) => r.samples > 0) };
  }, [filtered]);

  const register = useMemo(() => {
    let rows = filtered.map((e) => {
      const recips = e.recipients || [];
      const reviewers = recips.filter((r) => r.stepLabel === 'Reviewer');
      const approver = recips.find((r) => r.stepLabel === 'Approver');
      return {
        id: e.id,
        title: e.title || '(untitled)',
        documentNumber: documentsOf(e).map((d) => d.documentNumber).filter(Boolean).join(', '),
        status: e.status || 'Unknown',
        createdBy: e.createdBy || '',
        createdAt: e.createdAt || '',
        completedAt: e.completedAt || '',
        round: e.round || 1,
        revisions: revisionCountOf(e),
        reviewers: reviewers.length,
        approver: approver ? approver.username : '',
        turnaroundHours: e.status === 'Completed' ? hoursBetween(e.createdAt, e.completedAt) : null,
        signatories: recips.map((r) => `${r.username}(${r.stepLabel}:${r.status})`).join('; '),
      };
    });
    if (statusFilter) rows = rows.filter((r) => r.status === statusFilter);
    rows.sort((a, b) => {
      const av = (a as unknown as Record<string, string | number | null>)[sortKey] ?? '';
      const bv = (b as unknown as Record<string, string | number | null>)[sortKey] ?? '';
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return rows;
  }, [filtered, statusFilter, sortKey, sortDir]);

  function toggleSort(key: string) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir('desc');
    }
  }
  function quickRange(days: number) {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - days);
    setFromDate(from.toISOString().slice(0, 10));
    setToDate(to.toISOString().slice(0, 10));
  }

  async function handleExport() {
    const rangeLabel = `${fromDate || 'beginning'} to ${toDate || 'today'}`;
    const summaryAoa: (string | number)[][] = [
      ['QMDocs — Reports Export'],
      ['Generated', new Date().toISOString()],
      ['Date range', rangeLabel],
      ['Site', siteFilter ? sites.find((s) => s.id === siteFilter)?.name || siteFilter : 'All sites'],
      [],
      ['Metric', 'Value'],
      ['Total Documents', kpis.total],
      ['Completed', kpis.completed],
      ['Pending Signature', kpis.pending],
      ['Returned to Author', kpis.returned],
      ['Declined', kpis.declined],
      ['Draft', kpis.draft],
      ['Cancelled', kpis.voided + kpis.other],
      ['Completion Rate (%)', kpis.completionRate],
      ['Avg Turnaround (hours)', kpis.avgTurnaroundHours == null ? 'N/A' : Math.round(kpis.avgTurnaroundHours * 10) / 10],
      ['Avg Turnaround (days)', kpis.avgTurnaroundHours == null ? 'N/A' : Math.round((kpis.avgTurnaroundHours / 24) * 10) / 10],
      ['Documents Returned', kpis.pushedBack],
      ['Return Rate (%)', kpis.pushbackRate],
      ['Total Revisions', kpis.totalRevisions],
      ['Active Users', kpis.activeUsers],
    ];
    const registerRows = register.map((r) => ({
      Title: r.title,
      'Document Number': r.documentNumber || '',
      Status: r.status,
      'Created By': r.createdBy,
      'Created At': fmtDate(r.createdAt),
      'Completed At': fmtDate(r.completedAt),
      'Turnaround (hours)': r.turnaroundHours == null ? '' : Math.round(r.turnaroundHours * 10) / 10,
      Round: r.round,
      Revisions: r.revisions,
      Reviewers: r.reviewers,
      Approver: r.approver,
      'Signatories (status)': r.signatories,
    }));
    try {
      const stamp = new Date().toISOString().slice(0, 10);
      await exportWorkbook(
        [
          { name: 'Summary', aoa: summaryAoa, columnWidths: [26, 40] },
          { name: 'Document Register', rows: registerRows, columnWidths: [28, 18, 16, 14, 12, 12, 16, 7, 9, 10, 14, 50] },
        ],
        `QMDocs-Report-${stamp}.xlsx`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Export failed.');
    }
  }

  const drillList = drillStatus ? filtered.filter(DRILL[drillStatus].test) : [];

  if (isLoading) return <div className="py-16 text-center text-[13px] text-slate">Loading reports…</div>;

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-5 flex flex-wrap items-end gap-2.5">
        <div className="flex flex-col gap-1">
          <Label className="text-[11px]">From</Label>
          <input type="date" className="flex h-9 rounded-md border border-line-strong bg-paper-raised px-3 text-sm text-ink outline-none focus-visible:border-seal focus-visible:ring-2 focus-visible:ring-seal-ring" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-[11px]">To</Label>
          <input type="date" className="flex h-9 rounded-md border border-line-strong bg-paper-raised px-3 text-sm text-ink outline-none focus-visible:border-seal focus-visible:ring-2 focus-visible:ring-seal-ring" value={toDate} onChange={(e) => setToDate(e.target.value)} />
        </div>
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" onClick={() => quickRange(30)}>30d</Button>
          <Button variant="ghost" size="sm" onClick={() => quickRange(90)}>90d</Button>
          <Button variant="ghost" size="sm" onClick={() => quickRange(365)}>1y</Button>
          <Button variant="ghost" size="sm" onClick={() => { setFromDate(''); setToDate(''); }}>All</Button>
        </div>
        <div className="flex-1" />
        {isGlobalAdmin && sites.length > 0 && (
          <div className="flex flex-col gap-1">
            <Label className="text-[11px]">Site</Label>
            <Select value={siteFilter || 'all'} onValueChange={(v) => setSiteFilter(v === 'all' ? '' : v)}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="All sites" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sites</SelectItem>
                {sites.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name} ({s.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <Button onClick={handleExport}>
          <Download size={15} /> Export Excel
        </Button>
      </div>

      {error && (
        <div className="mb-3.5 rounded-md border border-danger/30 bg-danger-soft px-3 py-2.5 text-[13px] text-danger">
          {error instanceof Error ? error.message : 'Failed to load envelopes'}
        </div>
      )}

      <Tabs defaultValue="overview">
        <TabsList className="mb-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="trends">Trends</TabsTrigger>
          <TabsTrigger value="bottlenecks">Bottlenecks</TabsTrigger>
          <TabsTrigger value="register">Register</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <KpiTile label="Total Documents" value={kpis.total} color="var(--color-seal)" sub="Sum of all status cards" onClick={() => setDrillStatus(drillStatus === 'total' ? null : 'total')} active={drillStatus === 'total'} />
        <KpiTile label="Completed" value={kpis.completed} color="var(--color-success)" sub={`${kpis.completionRate}% completion`} onClick={() => setDrillStatus(drillStatus === 'completed' ? null : 'completed')} active={drillStatus === 'completed'} />
        <KpiTile label="Pending Signature" value={kpis.pending} color="var(--color-warning)" onClick={() => setDrillStatus(drillStatus === 'pending' ? null : 'pending')} active={drillStatus === 'pending'} />
        <KpiTile label="Returned to Author" value={kpis.returned} color="var(--color-violet)" onClick={() => setDrillStatus(drillStatus === 'returned' ? null : 'returned')} active={drillStatus === 'returned'} />
        <KpiTile label="Declined" value={kpis.declined} color="var(--color-danger)" onClick={() => setDrillStatus(drillStatus === 'declined' ? null : 'declined')} active={drillStatus === 'declined'} />
        <KpiTile label="Draft" value={kpis.draft} color="var(--color-slate)" sub="Not yet sent" onClick={() => setDrillStatus(drillStatus === 'draft' ? null : 'draft')} active={drillStatus === 'draft'} />
        <KpiTile label="Cancelled" value={kpis.voided + kpis.other} color="var(--color-slate)" sub={kpis.other > 0 ? 'Includes other statuses' : 'Cancelled documents'} onClick={() => setDrillStatus(drillStatus === 'voided' ? null : 'voided')} active={drillStatus === 'voided'} />
        <KpiTile label="Avg Turnaround" value={fmtDuration(kpis.avgTurnaroundHours)} color="var(--color-seal)" icon={<Clock size={13} />} sub="created → completed" />
        <KpiTile label="Return Rate" value={`${kpis.pushbackRate}%`} color="var(--color-warning)" icon={<RotateCcw size={13} />} sub={`${kpis.pushedBack} documents`} />
        <KpiTile label="Total Revisions" value={kpis.totalRevisions} color="var(--color-violet)" />
      </div>

      {drillStatus && (
        <Card className="mb-4">
          <CardHeader className="flex-row items-center justify-between pb-3">
            <CardTitle>
              {DRILL[drillStatus].label} — {drillList.length} document{drillList.length === 1 ? '' : 's'}
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={() => setDrillStatus(null)}>
              <X size={13} /> Close
            </Button>
          </CardHeader>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Document No.</TableHead>
                  <TableHead>Created By</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {drillList.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-4 text-slate">
                      No documents in this section for the selected date range.
                    </TableCell>
                  </TableRow>
                ) : (
                  drillList.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="max-w-[240px] truncate font-semibold text-ink" title={e.title}>
                        {e.title}
                      </TableCell>
                      <TableCell className="text-[12px]">{documentsOf(e).map((d) => d.documentNumber).filter(Boolean).join(', ') || '—'}</TableCell>
                      <TableCell>{e.createdBy}</TableCell>
                      <TableCell>{e.ownerDepartment || '—'}</TableCell>
                      <TableCell className="text-[12px] whitespace-nowrap">{e.createdAt ? new Date(e.createdAt).toLocaleDateString() : '—'}</TableCell>
                      <TableCell>{statusLabel(e.status)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

        </TabsContent>

        <TabsContent value="trends">
      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Document Trend</CardTitle>
            <CardDescription className="font-record uppercase">Created vs completed · monthly</CardDescription>
          </CardHeader>
          <div className="px-5 pb-5">
            {monthlyTrend.length === 0 ? (
              <div className="py-8 text-center text-[13px] text-slate">No data in range</div>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={monthlyTrend} margin={{ left: 0, right: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line)" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip {...TOOLTIP_STYLE} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line type="monotone" dataKey="created" stroke="var(--color-seal)" strokeWidth={2} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="completed" stroke="var(--color-success)" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Documents by Status</CardTitle>
            <CardDescription>Distribution</CardDescription>
          </CardHeader>
          <div className="px-5 pb-5">
            {envByStatus.length === 0 ? (
              <div className="py-8 text-center text-[13px] text-slate">No envelopes to chart</div>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie data={envByStatus} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={(e) => `${e.name}: ${e.value}`} labelLine={false} style={{ fontSize: 11 }}>
                    {envByStatus.map((s, i) => (
                      <Cell key={i} fill={envelopeStatusHex(s.status)} />
                    ))}
                  </Pie>
                  <Tooltip {...TOOLTIP_STYLE} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
      </div>

      <Card className="mb-4">
        <CardHeader className="pb-3">
          <CardTitle>Most Active Senders</CardTitle>
          <CardDescription className="font-record uppercase">Documents created · top 8</CardDescription>
        </CardHeader>
        <div className="px-5 pb-5">
          {envBySender.length === 0 ? (
            <div className="py-8 text-center text-[13px] text-slate">No senders to chart</div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={envBySender}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line)" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip {...TOOLTIP_STYLE} />
                <Bar dataKey="value" fill={CHART_PALETTE[1]} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>
        </TabsContent>

        <TabsContent value="bottlenecks">
      <Card className="mb-4">
        <CardHeader className="pb-3">
          <CardTitle>Bottleneck Analysis</CardTitle>
          <CardDescription className="font-record uppercase">Median time a document waits at each step · slowest first</CardDescription>
        </CardHeader>
        <div className="px-5 pb-5">
          {!bottleneck.hasData ? (
            <div className="py-8 text-center text-[13px] text-slate">
              No completed steps with timing data in this range yet. Per-step timing is captured going forward as documents are signed.
            </div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={bottleneck.rows.filter((r) => r.medianHours != null)} margin={{ left: 0, right: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line)" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} label={{ value: 'Hours (median)', angle: -90, position: 'insideLeft', style: { fontSize: 11, fill: 'var(--color-slate)' } }} />
                  <Tooltip {...TOOLTIP_STYLE} formatter={(v: unknown) => [`${Math.round(Number(v) * 10) / 10} h`, 'Median']} />
                  <Bar dataKey="medianHours" fill="var(--color-violet)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
              <div className="mt-3.5 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Step / Role</TableHead>
                      <TableHead>Median</TableHead>
                      <TableHead>Average</TableHead>
                      <TableHead>Signed (sample)</TableHead>
                      <TableHead>Currently pending</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bottleneck.rows.map((r) => (
                      <TableRow key={r.label}>
                        <TableCell className="font-semibold">{r.label}</TableCell>
                        <TableCell>{fmtDuration(r.medianHours)}</TableCell>
                        <TableCell>{fmtDuration(r.avgHours)}</TableCell>
                        <TableCell>{r.samples}</TableCell>
                        <TableCell className={r.pending > 0 ? 'font-bold text-warning' : 'text-slate'}>{r.pending}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <p className="mt-2.5 text-[11px] leading-relaxed text-slate">
                Median is the typical wait (robust to a single stalled document); average is pulled up by outliers. "Signed
                (sample)" is how many completed steps the timing is based on. "Currently pending" counts steps awaiting
                action right now.
              </p>
            </>
          )}
        </div>
      </Card>
        </TabsContent>

        <TabsContent value="register">
      <Card>
        <CardHeader className="flex-row items-center justify-between pb-3">
          <div>
            <CardTitle>Document Register</CardTitle>
            <CardDescription className="font-record uppercase">{register.length} envelopes · click a column to sort</CardDescription>
          </div>
          <Select value={statusFilter || 'all'} onValueChange={(v) => setStatusFilter(v === 'all' ? '' : v)}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {(['Draft', 'Sent', 'Completed', 'Declined', 'Voided', 'ReturnedToAuthor'] as const).map((s) => (
                <SelectItem key={s} value={s}>
                  {statusLabel(s)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardHeader>
        <div className="overflow-x-auto">
          {register.length === 0 ? (
            <div className="py-8 text-center text-[13px] text-slate">No envelopes in range</div>
          ) : (
            <Table className="min-w-[900px]">
              <TableHeader>
                <TableRow>
                  {(
                    [
                      ['title', 'Title'],
                      ['documentNumber', 'Doc No.'],
                      ['status', 'Status'],
                      ['createdBy', 'Created By'],
                      ['createdAt', 'Created'],
                      ['completedAt', 'Completed'],
                      ['turnaroundHours', 'Turnaround'],
                      ['round', 'Round'],
                      ['revisions', 'Rev'],
                    ] as const
                  ).map(([k, lbl]) => (
                    <TableHead key={k} onClick={() => toggleSort(k)} className="cursor-pointer whitespace-nowrap">
                      {lbl}
                      {sortKey === k ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {register.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="max-w-[220px] truncate">{r.title}</TableCell>
                    <TableCell>{r.documentNumber || '—'}</TableCell>
                    <TableCell>
                      <span className="font-semibold" style={{ color: envelopeStatusHex(r.status) }}>
                        {statusLabel(r.status)}
                      </span>
                    </TableCell>
                    <TableCell>{r.createdBy}</TableCell>
                    <TableCell className="whitespace-nowrap">{fmtDate(r.createdAt)}</TableCell>
                    <TableCell className="whitespace-nowrap">{fmtDate(r.completedAt) || '—'}</TableCell>
                    <TableCell>{fmtDuration(r.turnaroundHours)}</TableCell>
                    <TableCell>{r.round}</TableCell>
                    <TableCell>{r.revisions}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
