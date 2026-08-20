import { useState, useMemo } from 'react';
import { Search, Lock, ClipboardList } from 'lucide-react';
import { useSession } from '@/features/auth/session-context';
import { useAudit, useAuditFacets } from '@/features/audit/hooks';
import { useSites } from '@/features/sites/hooks';
import { formatDateTime, clampAuditValue, AUDIT_EVENT_COLOR } from '@/features/signatures/constants';
import { FilterBar, Field, ActiveFilters, DatePresets, validateDateRange } from '@/components/filter-bar';
import { EmptyState } from '@/components/empty-state';
import { Pagination } from '@/components/pagination';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';

const PAGE_SIZE = 25;
const IMMUTABLE_TAG = (
  <span className="flex items-center gap-1">
    <Lock size={10} /> IMMUTABLE · READ-ONLY
  </span>
);

export function AuditLogTab() {
  const { user } = useSession();
  const isGlobalAdmin = ['Administrator', 'IT Admin'].includes(user?.role || '');

  const [page, setPage] = useState(1);
  // Draft inputs (what the user is editing) vs applied filters (what the
  // current results reflect) — server paging keys off `applied`.
  const [eventFilter, setEventFilter] = useState('');
  const [userFilter, setUserFilter] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [siteFilter, setSiteFilter] = useState('');
  const [applied, setApplied] = useState<Record<string, string>>({});
  const [dateError, setDateError] = useState('');

  const { data: sites = [] } = useSites();
  const { data: facets } = useAuditFacets(applied.siteId ? { siteId: applied.siteId } : {});
  const { data, isLoading, error } = useAudit({ ...applied, page, limit: PAGE_SIZE });

  const entries = data?.entries || [];
  const total = data?.total || 0;
  const pages = data?.pageSize ? Math.max(1, Math.ceil(total / data.pageSize)) : 1;

  function buildFilters(overrides: Record<string, string> = {}): Record<string, string> {
    const f: Record<string, string> = {};
    if (eventFilter) f.event = eventFilter;
    if (userFilter) f.username = userFilter;
    if (fromDate) f.from = fromDate;
    if (toDate) f.to = toDate;
    if (siteFilter) f.siteId = siteFilter;
    return { ...f, ...overrides };
  }
  function applyFilters() {
    const dErr = validateDateRange(fromDate, toDate);
    setDateError(dErr);
    if (dErr) return;
    setPage(1);
    setApplied(buildFilters());
  }
  function clearFilters() {
    setEventFilter('');
    setUserFilter('');
    setFromDate('');
    setToDate('');
    setSiteFilter('');
    setDateError('');
    setPage(1);
    setApplied({});
  }
  function applyPreset(from: string, to: string) {
    setFromDate(from);
    setToDate(to);
    setDateError('');
    setPage(1);
    setApplied(buildFilters({ from, to }));
  }

  const hasActiveFilters = !!(eventFilter || userFilter || fromDate || toDate || siteFilter);
  const allEvents = facets?.events || [];
  const allUsers = facets?.usernames || [];
  const siteCode = useMemo(() => sites.find((s) => s.id === siteFilter)?.code, [sites, siteFilter]);

  return (
    <>
      <FilterBar
        title={
          <span className="flex items-center gap-1.5">
            <Search size={16} /> Filter
          </span>
        }
        tag={IMMUTABLE_TAG}
        actions={
          <>
            <Button size="sm" onClick={applyFilters}>
              Apply
            </Button>
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              Clear
            </Button>
          </>
        }
      >
        {isGlobalAdmin && (
          <Field label="Site">
            <Select value={siteFilter || 'all'} onValueChange={(v) => setSiteFilter(v === 'all' ? '' : v)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="All Sites" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sites</SelectItem>
                {sites.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name} ({s.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}
        <Field label="From Date">
          <input
            type="date"
            className="flex h-9 w-full rounded-md border border-line-strong bg-paper-raised px-3 py-1 text-sm text-ink outline-none focus-visible:border-seal focus-visible:ring-2 focus-visible:ring-seal-ring"
            value={fromDate}
            max={toDate || undefined}
            onChange={(e) => {
              setFromDate(e.target.value);
              setDateError('');
            }}
          />
        </Field>
        <Field label="To Date">
          <input
            type="date"
            className="flex h-9 w-full rounded-md border border-line-strong bg-paper-raised px-3 py-1 text-sm text-ink outline-none focus-visible:border-seal focus-visible:ring-2 focus-visible:ring-seal-ring"
            value={toDate}
            min={fromDate || undefined}
            onChange={(e) => {
              setToDate(e.target.value);
              setDateError('');
            }}
          />
        </Field>
        <Field label="Event Type">
          <Select value={eventFilter || 'all'} onValueChange={(v) => setEventFilter(v === 'all' ? '' : v)}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="All Events" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Events</SelectItem>
              {allEvents.map((ev) => (
                <SelectItem key={ev} value={ev}>
                  {ev}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        {isGlobalAdmin && (
          <Field label="User">
            <Select value={userFilter || 'all'} onValueChange={(v) => setUserFilter(v === 'all' ? '' : v)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="All Users" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Users</SelectItem>
                {allUsers.map((u) => (
                  <SelectItem key={u} value={u}>
                    {u}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}
      </FilterBar>

      <div className="my-4 flex flex-col gap-2.5">
        {dateError && <div className="text-[12px] text-danger">{dateError}</div>}
        <div className="flex flex-wrap items-center gap-3">
          <DatePresets onApply={applyPreset} />
          {hasActiveFilters && (
            <ActiveFilters filters={{ Site: siteCode, From: fromDate, To: toDate, Event: eventFilter, User: userFilter }} onClear={clearFilters} />
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-danger/30 bg-danger-soft px-3 py-2.5 text-[12px] text-danger">
          <strong>Cannot load audit trail:</strong> {error instanceof Error ? error.message : 'unknown error'}
        </div>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-1.5">
            <ClipboardList size={16} className="text-seal" /> Audit Trail
          </CardTitle>
          <CardDescription className="font-record uppercase">
            {isLoading ? 'Loading…' : `${total} event${total === 1 ? '' : 's'}${hasActiveFilters ? ' (filtered)' : ''}`}
          </CardDescription>
        </CardHeader>
        {isLoading ? (
          <div className="py-8 text-center text-[13px] text-slate">Loading…</div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Event</TableHead>
                  <TableHead>Record</TableHead>
                  <TableHead>Old Value</TableHead>
                  <TableHead>New Value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.length === 0 ? (
                  <EmptyState
                    colSpan={6}
                    icon={<ClipboardList size={26} />}
                    title={hasActiveFilters ? 'No events match your filters' : 'No audit events yet'}
                    hint={hasActiveFilters ? 'Try widening the date range or clearing filters.' : 'System and user actions will be recorded here.'}
                    onClear={hasActiveFilters ? clearFilters : undefined}
                  />
                ) : (
                  entries.map((ev) => (
                    <TableRow key={ev.id}>
                      <TableCell className="font-record text-[11px] whitespace-nowrap text-ink-soft">{formatDateTime(ev.timestamp)}</TableCell>
                      <TableCell className="font-record text-[12px] text-seal">{ev.username}</TableCell>
                      <TableCell>
                        <span
                          className="font-record rounded bg-paper px-1.5 py-0.5 text-[10px] font-semibold"
                          style={{ color: AUDIT_EVENT_COLOR[ev.event] || 'var(--color-ink-soft)' }}
                        >
                          {ev.event}
                        </span>
                      </TableCell>
                      <TableCell className="max-w-[200px] text-[12px] break-words whitespace-normal">{ev.record}</TableCell>
                      <TableCell className="max-w-[260px] text-[11px] break-words whitespace-normal text-ink-soft">{clampAuditValue(ev.oldValue)}</TableCell>
                      <TableCell className="max-w-[320px] text-[11px] break-words whitespace-normal">{clampAuditValue(ev.newValue)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}
        {!isLoading && total > PAGE_SIZE && (
          <div className="px-5 pb-4">
            <Pagination
              page={page}
              pageCount={pages}
              total={total}
              pageSize={PAGE_SIZE}
              rangeStart={total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1}
              rangeEnd={Math.min(page * PAGE_SIZE, total)}
              setPage={setPage}
              next={() => setPage((p) => Math.min(p + 1, pages))}
              prev={() => setPage((p) => Math.max(p - 1, 1))}
              label="events"
            />
          </div>
        )}
      </Card>
    </>
  );
}
