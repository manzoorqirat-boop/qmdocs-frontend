import { useState } from 'react';
import { Globe, Plus, Loader2 } from 'lucide-react';
import { useSites, useCreateSite, useUpdateSite, useDeactivateSite } from '@/features/sites/hooks';
import { toast } from '@/lib/toast';
import { Card, CardHeader, CardTitle, CardDescription, CardAction, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
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
import type { Site } from '@/types/api';

interface SiteFormValues {
  name: string;
  code: string;
  address: string;
  description: string;
  isActive: boolean;
}

const EMPTY: SiteFormValues = { name: '', code: '', address: '', description: '', isActive: true };

function isPendingResponse(x: unknown): x is { pending: true; message: string } {
  return !!x && typeof x === 'object' && 'pending' in x;
}

function SiteFormFields({ form, setForm }: { form: SiteFormValues; setForm: (f: SiteFormValues) => void }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="site-name">Site name *</Label>
        <Input id="site-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="site-code">
          Code * <span className="font-normal text-slate">(short, unique — e.g. MUM, HYD)</span>
        </Label>
        <Input
          id="site-code"
          placeholder="e.g. MUM"
          value={form.code}
          onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="site-address">Address</Label>
        <Input id="site-address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="site-description">Description</Label>
        <textarea
          id="site-description"
          rows={2}
          className="flex w-full rounded-md border border-line-strong bg-paper-raised px-3 py-2 text-sm text-ink shadow-xs outline-none focus-visible:border-seal focus-visible:ring-2 focus-visible:ring-seal-ring"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />
      </div>
      <div className="flex items-center gap-2">
        <Checkbox
          id="site-active"
          checked={form.isActive}
          onCheckedChange={(c) => setForm({ ...form, isActive: !!c })}
        />
        <Label htmlFor="site-active" className="font-normal">
          Active
        </Label>
      </div>
    </div>
  );
}

export function SitesPage() {
  const { data: sites = [], isLoading, error } = useSites();
  const createSite = useCreateSite();
  const updateSite = useUpdateSite();
  const deactivateSite = useDeactivateSite();

  const [showNew, setShowNew] = useState(false);
  const [editSite, setEditSite] = useState<Site | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<Site | null>(null);
  const [form, setForm] = useState<SiteFormValues>(EMPTY);

  function openEdit(site: Site) {
    setForm({
      name: site.name,
      code: site.code || '',
      address: site.address || '',
      description: site.description || '',
      isActive: site.isActive !== false,
    });
    setEditSite(site);
  }

  async function handleCreate() {
    if (!form.name.trim()) return toast.warn('Site name is required');
    if (!form.code.trim()) return toast.warn('Site code is required');
    try {
      const result = await createSite.mutateAsync(form);
      if (isPendingResponse(result)) {
        toast.success('Change submitted for QA approval. It will take effect once approved.');
      }
      setShowNew(false);
      setForm(EMPTY);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not create site.');
    }
  }

  async function handleUpdate() {
    if (!editSite) return;
    try {
      const result = await updateSite.mutateAsync({ id: editSite.id, body: form });
      if (isPendingResponse(result)) {
        toast.success('Change submitted for QA approval. It will take effect once approved.');
      }
      setEditSite(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update site.');
    }
  }

  async function handleDeactivate() {
    if (!deactivateTarget) return;
    try {
      const result = await deactivateSite.mutateAsync(deactivateTarget.id);
      if (isPendingResponse(result)) {
        toast.success('Deactivation submitted for QA approval.');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not deactivate site.');
    } finally {
      setDeactivateTarget(null);
    }
  }

  const saving = createSite.isPending || updateSite.isPending;

  return (
    <div className="mx-auto max-w-5xl">
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Globe size={17} className="text-seal" /> Sites
            </CardTitle>
            <CardDescription className="font-record uppercase">
              {sites.length} sites · multi-site tenancy
            </CardDescription>
          </div>
          <CardAction>
            <Button
              size="sm"
              onClick={() => {
                setForm(EMPTY);
                setShowNew(true);
              }}
            >
              <Plus size={15} /> New Site
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="mb-3 rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-[13px] text-danger">
              Couldn't load sites: {error instanceof Error ? error.message : 'unknown error'}
            </div>
          )}
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-slate">
              <Loader2 size={16} className="animate-spin" /> Loading sites…
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Address</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sites.length === 0 ? (
                  <EmptyState
                    colSpan={5}
                    icon={<Globe size={26} />}
                    title="No sites yet"
                    hint="Add your first site to begin."
                  />
                ) : (
                  sites.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell>
                        <span className="font-record rounded bg-paper px-1.5 py-0.5 text-[12px] font-medium text-ink-soft">
                          {s.code}
                        </span>
                      </TableCell>
                      <TableCell className="font-semibold text-ink">{s.name}</TableCell>
                      <TableCell className="max-w-[220px] truncate text-[12.5px] text-slate">
                        {s.address || '—'}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col items-start gap-1">
                          <Badge variant={s.isActive !== false ? 'success' : 'danger'}>
                            {s.isActive !== false ? 'Active' : 'Inactive'}
                          </Badge>
                          {s.pendingRequest && <Badge variant="warning">Pending QA approval</Badge>}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1.5">
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={!!s.pendingRequest}
                            title={s.pendingRequest ? 'A change request for this site is pending QA approval' : undefined}
                            onClick={() => openEdit(s)}
                          >
                            Edit
                          </Button>
                          {s.isActive !== false && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="border-danger/30 text-danger hover:bg-danger-soft"
                              disabled={!!s.pendingRequest}
                              title={s.pendingRequest ? 'A change request for this site is pending QA approval' : undefined}
                              onClick={() => setDeactivateTarget(s)}
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New site</DialogTitle>
          </DialogHeader>
          <SiteFormFields form={form} setForm={setForm} />
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

      <Dialog open={!!editSite} onOpenChange={(open) => !open && setEditSite(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit: {editSite?.name}</DialogTitle>
          </DialogHeader>
          <SiteFormFields form={form} setForm={setForm} />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditSite(null)}>
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
              disabled={deactivateSite.isPending}
            >
              Deactivate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
