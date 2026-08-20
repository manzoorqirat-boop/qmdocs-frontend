import { useState } from 'react';
import { X, Plus } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { useUpdateUserAssignment } from '@/features/users/hooks';
import { toast } from '@/lib/toast';
import type { UserDirectoryEntry, Site, Department } from '@/types/api';

interface AssignmentDialogProps {
  target: UserDirectoryEntry;
  sites: Site[];
  departments: Department[];
  onClose: () => void;
  onSaved: () => void;
}

interface AssignForm {
  siteId: string;
  department: string;
  employeeId: string;
  additionalAccess: { siteId: string }[];
}

export function AssignmentDialog({ target, sites, departments, onClose, onSaved }: AssignmentDialogProps) {
  const activeSites = sites.filter((s) => s.isActive !== false);
  const mutation = useUpdateUserAssignment();

  const [form, setForm] = useState<AssignForm>({
    siteId: target.siteId || '',
    department: target.department || '',
    employeeId: target.employeeId || '',
    additionalAccess: (target.additionalAccess || []).map((a) => ({ siteId: a.siteId })),
  });

  function deptsForSite(sid: string) {
    return departments.filter((d) => d.isActive !== false && sid && (d.siteIds || []).includes(sid));
  }

  async function save() {
    if (!form.siteId) return toast.warn('Please select a primary site');
    if (!form.department) return toast.warn('Please select a primary department');
    // Grants are SITE-ONLY: department is always the user's primary
    // department (server enforces this too).
    const grants = form.additionalAccess.filter((g) => g.siteId).map((g) => ({ siteId: g.siteId, department: form.department }));
    // Duplicate guard: a grant may not repeat the primary site nor another grant.
    const seen = new Set([String(form.siteId)]);
    for (const g of grants) {
      const k = String(g.siteId);
      const site = sites.find((s) => String(s.id) === k);
      if (k === String(form.siteId)) {
        return toast.warn(`${site ? site.name : 'That site'} is already the primary site — remove the duplicate grant.`);
      }
      if (seen.has(k)) {
        return toast.warn(`Duplicate grant: ${site ? site.name : 'that site'} is listed more than once.`);
      }
      seen.add(k);
    }
    try {
      await mutation.mutateAsync({
        id: target.id,
        body: { siteId: form.siteId, department: form.department, employeeId: form.employeeId, additionalAccess: grants },
      });
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save assignment.');
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !mutation.isPending && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Assignment — {target.fullName || target.username}</DialogTitle>
        </DialogHeader>

        <p className="text-[12px] text-slate">
          Primary assignment determines the user's home site/department. Additional access grants extra sites they
          may act in.
        </p>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="asg-empid">Employee ID</Label>
          <Input
            id="asg-empid"
            value={form.employeeId}
            onChange={(e) => setForm({ ...form, employeeId: e.target.value })}
            placeholder="e.g. EMP-0142"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>Primary site *</Label>
            <Select value={form.siteId} onValueChange={(v) => setForm({ ...form, siteId: v, department: '' })}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select…" />
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
          <div className="flex flex-col gap-1.5">
            <Label>Primary department *</Label>
            <Select value={form.department} onValueChange={(v) => setForm({ ...form, department: v })} disabled={!form.siteId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={form.siteId ? 'Select…' : 'Pick a site first'} />
              </SelectTrigger>
              <SelectContent>
                {deptsForSite(form.siteId).map((d) => (
                  <SelectItem key={d.id} value={d.name}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="mt-1 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <Label>Additional access</Label>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2"
              onClick={() => setForm({ ...form, additionalAccess: [...form.additionalAccess, { siteId: '' }] })}
            >
              <Plus size={13} /> Add site
            </Button>
          </div>
          {form.additionalAccess.length === 0 ? (
            <p className="text-[12px] text-slate">No additional access. The user can only act in their primary site/department.</p>
          ) : (
            <p className="text-[11.5px] text-slate">
              Additional access applies the user's primary department at each granted site. The department is not
              changeable.
            </p>
          )}
          {form.additionalAccess.map((g, i) => (
            <div key={i} className="grid grid-cols-[1fr_auto] gap-2">
              <Select
                value={g.siteId}
                onValueChange={(v) => {
                  const next = [...form.additionalAccess];
                  next[i] = { siteId: v };
                  setForm({ ...form, additionalAccess: next });
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Site…" />
                </SelectTrigger>
                <SelectContent>
                  {activeSites.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name} ({s.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="icon"
                className="border-danger/30 text-danger hover:bg-danger-soft"
                onClick={() => setForm({ ...form, additionalAccess: form.additionalAccess.filter((_, j) => j !== i) })}
              >
                <X size={14} />
              </Button>
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button onClick={save} disabled={mutation.isPending}>
            {mutation.isPending ? 'Saving…' : 'Save assignment'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
