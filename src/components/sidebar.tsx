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
  // The privilege matrix page itself renders read-only for non-Administrators;
  // editing stays with the Administrator. Site Admin intentionally excluded.
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

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const { user, activeSite, logout } = useSession();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

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

  return (
    <>
      {isOpen && (
        <div className="fixed inset-0 z-40 bg-ink/40 lg:hidden" onClick={onClose} aria-hidden="true" />
      )}
      <nav
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-line bg-paper-raised transition-transform',
          'lg:sticky lg:top-0 lg:h-screen lg:translate-x-0',
          isOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <button
          className="absolute top-3 right-3 rounded-md p-1.5 text-slate hover:bg-paper lg:hidden"
          onClick={onClose}
          aria-label="Close menu"
        >
          <X size={18} />
        </button>

        <div className="flex flex-col gap-1 border-b border-line px-5 py-5">
          <div className="text-[10px] font-semibold tracking-widest text-seal uppercase">
            Electronic Signature System
          </div>
          <div className="flex items-center gap-2 text-lg font-semibold text-ink">
            <span className="flex size-7 items-center justify-center rounded-md bg-seal text-white">
              <ShieldCheck size={16} />
            </span>
            QMDocs
          </div>
          <div className="font-record text-[11px] text-slate">QMDocs · v2.0.0</div>
        </div>

        <div className="flex-1 overflow-y-auto px-2.5 py-3">
          {clean.map((item, i) =>
            item.section ? (
              <div
                key={`s-${i}`}
                className="mt-4 mb-1.5 px-2.5 text-[10.5px] font-semibold tracking-widest text-slate uppercase first:mt-0"
              >
                {item.section}
              </div>
            ) : (
              <Link
                key={item.id}
                to={item.to}
                onClick={onClose}
                className={cn(
                  'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13.5px] font-medium text-ink-soft transition-colors [&_svg]:size-[18px]',
                  'hover:bg-paper hover:text-ink',
                  pathname.startsWith(item.to || '\0') && 'bg-seal-soft text-seal hover:bg-seal-soft hover:text-seal',
                )}
              >
                {item.icon}
                {item.label}
              </Link>
            ),
          )}
        </div>

        <div className="flex flex-col gap-2.5 border-t border-line px-3 py-4">
          <div className="flex items-center gap-2.5 rounded-md px-1.5 py-1">
            <Avatar>
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <div className="truncate text-[13px] font-semibold text-ink">{displayName}</div>
              <div className="truncate text-[11.5px] text-slate">{displayRole}</div>
              {activeSiteLabel && (
                <div className="mt-0.5 flex items-center gap-1 text-[11px] font-medium text-seal">
                  <MapPin size={11} /> {activeSiteLabel}
                </div>
              )}
            </div>
          </div>
          <Button variant="secondary" size="sm" className="justify-start" asChild>
            <Link to="/app/settings">
              <KeyRound size={15} /> Change Password
            </Link>
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="justify-start border-danger/30 text-danger hover:bg-danger-soft"
            onClick={() => logout()}
          >
            <Power size={15} /> Sign Out
          </Button>
        </div>
      </nav>
    </>
  );
}
