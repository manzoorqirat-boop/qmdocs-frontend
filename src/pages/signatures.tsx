import { useSearch } from '@tanstack/react-router';
import { useState, useMemo } from 'react';
import { PenLine } from 'lucide-react';
import { useSession } from '@/features/auth/session-context';
import { useEnvelopes, useEnvelopeCounts, usePendingEnvelopes } from '@/features/envelopes/hooks';
import { useAllUsers } from '@/features/users/hooks';
import { useSites } from '@/features/sites/hooks';
import { useDepartments } from '@/features/departments/hooks';
import { useMasterDataHydration } from '@/features/settings/hooks';
import { useDebounce } from '@/hooks/use-debounce';
import { formatDate } from '@/features/signatures/constants';
import { StatusBadge, statusLabel } from '@/components/status-badge';
import { EmptyState } from '@/components/empty-state';
import { ActiveFilters } from '@/components/filter-bar';
import { Pagination, usePagination } from '@/components/pagination';
import { Card, CardHeader, CardTitle, CardDescription, CardAction, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { CreateEnvelopeWizard } from '@/features/signatures/create-envelope-wizard';
import { ViewEnvelopeModal } from '@/features/signatures/view-envelope-modal';
import { SignEnvelopeModal } from '@/features/signatures/sign-envelope-modal';
import { VoidModal } from '@/features/signatures/void-modal';
import { DelegateModal } from '@/features/signatures/delegate-modal';
import { ResendEnvelopeModal } from '@/features/signatures/resend-envelope-modal';
import { cn } from '@/lib/utils';
import type { EnvelopeSummary } from '@/types/api';

type StatusFilter = '' | 'Other' | 'Draft' | 'Sent' | 'ReturnedToAuthor' | 'Completed' | 'Declined' | 'Voided';
type SearchField = 'all' | 'title' | 'docno' | 'sender' | 'recipient';

const FIELD_LABEL: Record<SearchField, string> = { all: 'Search', title: 'Title', docno: 'Document No', sender: 'Sender', recipient: 'Recipient' };
const STATUS_OPTIONS: StatusFilter[] = ['Draft', 'Sent', 'ReturnedToAuthor', 'Completed', 'Declined', 'Voided'];

// docNumbers/doc & recipient counts read `env.documents`, which the list
// endpoint doesn't send (see MIGRATION_STATUS.md — Summarise vs Detail).
// This isn't a frontend bug to paper over with invented data: it's a
// backend response gap. Kept honest here (renders "—" / "0 doc(s)", same
// as the current shipped behavior) with the real fix noted for the backend
// (add a cheap documentNumbers/documentCount projection to Summarise).
function docNumbersOf(env: EnvelopeSummary): string {
  return ((env as unknown as { documents?: { documentNumber?: string }[] }).documents || [])
    .map((d) => d.documentNumber)
    .filter(Boolean)
    .join(', ');
}
function docCountOf(env: EnvelopeSummary): number {
  return (env as unknown as { documents?: unknown[] }).documents?.length || 0;
}

export function SignaturesPage() {
  const { user } = useSession();
  useMasterDataHydration();

  const { data: envelopes = [], isLoading, error } = useEnvelopes();
  const { data: counts } = useEnvelopeCounts();
  const { data: pending } = usePendingEnvelopes(user?.username);
  const { data: users = [] } = useAllUsers();
  const { data: departments = [] } = useDepartments();
  const { data: sites = [] } = useSites();

  const myPending = pending?.length || 0;

  const [searchField, setSearchField] = useState<SearchField>('all');
  const [envSearch, setEnvSearch] = useState('');
  const search = useSearch({ strict: false }) as { status?: string };
  const [envStatus, setEnvStatus] = useState<StatusFilter>((search.status as StatusFilter) || '');
  // Re-apply when a NEW deep-link arrives (e.g. clicking a different
  // Dashboard tile while already on this page) — during render, not an
  // effect, same pattern as everywhere else in this migration.
  const [prevLinkedStatus, setPrevLinkedStatus] = useState(search.status);
  if (search.status !== prevLinkedStatus) {
    setPrevLinkedStatus(search.status);
    setEnvStatus((search.status as StatusFilter) || '');
  }
  const debouncedSearch = useDebounce(envSearch, 200);

  const [showCreate, setShowCreate] = useState(false);
  const [viewEnv, setViewEnv] = useState<EnvelopeSummary | null>(null);
  const [signEnv, setSignEnv] = useState<EnvelopeSummary | null>(null);
  const [voidEnv, setVoidEnv] = useState<EnvelopeSummary | null>(null);
  const [delegateEnv, setDelegateEnv] = useState<EnvelopeSummary | null>(null);
  const [resendEnv, setResendEnv] = useState<EnvelopeSummary | null>(null);

  // Real counts computation — the backend's ?counts=1 response is flat
  // ({ total, sent, completed, declined, voided, returnedToAuthor,
  // awaitingMe }), not the nested `byStatus` map the legacy app assumed.
  // "Other" = everything that isn't Sent/Completed; Draft has no dedicated
  // field, so it's the residual after subtracting every named bucket from
  // total (robust to any future status the backend adds too).
  const pendingCount = counts?.sent || 0;
  const completedCount = counts?.completed || 0;
  const draftCount = counts ? Math.max(0, counts.total - counts.sent - counts.completed - counts.declined - counts.voided - counts.returnedToAuthor) : 0;
  const otherCount = draftCount + (counts?.declined || 0) + (counts?.voided || 0) + (counts?.returnedToAuthor || 0);
  const otherParts = [
    draftCount > 0 && `Draft ${draftCount}`,
    (counts?.returnedToAuthor || 0) > 0 && `Returned ${counts?.returnedToAuthor}`,
    (counts?.declined || 0) > 0 && `Declined ${counts?.declined}`,
    (counts?.voided || 0) > 0 && `Cancelled ${counts?.voided}`,
  ].filter(Boolean) as string[];
  const otherSub = otherParts.length ? otherParts.join(' · ') : 'Draft / Returned / Declined / Cancelled';

  function canSign(env: EnvelopeSummary) {
    return env.status === 'Sent' && env.recipients.some((r) => r.username === user?.username && r.status === 'Sent');
  }
  // Void mirrors the server rule (participant-scoped): only the creator or a
  // recipient who hasn't yet acted may void — being IT Admin/Administrator
  // does not by itself grant void. Only in-flight envelopes are voidable.
  function canVoid(env: EnvelopeSummary | null): boolean {
    if (!env || !user || !['Sent', 'ReturnedToAuthor'].includes(env.status)) return false;
    if (env.createdBy === user.username) return true;
    const me = env.recipients.find((r) => r.username === user.username);
    return !!me && ['Pending', 'Sent'].includes(me.status);
  }
  function canDelegate(env: EnvelopeSummary | null) {
    return env ? canSign(env) : false;
  }
  function canResend(env: EnvelopeSummary) {
    return env.status === 'ReturnedToAuthor' && env.createdBy === user?.username;
  }

  const q = debouncedSearch.trim().toLowerCase();
  const filteredEnvelopes = useMemo(() => {
    return envelopes.filter((env) => {
      if (envStatus === 'Other') {
        if (env.status === 'Sent' || env.status === 'Completed') return false;
      } else if (envStatus && env.status !== envStatus) {
        return false;
      }
      if (!q) return true;
      const title = (env.title || '').toLowerCase();
      const sender = (env.createdBy || '').toLowerCase();
      const docNo = docNumbersOf(env).toLowerCase();
      const recips = env.recipients.map((r) => `${r.username || ''} ${r.fullName || ''}`).join(' ').toLowerCase();
      if (searchField === 'title') return title.includes(q);
      if (searchField === 'docno') return docNo.includes(q);
      if (searchField === 'sender') return sender.includes(q);
      if (searchField === 'recipient') return recips.includes(q);
      return title.includes(q) || docNo.includes(q) || sender.includes(q) || recips.includes(q);
    });
  }, [envelopes, envStatus, q, searchField]);

  const pg = usePagination(filteredEnvelopes, 10);
  const hasFilters = !!(q || envStatus);
  function clearFilters() {
    setEnvSearch('');
    setEnvStatus('');
    setSearchField('all');
  }

  if (!user) return null;

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <button
          onClick={() => setEnvStatus(envStatus === 'Sent' ? '' : 'Sent')}
          className={cn('rounded-lg border bg-paper-raised p-3.5 text-left shadow-card', envStatus === 'Sent' ? 'border-warning ring-1 ring-warning' : 'border-line')}
        >
          <div className="text-[11px] font-semibold tracking-wide text-slate uppercase">Pending</div>
          <div className="mt-1 text-2xl font-semibold text-warning">{pendingCount}</div>
          <div className="text-[11px] text-slate">Awaiting signature</div>
        </button>
        <button
          onClick={() => setEnvStatus(envStatus === 'Completed' ? '' : 'Completed')}
          className={cn('rounded-lg border bg-paper-raised p-3.5 text-left shadow-card', envStatus === 'Completed' ? 'border-success ring-1 ring-success' : 'border-line')}
        >
          <div className="text-[11px] font-semibold tracking-wide text-slate uppercase">Completed</div>
          <div className="mt-1 text-2xl font-semibold text-success">{completedCount}</div>
          <div className="text-[11px] text-slate">Fully signed</div>
        </button>
        <button
          onClick={() => setEnvStatus(envStatus === 'Other' ? '' : 'Other')}
          title={otherSub}
          className={cn('rounded-lg border bg-paper-raised p-3.5 text-left shadow-card', envStatus === 'Other' ? 'border-violet ring-1 ring-violet' : 'border-line')}
        >
          <div className="text-[11px] font-semibold tracking-wide text-slate uppercase">Other Statuses</div>
          <div className="mt-1 text-2xl font-semibold text-violet">{otherCount}</div>
          <div className="truncate text-[11px] text-slate">{otherSub}</div>
        </button>
        <div className="rounded-lg border border-line bg-paper-raised p-3.5 shadow-card">
          <div className="text-[11px] font-semibold tracking-wide text-slate uppercase">Awaiting Me</div>
          <div className="mt-1 text-2xl font-semibold text-seal">{myPending}</div>
          <div className="text-[11px] text-slate">Your action required</div>
        </div>
        <button
          onClick={() => setEnvStatus('')}
          className={cn('rounded-lg border bg-paper-raised p-3.5 text-left shadow-card', envStatus === '' ? 'border-ink-soft ring-1 ring-ink-soft' : 'border-line')}
        >
          <div className="text-[11px] font-semibold tracking-wide text-slate uppercase">Total</div>
          <div className="mt-1 text-2xl font-semibold text-ink">{counts?.total ?? 0}</div>
          <div className="text-[11px] text-slate">Pending + Completed + Other</div>
        </button>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle>Documents</CardTitle>
            <CardDescription className="font-record uppercase">Electronic signature workflow</CardDescription>
          </div>
          <CardAction>
            <Button size="sm" onClick={() => setShowCreate(true)}>
              + New Document
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          {!isLoading && (
            <div className="mb-3 flex flex-wrap gap-2">
              <Select value={searchField} onValueChange={(v) => setSearchField(v as SearchField)}>
                <SelectTrigger className="w-40" aria-label="Search field">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All fields</SelectItem>
                  <SelectItem value="title">Title</SelectItem>
                  <SelectItem value="docno">Document No</SelectItem>
                  <SelectItem value="sender">Sender</SelectItem>
                  <SelectItem value="recipient">Recipient</SelectItem>
                </SelectContent>
              </Select>
              <Input
                className="min-w-[200px] flex-1"
                placeholder={
                  searchField === 'title'
                    ? 'Search by title…'
                    : searchField === 'docno'
                      ? 'Search by document no…'
                      : searchField === 'sender'
                        ? 'Search by sender…'
                        : searchField === 'recipient'
                          ? 'Search by recipient…'
                          : 'Search by title, document no, sender, or recipient…'
                }
                value={envSearch}
                onChange={(e) => setEnvSearch(e.target.value)}
              />
              <Select value={envStatus || 'all'} onValueChange={(v) => setEnvStatus(v === 'all' ? '' : (v as StatusFilter))}>
                <SelectTrigger className="w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="Other">Other (Cancelled / Declined / Draft / Returned)</SelectItem>
                  {STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s} value={s}>
                      {statusLabel(s)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {!isLoading && hasFilters && (
            <div className="mb-3">
              <ActiveFilters filters={{ [FIELD_LABEL[searchField]]: q, Status: envStatus === 'Other' ? 'Other statuses' : envStatus }} onClear={clearFilters} />
            </div>
          )}

          {error && (
            <div className="mb-3 rounded-md border border-danger/30 bg-danger-soft px-3 py-2.5 text-[13px] text-danger">
              {error instanceof Error ? error.message : 'Failed to load documents'}
            </div>
          )}

          {isLoading ? (
            <div className="py-10 text-center text-[13px] text-slate">Loading documents…</div>
          ) : (
            <div className="overflow-x-auto">
              <Table className="min-w-[900px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[20%]">Title</TableHead>
                    <TableHead className="w-[13%]">Document No</TableHead>
                    <TableHead className="w-[10%]">Sender</TableHead>
                    <TableHead className="w-[17%]">Recipients</TableHead>
                    <TableHead className="w-[11%]">Status</TableHead>
                    <TableHead className="w-[11%]">Created</TableHead>
                    <TableHead className="w-[15%] text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredEnvelopes.length === 0 ? (
                    <EmptyState
                      colSpan={7}
                      icon={<PenLine size={28} />}
                      title={!hasFilters && (counts?.total ?? 0) === 0 ? 'No documents yet' : 'No documents match your filters'}
                      hint={!hasFilters && (counts?.total ?? 0) === 0 ? 'Click "+ New Document" to start a signature workflow.' : 'Try a different search term or status.'}
                      onClear={hasFilters ? clearFilters : undefined}
                    />
                  ) : (
                    pg.pageItems.map((env) => (
                      <TableRow key={env.id}>
                        <TableCell className="max-w-[220px] font-medium text-ink">
                          <span className="line-clamp-2" title={env.title}>
                            {env.title}
                          </span>
                        </TableCell>
                        <TableCell className="font-record text-[12px] text-ink-soft">{docNumbersOf(env) || '—'}</TableCell>
                        <TableCell className="font-record text-[12px] text-ink-soft">{env.createdBy}</TableCell>
                        <TableCell className="text-[12.5px] text-slate">
                          {env.recipients.length} recipient(s) · {docCountOf(env)} doc(s)
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={env.status} />
                        </TableCell>
                        <TableCell className="text-[12.5px] text-slate">{formatDate(env.createdAt)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex flex-wrap justify-end gap-1.5">
                            <Button variant="ghost" size="sm" onClick={() => setViewEnv(env)}>
                              View
                            </Button>
                            {canSign(env) && (
                              <Button size="sm" className="bg-success text-white hover:bg-success/90" onClick={() => setSignEnv(env)}>
                                Sign
                              </Button>
                            )}
                            {canResend(env) && (
                              <Button size="sm" className="bg-violet text-white hover:bg-violet/90" onClick={() => setResendEnv(env)}>
                                Resend
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
              {pg.pageCount > 1 && (
                <Pagination
                  page={pg.page}
                  pageCount={pg.pageCount}
                  total={pg.total}
                  pageSize={pg.pageSize}
                  rangeStart={pg.rangeStart}
                  rangeEnd={pg.rangeEnd}
                  setPage={pg.setPage}
                  next={pg.next}
                  prev={pg.prev}
                  label="documents"
                />
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {showCreate && (
        <CreateEnvelopeWizard currentUser={user} users={users} departments={departments} sites={sites} onClose={() => setShowCreate(false)} onCreated={() => setShowCreate(false)} />
      )}
      {viewEnv && (
        <ViewEnvelopeModal
          envelope={viewEnv}
          currentUser={user}
          users={users}
          onReassigned={() => setViewEnv(null)}
          onClose={() => setViewEnv(null)}
          canVoid={canVoid(viewEnv)}
          onVoid={() => {
            const e = viewEnv;
            setViewEnv(null);
            setVoidEnv(e);
          }}
        />
      )}
      {resendEnv && <ResendEnvelopeModal envelope={resendEnv} currentUser={user} onClose={() => setResendEnv(null)} onResent={() => setResendEnv(null)} />}
      {signEnv && (
        <SignEnvelopeModal
          envelope={signEnv}
          currentUser={user}
          onClose={() => setSignEnv(null)}
          onSigned={() => setSignEnv(null)}
          canDelegate={canDelegate(signEnv)}
          onDelegate={() => {
            const e = signEnv;
            setSignEnv(null);
            setDelegateEnv(e);
          }}
        />
      )}
      {delegateEnv && (
        <DelegateModal
          envelope={delegateEnv}
          currentUser={user}
          users={users}
          departments={departments}
          sites={sites}
          onClose={() => setDelegateEnv(null)}
          onDelegated={() => setDelegateEnv(null)}
        />
      )}
      {voidEnv && <VoidModal envelope={voidEnv} currentUsername={user.username} onClose={() => setVoidEnv(null)} onVoided={() => setVoidEnv(null)} />}
    </div>
  );
}
