import { useState } from 'react';
import { Link, useRouterState } from '@tanstack/react-router';
import {
  LayoutDashboard,
  PenLine,
  ShieldCheck,
  Users,
  Building2,
  BarChart3,
  KeySquare,
  CheckSquare,
  Globe,
  Settings as SettingsIcon,
  X,
  MapPin,
  KeyRound,
  Power,
  ChevronDown,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { useSession } from '@/features/auth/session-context';
import { getActiveSiteLabel } from '@/lib/session';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { SessionUser, PrivilegeSet } from '@/types/api';

interface NavItem {
  section?: string;
  id?: string;
  to?: string;
  label?: string;
  icon?: React.ReactNode;
  requires?: keyof PrivilegeSet;
  adminOnly?: boolean;
  qaOrAdmin?: boolean;
  roles?: string[];
}

const ALL_ITEMS: NavItem[] = [
  { section: 'Main' },
  { id: 'dashboard', to: '/app/dashboard', label: 'Dashboard', icon: <LayoutDashboard /> },
  { id: 'signatures', to: '/app/signatures', label: 'Start e-Sign', icon: <PenLine /> },
  { section: 'Records' },
  { id: 'audit', to: '/app/audit', label: 'Audit Trail', icon: <ShieldCheck />, requires: 'canViewAudit' },
  { id: 'reports', to: '/app/reports', label: 'Reports', icon: <BarChart3 />, requires: 'canViewReports' },
  { section: 'Administration' },
  { id: 'users', to: '/app/users', label: 'User Access', icon: <Users />, requires: 'canViewUsers' },
  { id: 'sites', to: '/app/sites', label: 'Sites', icon: <Globe />, adminOnly: true },
  { id: 'departments', to: '/app/departments', label: 'Departments', icon: <Building2 />, adminOnly: true },
  {
    id: 'change-requests',
    to: '/app/change-requests',
    label: 'Change Requests',
    icon: <CheckSquare />,
    qaOrAdmin: true,
  },
  {
    id: 'privileges',
    to: '/app/privileges',
    label: 'Privileges',
    icon: <KeySquare />,
    roles: ['IT Admin', 'Administrator'],
  },
  { section: 'System' },
  { id: 'settings', to: '/app/settings', label: 'Settings', icon: <SettingsIcon />, adminOnly: true },
];

const NAV_ICON_STYLE: Record<string, { bg: string; fg: string }> = {
  dashboard: { bg: '#dbeafe', fg: '#2563eb' },
  signatures: { bg: '#ede9fe', fg: '#7c3aed' },
  audit: { bg: '#fef3c7', fg: '#d97706' },
  reports: { bg: '#cffafe', fg: '#0891b2' },
  users: { bg: '#fce7f3', fg: '#db2777' },
  sites: { bg: '#ccfbf1', fg: '#0d9488' },
  departments: { bg: '#e0e7ff', fg: '#4f46e5' },
  'change-requests': { bg: '#ffedd5', fg: '#ea580c' },
  privileges: { bg: '#fee2e2', fg: '#dc2626' },
  settings: { bg: '#f1f5f9', fg: '#475569' },
};

const DEFAULT_PRIVS_BY_ROLE: Record<string, Partial<PrivilegeSet>> = {
  Administrator: { canViewAudit: true, canViewUsers: true, canViewReports: true, canEditSettings: true },
  'IT Admin': { canViewAudit: true, canViewUsers: true, canViewReports: true, canEditSettings: true },
  Approver: { canViewAudit: true, canViewReports: true },
  Reviewer: { canViewAudit: true, canViewReports: true },
  Author: { canViewAudit: true, canViewReports: true },
};

function canSee(item: NavItem, user: SessionUser | null): boolean {
  if (!item.id) return true;
  if (item.roles) return item.roles.includes(user?.role || '');
  if (item.adminOnly) return ['IT Admin', 'Administrator'].includes(user?.role || '');
  if (item.qaOrAdmin) {
    return ['Approver', 'Site Admin', 'IT Admin', 'Administrator'].includes(user?.role || '');
  }
  if (!item.requires) return true;
  const privs =
    user?.privileges && Object.keys(user.privileges).length
      ? user.privileges
      : DEFAULT_PRIVS_BY_ROLE[user?.role || ''] || {};
  return !!privs[item.requires];
}

const SECTION_COLLAPSE_KEY = 'eres.sidebar.collapsedSections';
function loadSectionCollapse(): Record<string, boolean> {
  try {
    const raw = window.localStorage.getItem(SECTION_COLLAPSE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

// Whole-sidebar icon-only mode — separate from per-section collapse above.
// Desktop only: on mobile the sidebar is an overlay drawer that only
// exists while open, so shrinking it to icon-only doesn't reclaim any
// layout space and just makes it harder to tap the right item.
const RAIL_COLLAPSE_KEY = 'eres.sidebar.collapsedRail';
function loadRailCollapse(): boolean {
  try {
    return window.localStorage.getItem(RAIL_COLLAPSE_KEY) === '1';
  } catch {
    return false;
  }
}

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const { user, activeSite, logout } = useSession();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [sectionCollapsed, setSectionCollapsed] = useState<Record<string, boolean>>(loadSectionCollapse);
  const [railCollapsed, setRailCollapsed] = useState<boolean>(loadRailCollapse);

  function toggleSection(section: string) {
    setSectionCollapsed((prev) => {
      const next = { ...prev, [section]: !prev[section] };
      try {
        window.localStorage.setItem(SECTION_COLLAPSE_KEY, JSON.stringify(next));
      } catch {
        /* localStorage unavailable — collapse state just won't persist */
      }
      return next;
    });
  }
  function toggleRail() {
    setRailCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(RAIL_COLLAPSE_KEY, next ? '1' : '0');
      } catch {
        /* localStorage unavailable — collapse state just won't persist */
      }
      return next;
    });
  }

  const displayName = user?.fullName || user?.username || 'User';
  const displayRole = user?.role || '—';
  const activeSiteLabel =
    activeSite === 'ALL'
      ? 'All Sites'
      : getActiveSiteLabel() ||
        (user?.siteName ? `${user.siteName}${user.siteCode ? ` (${user.siteCode})` : ''}` : '');
  const initials = displayName
    .split(' ')
    .map((w) => w[0])
    .filter(Boolean)
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const visible = ALL_ITEMS.filter((item) => canSee(item, user));
  const clean = visible.filter((item, i, arr) => {
    if (!item.section) return true;
    const next = arr.slice(i + 1);
    const nextSectionIdx = next.findIndex((x) => x.section);
    const between = nextSectionIdx === -1 ? next : next.slice(0, nextSectionIdx);
    return between.some((x) => x.id);
  });
  const groups: { section: string; items: NavItem[] }[] = [];
  clean.forEach((item) => {
    if (item.section) groups.push({ section: item.section, items: [] });
    else groups[groups.length - 1]?.items.push(item);
  });

  return (
    <>
      {isOpen && <div className="fixed inset-0 z-40 bg-ink/40 lg:hidden" onClick={onClose} aria-hidden="true" />}
      <nav
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-line bg-paper-raised transition-[transform,width]',
          'lg:sticky lg:top-0 lg:h-screen lg:translate-x-0',
          isOpen ? 'translate-x-0' : '-translate-x-full',
          railCollapsed && 'lg:w-[72px]',
        )}
      >
        <button
          className="absolute top-3 right-3 rounded-md p-1.5 text-slate hover:bg-paper lg:hidden"
          onClick={onClose}
          aria-label="Close menu"
        >
          <X size={18} />
        </button>

        <button
          onClick={toggleRail}
          title={railCollapsed ? 'Expand menu' : 'Collapse menu'}
          className="absolute top-6 -right-3 z-10 hidden size-6 items-center justify-center rounded-full border border-line bg-paper-raised text-slate shadow-card hover:text-ink lg:flex"
        >
          {railCollapsed ? <PanelLeftOpen size={13} /> : <PanelLeftClose size={13} />}
        </button>

        <div className={cn('flex flex-col gap-1 border-b border-line px-5 py-5', railCollapsed && 'lg:items-center lg:px-0')}>
          <div className={cn('text-[10px] font-semibold tracking-widest text-seal uppercase', railCollapsed && 'lg:hidden')}>
            Electronic Signature System
          </div>
          <div className={cn('flex items-center gap-2 text-lg font-semibold text-ink', railCollapsed && 'lg:gap-0')}>
            <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-seal text-white">
              <ShieldCheck size={16} />
            </span>
            <span className={cn(railCollapsed && 'lg:hidden')}>QMDocs</span>
          </div>
          <div className={cn('font-record text-[11px] text-slate', railCollapsed && 'lg:hidden')}>QMDocs · v2.0.0</div>
        </div>

        <div className={cn('flex-1 overflow-y-auto px-2.5 py-3', railCollapsed && 'lg:px-2')}>
          {groups.map((g) => {
            const isCollapsed = !!sectionCollapsed[g.section];
            return (
              <div key={g.section} className="mb-1">
                <button
                  onClick={() => toggleSection(g.section)}
                  className={cn(
                    'flex w-full items-center justify-between rounded px-2.5 py-1.5 text-[10.5px] font-semibold tracking-widest text-slate uppercase hover:text-ink-soft',
                    railCollapsed && 'lg:hidden',
                  )}
                >
                  {g.section}
                  <ChevronDown size={13} className={cn('transition-transform', isCollapsed && '-rotate-90')} />
                </button>
                {railCollapsed && <div className="mx-2 my-2 hidden border-t border-line lg:block first:hidden" />}

                {(!isCollapsed || railCollapsed) && (
                  <div className="flex flex-col gap-0.5">
                    {g.items.map((item) => {
                      const style = NAV_ICON_STYLE[item.id || ''] || { bg: '#f1f5f9', fg: '#475569' };
                      const active = pathname.startsWith(item.to || '\0');
                      return (
                        <Link
                          key={item.id}
                          to={item.to}
                          onClick={onClose}
                          title={railCollapsed ? item.label : undefined}
                          className={cn(
                            'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13.5px] font-medium text-ink-soft transition-colors [&_svg]:size-[15px]',
                            'hover:bg-paper hover:text-ink',
                            active && 'bg-seal-soft text-seal hover:bg-seal-soft hover:text-seal',
                            railCollapsed && 'lg:justify-center lg:px-0',
                          )}
                        >
                          <span
                            className="flex size-7 shrink-0 items-center justify-center rounded-md"
                            style={{ background: style.bg, color: style.fg }}
                          >
                            {item.icon}
                          </span>
                          <span className={cn(railCollapsed && 'lg:hidden')}>{item.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className={cn('flex flex-col gap-2.5 border-t border-line px-3 py-4', railCollapsed && 'lg:items-center lg:px-2')}>
          <div className={cn('flex items-center gap-2.5 rounded-md px-1.5 py-1', railCollapsed && 'lg:px-0')}>
            <Avatar>
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
            <div className={cn('min-w-0', railCollapsed && 'lg:hidden')}>
              <div className="truncate text-[13px] font-semibold text-ink">{displayName}</div>
              <div className="truncate text-[11.5px] text-slate">{displayRole}</div>
              {activeSiteLabel && (
                <div className="mt-0.5 flex items-center gap-1 text-[11px] font-medium text-seal">
                  <MapPin size={11} /> {activeSiteLabel}
                </div>
              )}
            </div>
          </div>
          <Button variant="secondary" size="sm" className={cn('justify-start', railCollapsed && 'lg:justify-center lg:px-0')} asChild>
            <Link to="/app/settings" title={railCollapsed ? 'Change Password' : undefined}>
              <KeyRound size={15} /> <span className={cn(railCollapsed && 'lg:hidden')}>Change Password</span>
            </Link>
          </Button>
          <Button
            variant="outline"
            size="sm"
            className={cn('justify-start border-danger/30 text-danger hover:bg-danger-soft', railCollapsed && 'lg:justify-center lg:px-0')}
            title={railCollapsed ? 'Sign Out' : undefined}
            onClick={() => logout()}
          >
            <Power size={15} /> <span className={cn(railCollapsed && 'lg:hidden')}>Sign Out</span>
          </Button>
        </div>
      </nav>
    </>
  );
}