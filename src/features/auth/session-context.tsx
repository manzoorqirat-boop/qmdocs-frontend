// Session state + the sequential post-login gates (must-change-password,
// multi-role selection, multi-site selection). Ported from the App()
// component in the legacy main.jsx — same logic, same sessionStorage keys —
// but as a context so the TanStack Router route tree can guard on it instead
// of the old `pages[activePage]` object switch.
import { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from 'react';
import {
  getSession,
  saveSession,
  clearSession,
  getActiveSite,
  setActiveSite as persistActiveSite,
} from '@/lib/session';
import { api } from '@/lib/api';
import type { SessionUser, LoginResponse, PrivilegeSet } from '@/types/api';

function accessibleSiteCount(user: SessionUser | null): number {
  if (!user) return 0;
  // Only Administrators — and org-level IT Admins with NO site assignment —
  // are global (selector incl. "All Sites"). An IT Admin assigned to a plant
  // is scoped to their real site set like everyone else.
  const primary = user.siteId;
  if (user.role === 'Administrator') return 2;
  if (user.role === 'IT Admin' && !primary) return 2;
  const ids = new Set<string>();
  if (primary) ids.add(String(primary));
  (user.additionalAccess || []).forEach((g) => {
    if (g.siteId) ids.add(String(g.siteId));
  });
  return ids.size;
}

interface SessionContextValue {
  user: SessionUser | null;
  activeSite: string;
  roleChosen: boolean;
  accessibleSiteCount: number;
  needsRoleSelection: boolean;
  needsSiteSelection: boolean;
  login: (u: LoginResponse) => void;
  logout: () => Promise<void>;
  refreshSession: (data: LoginResponse) => void;
  selectRole: (r: { role: string; roles: string[]; privileges: PrivilegeSet }) => void;
  selectSite: (siteId: string) => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(() => getSession());
  const [activeSite, setActiveSiteState] = useState<string>(() => getActiveSite());
  const [roleChosen, setRoleChosen] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem('eres_role_chosen') === '1';
    } catch {
      return false;
    }
  });

  const login = useCallback((u: LoginResponse) => {
    // A fresh login clears any stale active-site / role choice.
    persistActiveSite('');
    setActiveSiteState('');
    try {
      sessionStorage.removeItem('eres_role_chosen');
    } catch {
      /* ignore */
    }
    setRoleChosen(false);
    saveSession(u);
    setUser(getSession());

    // Single-site users: auto-select their only site, skip the screen.
    if (accessibleSiteCount(getSession()) <= 1) {
      const primary = u.siteId;
      if (primary) {
        const label = u.siteName ? `${u.siteName}${u.siteCode ? ` (${u.siteCode})` : ''}` : '';
        persistActiveSite(String(primary), label);
        setActiveSiteState(String(primary));
      }
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      /* ignore — we're logging out regardless */
    }
    clearSession();
    setActiveSiteState('');
    setUser(null);
  }, []);

  const refreshSession = useCallback((data: LoginResponse) => {
    saveSession(data);
    setUser(getSession());
  }, []);

  const selectRole = useCallback(
    (r: { role: string; roles: string[]; privileges: PrivilegeSet }) => {
      setUser((prev) => {
        if (!prev) return prev;
        const merged = { ...prev, role: r.role, roles: r.roles, privileges: r.privileges };
        saveSession(merged as SessionUser & { token?: string });
        return merged;
      });
      try {
        sessionStorage.setItem('eres_role_chosen', '1');
      } catch {
        /* ignore */
      }
      setRoleChosen(true);
    },
    [],
  );

  const selectSite = useCallback((siteId: string) => {
    setActiveSiteState(siteId);
  }, []);

  const siteCount = accessibleSiteCount(user);
  const roleSet = user?.roles && user.roles.length ? user.roles : user ? [user.role] : [];

  const value = useMemo<SessionContextValue>(
    () => ({
      user,
      activeSite,
      roleChosen,
      accessibleSiteCount: siteCount,
      needsRoleSelection: roleSet.length > 1 && !roleChosen,
      needsSiteSelection: siteCount > 1 && !activeSite,
      login,
      logout,
      refreshSession,
      selectRole,
      selectSite,
    }),
    [user, activeSite, roleChosen, siteCount, roleSet.length, login, logout, refreshSession, selectRole, selectSite],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used within a SessionProvider');
  return ctx;
}
