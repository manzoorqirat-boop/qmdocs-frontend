// Session storage + the cross-tab single-user guard. Ported 1:1 from the
// legacy api.js — same storage keys, same BroadcastChannel protocol — so
// nothing about session behavior changes underneath the rewritten UI.
import type { SessionUser, LoginResponse } from '@/types/api';

// sessionStorage (not localStorage): survives a refresh within the tab, but
// is destroyed when the tab/browser closes, so reopening the URL always
// lands on Login instead of silently resuming a stale session.
const TOKEN_KEY = 'eres_token';
const USER_KEY = 'eres_user';
const ACTIVE_SITE_KEY = 'eres_active_site';
const ACTIVE_SITE_LABEL_KEY = 'eres_active_site_label';

export function getToken(): string | null {
  return sessionStorage.getItem(TOKEN_KEY);
}

export function saveSession(data: LoginResponse | (SessionUser & { token?: string })): void {
  if ('token' in data && data.token) {
    sessionStorage.setItem(TOKEN_KEY, data.token);
  }
  const user: SessionUser = {
    username: data.username,
    fullName: data.fullName,
    role: data.role,
    roles: 'roles' in data ? data.roles : undefined,
    department: data.department,
    siteId: data.siteId ?? null,
    siteName: 'siteName' in data ? data.siteName : undefined,
    siteCode: 'siteCode' in data ? data.siteCode : undefined,
    additionalAccess: data.additionalAccess || [],
    mustChangePassword: !!data.mustChangePassword,
    privileges: data.privileges || {},
    // Inactivity window (minutes) — drives the idle-logout warning timer.
    sessionTimeoutMinutes: data.sessionTimeoutMinutes || 480,
  };
  sessionStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function getSession(): SessionUser | null {
  const user = sessionStorage.getItem(USER_KEY);
  return user ? (JSON.parse(user) as SessionUser) : null;
}

export function clearSession(): void {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(USER_KEY);
  sessionStorage.removeItem(ACTIVE_SITE_KEY);
  sessionStorage.removeItem(ACTIVE_SITE_LABEL_KEY);
}

// ── One user per browser ──────────────────────────────────────────────────
// sessionStorage is per-TAB, so two DIFFERENT users could otherwise be
// signed in simultaneously in two tabs of the same browser. Tabs answer
// identity pings over a BroadcastChannel; before a login is attempted, the
// login page asks "who is active?" and blocks if another tab answers with a
// different username. Crashed/closed tabs simply never answer, so this
// self-heals. Same-user second logins remain allowed and are governed by
// the server's single-active-session rule.
const SESSION_CHANNEL = 'eres-session-guard';
let sessionChannel: BroadcastChannel | null = null;
try {
  if (typeof BroadcastChannel !== 'undefined') {
    sessionChannel = new BroadcastChannel(SESSION_CHANNEL);
    sessionChannel.onmessage = (ev: MessageEvent) => {
      if (ev?.data?.type === 'who-is-active') {
        const s = getSession();
        if (getToken() && s?.username) {
          sessionChannel!.postMessage({ type: 'active-user', username: s.username });
        }
      }
    };
  }
} catch {
  /* older browser — guard degrades gracefully */
}

// Resolves with the set of usernames signed in in OTHER tabs of this browser.
export function probeActiveUsers(waitMs = 350): Promise<string[]> {
  return new Promise((resolve) => {
    if (!sessionChannel) return resolve([]);
    const found = new Set<string>();
    const probe = new BroadcastChannel(SESSION_CHANNEL);
    probe.onmessage = (ev: MessageEvent) => {
      if (ev?.data?.type === 'active-user' && ev.data.username) found.add(ev.data.username);
    };
    try {
      probe.postMessage({ type: 'who-is-active' });
    } catch {
      /* ignore */
    }
    setTimeout(() => {
      try {
        probe.close();
      } catch {
        /* ignore */
      }
      resolve([...found]);
    }, waitMs);
  });
}

// Active working site for this session. '' or 'ALL' = all accessible sites.
export function getActiveSite(): string {
  return sessionStorage.getItem(ACTIVE_SITE_KEY) || '';
}
export function setActiveSite(siteId: string, label?: string): void {
  if (siteId) {
    sessionStorage.setItem(ACTIVE_SITE_KEY, siteId);
    if (label) sessionStorage.setItem(ACTIVE_SITE_LABEL_KEY, label);
  } else {
    sessionStorage.removeItem(ACTIVE_SITE_KEY);
    sessionStorage.removeItem(ACTIVE_SITE_LABEL_KEY);
  }
}
export function getActiveSiteLabel(): string {
  return sessionStorage.getItem(ACTIVE_SITE_LABEL_KEY) || '';
}

declare global {
  interface Window {
    __eresAllowUnload?: boolean;
  }
}
