// Shown after login when a user has access to more than one site. The
// chosen site becomes the active working site for the session (everything
// scopes to it). Global admins also get an "All Sites" option.
import { useState, useMemo } from 'react';
import { Loader2, MapPin } from 'lucide-react';
import { useSession } from '@/features/auth/session-context';
import { useSites } from '@/features/sites/hooks';
import { setActiveSite } from '@/lib/session';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

export function SiteSelectGate() {
  const { user, selectSite } = useSession();
  const { data: allSites, isLoading } = useSites();
  const [selected, setSelected] = useState<{ id: string; label: string } | null>(null);

  // Only Administrators and org-level IT Admins with no site assignment get
  // "All Sites" — a plant-assigned IT Admin picks among their real sites.
  const isGlobalAdmin = user?.role === 'Administrator' || (user?.role === 'IT Admin' && !user?.siteId);

  const sites = useMemo(() => {
    const list = (allSites || []).filter((s) => s.isActive !== false);
    if (isGlobalAdmin) return list;
    const ids = new Set<string>();
    if (user?.siteId) ids.add(String(user.siteId));
    (user?.additionalAccess || []).forEach((g) => {
      if (g.siteId) ids.add(String(g.siteId));
    });
    return list.filter((s) => ids.has(String(s.id)));
  }, [allSites, isGlobalAdmin, user]);

  function confirmSelection() {
    if (!selected) return;
    setActiveSite(selected.id, selected.label);
    selectSite(selected.id);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper p-4">
      <Card className={cn('w-full p-6', sites.length > 6 ? 'max-w-2xl' : 'max-w-md')}>
        <div className="mb-4 text-center">
          <div className="text-lg font-semibold text-ink">Select your site</div>
          <div className="mt-1 text-[12.5px] text-slate">
            Choose the site you want to work in for this session. Change it by signing out and back in.
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-slate">
            <Loader2 size={16} className="animate-spin" /> Loading sites…
          </div>
        ) : (
          <>
            <RadioGroup
              value={selected?.id || ''}
              onValueChange={(id) => {
                if (id === 'ALL') setSelected({ id: 'ALL', label: 'All Sites' });
                else {
                  const s = sites.find((x) => x.id === id);
                  if (s) setSelected({ id: s.id, label: `${s.name} (${s.code})` });
                }
              }}
              className={cn(
                'max-h-[calc(100vh-260px)] gap-1.5 overflow-y-auto',
                sites.length > 6 && 'grid grid-cols-2',
              )}
            >
              {isGlobalAdmin && (
                <Label
                  htmlFor="site-all"
                  className={cn(
                    'flex cursor-pointer items-center gap-2.5 rounded-md border px-3 py-2.5 font-normal',
                    selected?.id === 'ALL' ? 'border-seal bg-seal-soft' : 'border-line bg-seal-soft/40',
                  )}
                >
                  <RadioGroupItem value="ALL" id="site-all" />
                  <span className="flex min-w-0 flex-col">
                    <span className="text-[13px] font-semibold text-ink">All Sites</span>
                    <span className="text-[11px] text-slate">See and manage every site</span>
                  </span>
                </Label>
              )}
              {sites.length === 0 && !isGlobalAdmin ? (
                <div className="py-6 text-center text-[13px] text-slate">
                  No sites are assigned to you. Contact an administrator.
                </div>
              ) : (
                sites.map((s) => (
                  <Label
                    key={s.id}
                    htmlFor={`site-${s.id}`}
                    className={cn(
                      'flex cursor-pointer items-center gap-2.5 rounded-md border px-3 py-2.5 font-normal',
                      selected?.id === s.id ? 'border-seal bg-seal-soft' : 'border-line hover:bg-paper',
                    )}
                  >
                    <RadioGroupItem value={s.id} id={`site-${s.id}`} />
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-[13px] font-semibold text-ink">{s.name}</span>
                      <span className="font-record text-[11px] text-slate">{s.code}</span>
                    </span>
                  </Label>
                ))
              )}
            </RadioGroup>

            <Button onClick={confirmSelection} disabled={!selected} className="mt-5 w-full" size="lg">
              <MapPin size={15} /> Continue
            </Button>
          </>
        )}
      </Card>
    </div>
  );
}
