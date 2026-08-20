import { useState, useMemo, Fragment } from 'react';
import { Search, FileText, ShieldCheck, User as UserIcon, Building2, KeyRound, Settings as SettingsIcon } from 'lucide-react';
import { useSession } from '@/features/auth/session-context';
import { useAuditHistory } from '@/features/audit/hooks';
import { formatDateTime, CHANGE_ACTION_COLOR } from '@/features/signatures/constants';
import { DiffView } from '@/features/audit/diff-view';
import { FilterBar, Field } from '@/components/filter-bar';
import { EmptyState } from '@/components/empty-state';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';

const ENTITY_ICON: Record<string, React.ReactNode> = {
  User: <UserIcon size={13} />,
  Department: <Building2 size={13} />,
  RolePrivilege: <KeyRound size={13} />,
  Settings: <SettingsIcon size={13} />,
};

export function ChangeHistoryTab() {
  const { user } = useSession();
  const isPrivileged = ['IT Admin', 'Administrator'].includes(user?.role || '');
  const [entityFilter, setEntityFilter] = useState('');
  const [expanded, setExpanded] = useState<number | null>(null);

  const { data, isLoading, error } = useAuditHistory({}, isPrivileged);
  const entries = useMemo(() => data?.entries || [], [data]);

  const allTypes = useMemo(() => [...new Set(entries.map((e) => e.entityType))].sort(), [entries]);
  const filtered = entityFilter ? entries.filter((e) => e.entityType === entityFilter) : entries;

  if (!isPrivileged) {
    return (
      <Card className="flex flex-col items-center gap-3 p-8 text-center">
        <span className="flex size-11 items-center justify-center rounded-full bg-paper text-slate">
          <ShieldCheck size={26} />
        </span>
        <div className="text-[15px] font-semibold text-ink">IT Admin or Administrator only</div>
        <p className="text-[13px] text-slate">
          Change history records before/after snapshots of all system changes and is restricted to privileged roles.
        </p>
      </Card>
    );
  }

  return (
    <>
      <FilterBar
        title={
          <span className="flex items-center gap-1.5">
            <Search size={16} /> Filter
          </span>
        }
        actions={
          <Button variant="ghost" size="sm" onClick={() => setEntityFilter('')}>
            Clear
          </Button>
        }
      >
        <Field label="Entity Type">
          <Select value={entityFilter || 'all'} onValueChange={(v) => setEntityFilter(v === 'all' ? '' : v)}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="All Types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {allTypes.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </FilterBar>

      {error && (
        <div className="my-4 rounded-md border border-danger/30 bg-danger-soft px-3 py-2.5 text-[12px] text-danger">
          <strong>Cannot load change history:</strong> {error instanceof Error ? error.message : 'unknown error'}
        </div>
      )}

      <Card className="mt-4">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-1.5">
            <FileText size={16} className="text-seal" /> Change History
          </CardTitle>
          <CardDescription className="font-record uppercase">
            {isLoading ? 'Loading…' : `${filtered.length} records · before/after snapshots`}
          </CardDescription>
        </CardHeader>
        {isLoading ? (
          <div className="py-8 text-center text-[13px] text-slate">Loading change history…</div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<FileText size={26} />}
            title={entityFilter ? `No ${entityFilter} changes found` : 'No change history records yet'}
            hint={entityFilter ? 'No before/after snapshots match this entity type.' : 'Before/after snapshots of system changes will appear here.'}
            onClear={entityFilter ? () => setEntityFilter('') : undefined}
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>Entity</TableHead>
                  <TableHead>Record</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Changed By</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Changes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((entry, i) => (
                  <Fragment key={entry.id}>
                    <TableRow className="cursor-pointer" onClick={() => setExpanded(expanded === i ? null : i)}>
                      <TableCell className="font-record text-[10px] whitespace-nowrap">{formatDateTime(entry.timestamp)}</TableCell>
                      <TableCell>
                        <span className="flex items-center gap-1 text-[11px] text-ink-soft">
                          {ENTITY_ICON[entry.entityType]} {entry.entityType}
                        </span>
                      </TableCell>
                      <TableCell className="font-record text-[11px] text-seal">{entry.entityLabel || entry.entityId}</TableCell>
                      <TableCell>
                        <span
                          className="font-record rounded bg-paper px-1.5 py-0.5 text-[10px]"
                          style={{ color: CHANGE_ACTION_COLOR[entry.action] || 'var(--color-ink-soft)' }}
                        >
                          {entry.action}
                        </span>
                      </TableCell>
                      <TableCell className="font-record text-[11px]">{entry.changedBy}</TableCell>
                      <TableCell className="text-[11px] text-ink-soft">{entry.changedByRole}</TableCell>
                      <TableCell className="text-[11px] text-ink-soft">
                        {(entry.changedFields || []).length > 0 ? (
                          <span className="text-warning">{(entry.changedFields || []).join(', ')}</span>
                        ) : entry.action === 'CREATE' ? (
                          <span className="text-success">New record</span>
                        ) : (
                          '—'
                        )}
                        <span className="ml-2 text-[10px] text-seal">{expanded === i ? '▲ hide' : '▼ diff'}</span>
                      </TableCell>
                    </TableRow>
                    {expanded === i && (
                      <TableRow className="bg-paper hover:bg-paper">
                        <TableCell colSpan={7} className="px-4 py-2.5">
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <div className="mb-1 text-[10px] font-semibold text-slate">CHANGES</div>
                              <DiffView before={entry.before} after={entry.after} />
                            </div>
                            <div className="font-record text-[10px] text-ink-soft">id: {entry.entityId}</div>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </>
  );
}
