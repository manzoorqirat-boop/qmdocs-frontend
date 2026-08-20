import { useState } from 'react';
import { Outlet } from '@tanstack/react-router';
import { Menu, Power } from 'lucide-react';
import { useSession } from '@/features/auth/session-context';
import { useIdleSession } from '@/hooks/use-idle-session';
import { PasswordChangeGate } from '@/features/auth/password-change-gate';
import { RoleSelectGate } from '@/features/auth/role-select-gate';
import { SiteSelectGate } from '@/features/auth/site-select-gate';
import { IdleSessionWarning } from '@/features/auth/idle-session-warning';
import { Sidebar } from '@/components/sidebar';
import { Button } from '@/components/ui/button';

export function AppShell() {
  const { user, needsRoleSelection, needsSiteSelection, logout } = useSession();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const idle = useIdleSession({
    enabled: !!user && !user.mustChangePassword,
    timeoutMinutes: user?.sessionTimeoutMinutes,
    onExpired: () => {
      window.__eresAllowUnload = true;
      logout();
    },
  });

  // Sequential gates, same order as the legacy app: password change first
  // (it can influence what else is even reachable), then role (can affect
  // site scoping), then site.
  if (user?.mustChangePassword) return <PasswordChangeGate />;
  if (needsRoleSelection) return <RoleSelectGate />;
  if (needsSiteSelection) return <SiteSelectGate />;

  return (
    <div className="flex min-h-screen bg-paper lg:flex-row">
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-paper-raised px-3 py-2.5 lg:hidden">
        <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(true)} aria-label="Open menu">
          <Menu size={20} />
        </Button>
        <div className="text-sm font-semibold text-ink">QMDocs</div>
        <Button variant="ghost" size="icon" onClick={() => logout()} aria-label="Sign out">
          <Power size={18} />
        </Button>
      </div>

      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="min-w-0 flex-1 p-4 lg:p-7">
        <Outlet />
      </main>

      <IdleSessionWarning
        open={idle.showWarning}
        secondsLeft={idle.secondsLeft}
        onStaySignedIn={idle.staySignedIn}
        onSignOut={() => {
          window.__eresAllowUnload = true;
          logout();
        }}
      />
    </div>
  );
}
