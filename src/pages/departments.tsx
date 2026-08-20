import { useState, useMemo } from 'react';
import { Building2, Plus, Loader2 } from 'lucide-react';
import { useDepartments, useCreateDepartment, useUpdateDepartment, useDeactivateDepartment } from '@/features/departments/hooks';
import { useSites } from '@/features/sites/hooks';
import { toast } from '@/lib/toast';
import { Card, CardHeader, CardTitle, CardDescription, CardAction, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
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
import { cn } from '@/lib/utils';
import type { Department } from '@/types/api';

interface DeptFormValues {
  name: string;
  code: string;
  description: string;
  siteIds: string[];
  isActive: boolean;
}

const EMPTY: DeptFormValues = { name: '', code: '', description: '', siteIds: [], isActive: true };

function isPendingResponse(x: unknown): x is { pending: true; message: string } {
  return !!x && typeof x === 'object' && 'pending' in x;
}

function DeptFormFields({
  form,
  setForm,
  activeSites,
}: {
  form: DeptFormValues;
  setForm: (f: DeptFormValues) => void;
  activeSites: { id: string; name: string; code: string }[];
}) {
  function toggleSite(id: string) {
    const has = form.siteIds.includes(id);
    setForm({ ...form, siteIds: has ? form.siteIds.filter((s) => s !== id) : [...form.siteIds, id] });
  }
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="dept-name">Department name *</Label>
        <Input id="dept-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="dept-code">Code</Label>
        <Input
          id="dept-code"
          placeholder="e.g. QA, MFG"
          value={form.code}
          onChange={(e) => setForm({ ...form, code: e.target.value })}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="dept-description">Description</Label>
        <textarea
          id="dept-description"
          rows={2}
          className="flex w-full rounded-md border border-line-strong bg-paper-raised px-3 py-2 text-sm text-ink shadow-xs outline-none focus-visible:border-seal focus-visible:ring-2 focus-visible:ring-seal-ring"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>Mapped sites</Label>
        <p className="text-[11px] text-slate">
          Select which sites can use this department. A site cannot be unmapped while users are assigned to it here.
        </p>
        {activeSites.length === 0 ? (
          <p className="text-[12px] text-slate">No active sites — create a site first.</p>
        ) : (
          <div className="grid grid-cols-2 gap-1.5">
            {activeSites.map((s) => (
              <label
                key={s.id}
                className={cn(
                  'flex cursor-pointer items-center gap-2 rounded-md border border-line px-2.5 py-1.5 text-[13px]',
                  form.siteIds.includes(s.id) ? 'border-seal bg-seal-soft' : 'bg-paper-raised',
                )}
              >
                <Checkbox checked={form.siteIds.includes(s.id)} onCheckedChange={() => toggleSite(s.id)} />
                {s.name} <span className="text-slate">({s.code})</span>
              </label>
            ))}
          </div>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Checkbox
          id="dept-active"
          checked={form.isActive}
          onCheckedChange={(c) => setForm({ ...form, isActive: !!c })}
        />
        <Label htmlFor="dept-active" className="font-normal">
          Active
        </Label>
      </div>
    </div>
  );
}

export function DepartmentsPage() {
  const { data: depts = [], isLoading, error } = useDepartments();
  const { data: sites = [] } = useSites();
  const createDept = useCreateDepartment();
  const updateDept = useUpdateDepartment();
  const deactivateDept = useDeactivateDepartment();

  const [siteFilter, setSiteFilter] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [editDept, setEditDept] = useState<Department | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<Department | null>(null);
  const [form, setForm] = useState<DeptFormValues>(EMPTY);

  const activeSites = useMemo(() => sites.filter((s) => s.isActive !== false), [sites]);
  const visibleDepts = useMemo(
    () => (siteFilter ? depts.filter((d) => (d.siteIds || []).includes(siteFilter)) : depts),
    [depts, siteFilter],
  );

  function siteChips(d: Department) {
    return (d.siteIds || []).map((id) => sites.find((s) => s.id === id)?.code || '??');
  }

  function openEdit(dept: Department) {
    setForm({
      name: dept.name,
      code: dept.code || '',
      description: dept.description || '',
      siteIds: dept.siteIds || [],
      isActive: dept.isActive !== false,
    });
    setEditDept(dept);
  }

  async function handleCreate() {
    if (!form.name.trim()) return toast.warn('Department name is required');
    try {
      const result = await createDept.mutateAsync(form);
      if (isPendingResponse(result)) toast.success('Change submitted for QA approval. It will take effect once approved.');
      setShowNew(false);
      setForm(EMPTY);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not create department.');
    }
  }

  async function handleUpdate() {
    if (!editDept || !form.name.trim()) return toast.warn('Department name is required');
    try {
      const result = await updateDept.mutateAsync({ id: editDept.id, body: form });
      if (isPendingResponse(result)) toast.success('Change submitted for QA approval. It will take effect once approved.');
      setEditDept(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update department.');
    }
  }

  async function handleDeactivate() {
    if (!deactivateTarget) return;
    try {
      const result = await deactivateDept.mutateAsync(deactivateTarget.id);
      if (isPendingResponse(result)) toast.success('Deactivation submitted for QA approval.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not deactivate department.');
    } finally {
      setDeactivateTarget(null);
    }
  }

  const saving = createDept.isPending || updateDept.isPending;

  return (
    <div className="mx-auto max-w-6xl">
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Building2 size={17} className="text-seal" /> Departments
            </CardTitle>
            <CardDescription className="font-record uppercase">
              {visibleDepts.length} departments · mapped to sites
            </CardDescription>
          </div>
          <CardAction className="flex items-center gap-2">
            <Select value={siteFilter || 'all'} onValueChange={(v) => setSiteFilter(v === 'all' ? '' : v)}>
              <SelectTrigger size="sm" className="w-40">
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
            <Button
              size="sm"
              onClick={() => {
                setForm(EMPTY);
                setShowNew(true);
              }}
            >
              <Plus size={15} /> New Department
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="mb-3 rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-[13px] text-danger">
              Couldn't load departments: {error instanceof Error ? error.message : 'unknown error'}
            </div>
          )}
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-slate">
              <Loader2 size={16} className="animate-spin" /> Loading departments…
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Mapped sites</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleDepts.length === 0 ? (
                  <EmptyState
                    colSpan={6}
                    icon={<Building2 size={26} />}
                    title={siteFilter ? 'No departments for this site' : 'No departments yet'}
                    hint={
                      siteFilter
                        ? 'No departments are mapped to the selected site.'
                        : 'Click "New Department" to create one.'
                    }
                    onClear={siteFilter ? () => setSiteFilter('') : undefined}
                  />
                ) : (
                  visibleDepts.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell className="font-semibold text-ink">{d.name}</TableCell>
                      <TableCell>
                        <span className="font-record rounded bg-paper px-1.5 py-0.5 text-[12px] font-medium text-ink-soft">
                          {d.code || '—'}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {siteChips(d).length === 0 ? (
                            <span className="text-[11px] text-slate">none</span>
                          ) : (
                            siteChips(d).map((c, i) => (
                              <span key={i} className="font-record rounded bg-paper px-1.5 py-0.5 text-[11px] text-ink-soft">
                                {c}
                              </span>
                            ))
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-[180px] truncate text-[12.5px] text-slate">
                        {d.description || '—'}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col items-start gap-1">
                          <Badge variant={d.isActive !== false ? 'success' : 'danger'}>
                            {d.isActive !== false ? 'Active' : 'Inactive'}
                          </Badge>
                          {d.pendingRequest && <Badge variant="warning">Pending QA approval</Badge>}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1.5">
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={!!d.pendingRequest}
                            title={d.pendingRequest ? 'A change request for this department is pending QA approval' : undefined}
                            onClick={() => openEdit(d)}
                          >
                            Edit
                          </Button>
                          {d.isActive !== false && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="border-danger/30 text-danger hover:bg-danger-soft"
                              disabled={!!d.pendingRequest}
                              title={d.pendingRequest ? 'A change request for this department is pending QA approval' : undefined}
                              onClick={() => setDeactivateTarget(d)}
                            >
                              Deactivate
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={showNew} onOpenChange={setShowNew}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>New department</DialogTitle>
          </DialogHeader>
          <DeptFormFields form={form} setForm={setForm} activeSites={activeSites} />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowNew(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={saving}>
              {saving ? 'Creating…' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editDept} onOpenChange={(open) => !open && setEditDept(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit: {editDept?.name}</DialogTitle>
          </DialogHeader>
          <DeptFormFields form={form} setForm={setForm} activeSites={activeSites} />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditDept(null)}>
              Cancel
            </Button>
            <Button onClick={handleUpdate} disabled={saving}>
              {saving ? 'Saving…' : 'Save changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deactivateTarget} onOpenChange={(open) => !open && setDeactivateTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate "{deactivateTarget?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>It will be kept as Inactive — no data is deleted.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-danger hover:bg-danger/90"
              onClick={handleDeactivate}
              disabled={deactivateDept.isPending}
            >
              Deactivate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
