import { useState, useMemo } from 'react';
import { Users as UsersIcon, Power, Download, Plus, Loader2 } from 'lucide-react';
import { useSession } from '@/features/auth/session-context';
import {
  useUsersPage,
  useUserStats,
  useCreateUser,
  useUpdateUserStatus,
  useUnlockUser,
  useForceLogoutUser,
} from '@/features/users/hooks';
import { useSites } from '@/features/sites/hooks';
import { useDepartments } from '@/features/departments/hooks';
import { useDesignations } from '@/features/settings/hooks';
import { useDebounce } from '@/hooks/use-debounce';
import { toast } from '@/lib/toast';
import { api } from '@/lib/api';
import { exportWorkbook } from '@/lib/excel-export';
import { Card, CardHeader, CardTitle, CardDescription, CardAction, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import { EmptyState } from '@/components/empty-state';
import { ActiveFilters } from '@/components/filter-bar';
import { Pagination } from '@/components/pagination';
import { PasswordConfirmDialog, type PasswordConfirmAction } from '@/components/password-confirm-dialog';
import { MultiRoleDialog } from '@/features/users/multi-role-dialog';
import { ProfileDialog } from '@/features/users/profile-dialog';
import { AssignmentDialog } from '@/features/users/assignment-dialog';
import type { UserDirectoryEntry } from '@/types/api';

const ROLES = ['Author', 'Reviewer', 'Approver', 'IT Admin', 'Administrator'];
const ADMIN_ROLES = ['IT Admin', 'Administrator'];
const PAGE_SIZE = 10;

const NEW_USER_EMPTY = {
  firstName: '',
  lastName: '',
  username: '',
  email: '',
  employeeId: '',
  designation: '',
  password: '',
  siteId: '',
  department: '',
  role: 'Author',
};

export function UsersPage() {
  const { user } = useSession();
  const isAdmin = ADMIN_ROLES.includes(user?.role || '');

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const debouncedSearch = useDebounce(search, 200);

  // Reset to page 1 when a filter changes — during render, not an effect
  // (see components/pagination.tsx for why).
  const [prevFilterKey, setPrevFilterKey] = useState(`${debouncedSearch}|${roleFilter}`);
  const filterKey = `${debouncedSearch}|${roleFilter}`;
  if (filterKey !== prevFilterKey) {
    setPrevFilterKey(filterKey);
    setPage(1);
  }

  const params = useMemo(() => {
    const p: { page: number; limit: number; search?: string; role?: string } = { page, limit: PAGE_SIZE };
    if (debouncedSearch.trim()) p.search = debouncedSearch.trim();
    if (roleFilter) p.role = roleFilter;
    return p;
  }, [page, debouncedSearch, roleFilter]);

  const { data: usersPage, isLoading, error } = useUsersPage(params);
  const { data: stats = { total: 0, active: 0, inactive: 0 } } = useUserStats();
  const { data: sites = [] } = useSites();
  const { data: departments = [] } = useDepartments();
  const { data: designationsData } = useDesignations();
  const designations = designationsData?.designations || [];

  const users = usersPage?.items || [];
  const total = usersPage?.total || 0;
  const pages = usersPage?.pages || 1;

  const activeSites = useMemo(() => sites.filter((s) => s.isActive !== false), [sites]);
  function userSiteCode(u: UserDirectoryEntry) {
    return sites.find((s) => s.id === u.siteId)?.code || '—';
  }
  function userSiteFull(u: UserDirectoryEntry) {
    const s = sites.find((s2) => s2.id === u.siteId);
    return s ? `${s.name} (${s.code})` : 'Unassigned';
  }

  // ── Dialog state ─────────────────────────────────────────
  const [showNew, setShowNew] = useState(false);
  const [newUserForm, setNewUserForm] = useState(NEW_USER_EMPTY);
  const [rolesUser, setRolesUser] = useState<UserDirectoryEntry | null>(null);
  const [profileUser, setProfileUser] = useState<UserDirectoryEntry | null>(null);
  const [assignUser, setAssignUser] = useState<UserDirectoryEntry | null>(null);
  const [forceLogoutTarget, setForceLogoutTarget] = useState<UserDirectoryEntry | null>(null);
  const [pwAction, setPwAction] = useState<PasswordConfirmAction | null>(null);
  const [pwBusy, setPwBusy] = useState(false);
  const [pwError, setPwError] = useState('');

  const createUser = useCreateUser();
  const updateStatus = useUpdateUserStatus();
  const unlockUser = useUnlockUser();
  const forceLogout = useForceLogoutUser();

  const formSiteDepts = useMemo(
    () => departments.filter((d) => d.isActive !== false && newUserForm.siteId && (d.siteIds || []).includes(newUserForm.siteId)),
    [departments, newUserForm.siteId],
  );

  async function handleCreate() {
    if (!newUserForm.username || !newUserForm.firstName || !newUserForm.password) {
      return toast.warn('Username, First Name, and Password are required');
    }
    if (!newUserForm.email.trim()) return toast.warn('Email is required');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newUserForm.email.trim())) return toast.warn('Enter a valid email address');
    if (!newUserForm.siteId) return toast.warn('Please select a site');
    if (!newUserForm.department) return toast.warn('Please select a department');
    try {
      const fullName = `${newUserForm.firstName} ${newUserForm.lastName}`.trim();
      await createUser.mutateAsync({ ...newUserForm, fullName });
      setShowNew(false);
      setNewUserForm(NEW_USER_EMPTY);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not create user.');
    }
  }

  async function runPwAction(password: string, role?: string) {
    if (!pwAction) return;
    setPwBusy(true);
    setPwError('');
    try {
      await pwAction.run(password, role);
      setPwAction(null);
    } catch (err) {
      setPwError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setPwBusy(false);
    }
  }

  function toggleStatus(u: UserDirectoryEntry) {
    if (!isAdmin) return toast.warn('Only IT Admin or Administrator can change user status');
    const newStatus = u.status === 'Active' ? 'Inactive' : 'Active';
    setPwError('');
    setPwAction({
      title: newStatus === 'Inactive' ? 'Deactivate user' : 'Activate user',
      message: `Enter your password to ${newStatus === 'Inactive' ? 'deactivate' : 'activate'} ${u.username}. This is recorded in the audit trail.`,
      confirmLabel: newStatus === 'Inactive' ? 'Deactivate' : 'Activate',
      run: (password) => updateStatus.mutateAsync({ id: u.id, status: newStatus, adminPassword: password }).then(() => {}),
    });
  }

  function handleUnlock(u: UserDirectoryEntry) {
    if (!isAdmin) return toast.warn('Only IT Admin or Administrator can unlock accounts');
    setPwError('');
    setPwAction({
      title: 'Unlock account',
      message: `Enter your password to unlock ${u.username}.`,
      confirmLabel: 'Unlock',
      run: (password) => unlockUser.mutateAsync({ id: u.id, adminPassword: password }).then(() => {}),
    });
  }

  function handleChangeRole(u: UserDirectoryEntry) {
    if (!isAdmin) return toast.warn('Only IT Admin or Administrator can change user roles');
    setRolesUser(u);
  }

  function confirmForceLogout() {
    if (!forceLogoutTarget) return;
    const u = forceLogoutTarget;
    setForceLogoutTarget(null);
    setPwError('');
    setPwAction({
      title: 'Force logout',
      message: `Enter your password to sign ${u.username} out from all sessions.`,
      confirmLabel: 'Force logout',
      run: (password) => forceLogout.mutateAsync({ id: u.id, adminPassword: password }).then(() => {}),
    });
  }

  const [exporting, setExporting] = useState(false);
  async function exportActiveUsersExcel() {
    if (!isAdmin) return toast.warn('Only IT Admin or Administrator can export the user list');
    setExporting(true);
    try {
      const all = await api.getUsers({ status: 'Active' });
      const list = Array.isArray(all) ? all : all.items || [];

      const bySite = new Map<string, UserDirectoryEntry[]>();
      list.forEach((u) => {
        const site = userSiteFull(u);
        if (!bySite.has(site)) bySite.set(site, []);
        bySite.get(site)!.push(u);
      });

      const toRow = (u: UserDirectoryEntry) => ({
        'User Name': u.username || '',
        'Employee ID': u.employeeId || '',
        'Full Name': u.fullName || '',
        Department: u.department || '',
        Role: u.role || '',
        'Site / Plant': userSiteFull(u),
      });

      const widths = [18, 14, 24, 20, 14, 28];
      const allRows = [...list]
        .sort((a, b) => userSiteFull(a).localeCompare(userSiteFull(b)) || (a.username || '').localeCompare(b.username || ''))
        .map(toRow);

      const sheets = [
        { name: 'All Active Users', rows: allRows, columnWidths: widths },
        ...[...bySite.keys()].sort().map((site) => ({
          name: site,
          rows: bySite.get(site)!.slice().sort((a, b) => (a.username || '').localeCompare(b.username || '')).map(toRow),
          columnWidths: widths,
        })),
      ];

      const stamp = new Date().toISOString().slice(0, 10);
      await exportWorkbook(sheets, `Active-Users-Plantwise-${stamp}.xlsx`);
    } catch (e) {
      toast.error('Export failed: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setExporting(false);
    }
  }

  const [exportingPdf, setExportingPdf] = useState(false);
  async function exportActiveUsersPdf() {
    if (!isAdmin) return toast.warn('Only IT Admin or Administrator can export the user list');
    setExportingPdf(true);
    try {
      const blob = await api.exportActiveUsersPdf();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const stamp = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `Active-User-List-QMDocs-${stamp}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error('PDF export failed: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setExportingPdf(false);
    }
  }

  const hasActiveFilters = !!(debouncedSearch.trim() || roleFilter);
  function clearFilters() {
    setSearch('');
    setRoleFilter('');
  }

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <div className="text-[11px] font-semibold tracking-wide text-slate uppercase">Total users</div>
          <div className="mt-1 text-2xl font-semibold text-ink">{stats.total}</div>
          <div className="text-[11.5px] text-slate">Registered</div>
        </Card>
        <Card className="p-4">
          <div className="text-[11px] font-semibold tracking-wide text-slate uppercase">Active</div>
          <div className="mt-1 text-2xl font-semibold text-success">{stats.active}</div>
          <div className="text-[11.5px] text-slate">Currently active</div>
        </Card>
        <Card className="p-4">
          <div className="text-[11px] font-semibold tracking-wide text-slate uppercase">Inactive</div>
          <div className="mt-1 text-2xl font-semibold text-danger">{stats.inactive}</div>
          <div className="text-[11.5px] text-slate">Deactivated</div>
        </Card>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-danger/30 bg-danger-soft px-3 py-2.5 text-[13px] text-danger">
          {error instanceof Error ? error.message : 'Could not load users.'}
        </div>
      )}

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle>User directory</CardTitle>
            <CardDescription className="font-record uppercase">admin managed · system enforced policies</CardDescription>
          </div>
          {isAdmin && (
            <CardAction className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={exportActiveUsersExcel} disabled={exporting}>
                <Download size={15} /> {exporting ? 'Exporting…' : 'Export Excel'}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={exportActiveUsersPdf}
                disabled={exportingPdf}
                title="Sitewise Active User List — PDF with logo, page numbers and download details"
              >
                <Download size={15} /> {exportingPdf ? 'Exporting…' : 'Export PDF'}
              </Button>
              <Button size="sm" onClick={() => setShowNew(true)}>
                <Plus size={15} /> New User
              </Button>
            </CardAction>
          )}
        </CardHeader>
        <CardContent>
          {!isLoading && (
            <div className="mb-3 flex flex-wrap gap-2">
              <Input
                className="min-w-[200px] flex-1"
                placeholder="Search by name, username, email, department…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <Select value={roleFilter || 'all'} onValueChange={(v) => setRoleFilter(v === 'all' ? '' : v)}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="All roles" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All roles</SelectItem>
                  {ROLES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {!isLoading && hasActiveFilters && (
            <div className="mb-3">
              <ActiveFilters filters={{ Search: debouncedSearch.trim(), Role: roleFilter }} onClear={clearFilters} />
            </div>
          )}

          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-slate">
              <Loader2 size={16} className="animate-spin" /> Loading users…
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table className="min-w-[980px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Username</TableHead>
                    <TableHead>Emp ID</TableHead>
                    <TableHead>Full name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Site</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {total === 0 ? (
                    <EmptyState
                      colSpan={9}
                      icon={<UsersIcon size={26} />}
                      title={hasActiveFilters ? 'No users match your filters' : 'No users yet'}
                      hint={hasActiveFilters ? 'Try a different search term or role.' : 'Created users will appear here.'}
                      onClear={hasActiveFilters ? clearFilters : undefined}
                    />
                  ) : (
                    users.map((u) => (
                      <TableRow key={u.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Avatar className="size-7">
                              <AvatarFallback className="text-[10px]">{(u.username || '').slice(0, 2).toUpperCase()}</AvatarFallback>
                            </Avatar>
                            <span className="font-medium text-seal">{u.username}</span>
                            {u.isLocked && <Badge variant="danger">Locked</Badge>}
                          </div>
                        </TableCell>
                        <TableCell className="font-record text-[12.5px] text-slate">{u.employeeId || '—'}</TableCell>
                        <TableCell>{u.fullName || '—'}</TableCell>
                        <TableCell className="text-[12.5px] text-slate">{u.email || '—'}</TableCell>
                        <TableCell>
                          <span className="font-record rounded bg-paper px-1.5 py-0.5 text-[11.5px] font-medium text-ink-soft">
                            {userSiteCode(u)}
                          </span>
                          {(u.additionalAccess || []).length > 0 && (
                            <span className="ml-1 text-[10px] text-slate">+{u.additionalAccess.length}</span>
                          )}
                        </TableCell>
                        <TableCell>{u.department || '—'}</TableCell>
                        <TableCell>
                          <Badge variant="info">{u.role}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={u.status === 'Active' ? 'success' : 'danger'}>{u.status}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex flex-wrap justify-end gap-1.5">
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={u.username === user?.username}
                              onClick={() => toggleStatus(u)}
                            >
                              {u.status === 'Active' ? 'Deactivate' : 'Activate'}
                            </Button>
                            <Button variant="ghost" size="sm" disabled={u.username === user?.username} onClick={() => handleChangeRole(u)}>
                              Role
                            </Button>
                            {isAdmin && (
                              <Button variant="ghost" size="sm" onClick={() => setAssignUser(u)} title="Edit site, department, and additional access">
                                Assignment
                              </Button>
                            )}
                            {isAdmin && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setProfileUser(u)}
                                title="Edit full name and email (username is locked — audit identity)"
                              >
                                Edit
                              </Button>
                            )}
                            {u.isLocked && (
                              <Button variant="outline" size="sm" className="border-warning/30 text-warning hover:bg-warning-soft" onClick={() => handleUnlock(u)}>
                                Unlock
                              </Button>
                            )}
                            {isAdmin && u.username !== user?.username && u.status === 'Active' && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="border-danger/30 text-danger hover:bg-danger-soft"
                                onClick={() => setForceLogoutTarget(u)}
                                title="Sign user out of all sessions"
                              >
                                <Power size={13} /> Force logout
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
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
                label="users"
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* New User dialog */}
      <Dialog open={showNew} onOpenChange={setShowNew}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>New user</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3.5">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>First name *</Label>
                <Input value={newUserForm.firstName} onChange={(e) => setNewUserForm({ ...newUserForm, firstName: e.target.value })} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Last name</Label>
                <Input value={newUserForm.lastName} onChange={(e) => setNewUserForm({ ...newUserForm, lastName: e.target.value })} />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Username *</Label>
              <Input value={newUserForm.username} onChange={(e) => setNewUserForm({ ...newUserForm, username: e.target.value })} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Employee ID</Label>
              <Input
                value={newUserForm.employeeId}
                onChange={(e) => setNewUserForm({ ...newUserForm, employeeId: e.target.value })}
                placeholder="e.g. EMP-0142"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Designation</Label>
              <Select
                value={newUserForm.designation || '__none'}
                onValueChange={(v) => setNewUserForm({ ...newUserForm, designation: v === '__none' ? '' : v })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select designation" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">— Select designation —</SelectItem>
                  {designations.map((d) => (
                    <SelectItem key={d} value={d}>
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>
                Email <span className="text-danger">*</span>
              </Label>
              <Input
                type="email"
                value={newUserForm.email}
                onChange={(e) => setNewUserForm({ ...newUserForm, email: e.target.value })}
                placeholder="user@company.com"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Password *</Label>
              <Input type="password" value={newUserForm.password} onChange={(e) => setNewUserForm({ ...newUserForm, password: e.target.value })} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Site *</Label>
              <Select value={newUserForm.siteId} onValueChange={(v) => setNewUserForm({ ...newUserForm, siteId: v, department: '' })}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a site…" />
                </SelectTrigger>
                <SelectContent>
                  {activeSites.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name} ({s.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>Department *</Label>
                <Select
                  value={newUserForm.department}
                  onValueChange={(v) => setNewUserForm({ ...newUserForm, department: v })}
                  disabled={!newUserForm.siteId}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={newUserForm.siteId ? 'Select a department…' : 'Select a site first'} />
                  </SelectTrigger>
                  <SelectContent>
                    {formSiteDepts.map((d) => (
                      <SelectItem key={d.id} value={d.name}>
                        {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Role</Label>
                <Select value={newUserForm.role} onValueChange={(v) => setNewUserForm({ ...newUserForm, role: v })}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLES.map((r) => (
                      <SelectItem key={r} value={r}>
                        {r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowNew(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={createUser.isPending}>
              {createUser.isPending ? 'Creating…' : 'Create user'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {rolesUser && <MultiRoleDialog target={rolesUser} actorRole={user?.role} onClose={() => setRolesUser(null)} onSaved={() => setRolesUser(null)} />}

      {profileUser && (
        <ProfileDialog target={profileUser} designations={designations} onClose={() => setProfileUser(null)} onSaved={() => setProfileUser(null)} />
      )}

      {assignUser && (
        <AssignmentDialog
          target={assignUser}
          sites={sites}
          departments={departments}
          onClose={() => setAssignUser(null)}
          onSaved={() => setAssignUser(null)}
        />
      )}

      <AlertDialog open={!!forceLogoutTarget} onOpenChange={(open) => !open && setForceLogoutTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Force-logout {forceLogoutTarget?.username}?</AlertDialogTitle>
            <AlertDialogDescription>They will be signed out from all sessions immediately.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-danger hover:bg-danger/90" onClick={confirmForceLogout}>
              Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
