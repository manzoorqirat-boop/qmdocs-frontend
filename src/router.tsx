import { createRootRoute, createRoute, createRouter, redirect, Navigate } from '@tanstack/react-router';
import { lazy, Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import { RootLayout } from '@/routes/root-layout';
import { AppShell } from '@/routes/app-shell';
import { getSession } from '@/lib/session';
import { LoginPage } from '@/pages/login';

// Every page below is code-split: its bundle (and anything heavy it pulls
// in — recharts, pdfjs-dist, exceljs) only downloads when that route is
// actually visited, not as part of the initial app load.
const ExternalSignPage = lazy(() => import('@/pages/external-sign').then((m) => ({ default: m.ExternalSignPage })));
const VerifyPage = lazy(() => import('@/pages/verify').then((m) => ({ default: m.VerifyPage })));
const DashboardPage = lazy(() => import('@/pages/dashboard').then((m) => ({ default: m.DashboardPage })));
const SignaturesPage = lazy(() => import('@/pages/signatures').then((m) => ({ default: m.SignaturesPage })));
const AuditTrailPage = lazy(() => import('@/pages/audit-trail').then((m) => ({ default: m.AuditTrailPage })));
const UsersPage = lazy(() => import('@/pages/users').then((m) => ({ default: m.UsersPage })));
const SitesPage = lazy(() => import('@/pages/sites').then((m) => ({ default: m.SitesPage })));
const DepartmentsPage = lazy(() => import('@/pages/departments').then((m) => ({ default: m.DepartmentsPage })));
const ChangeRequestsPage = lazy(() => import('@/pages/change-requests').then((m) => ({ default: m.ChangeRequestsPage })));
const ReportsPage = lazy(() => import('@/pages/reports').then((m) => ({ default: m.ReportsPage })));
const SettingsPage = lazy(() => import('@/pages/settings').then((m) => ({ default: m.SettingsPage })));
const PrivilegesPage = lazy(() => import('@/pages/privileges').then((m) => ({ default: m.PrivilegesPage })));

function RouteFallback() {
  return (
    <div className="flex items-center justify-center gap-2 py-24 text-slate">
      <Loader2 size={18} className="animate-spin" /> Loading…
    </div>
  );
}

function withSuspense(Component: React.ComponentType) {
  return function SuspendedRoute() {
    return (
      <Suspense fallback={<RouteFallback />}>
        <Component />
      </Suspense>
    );
  };
}

const rootRoute = createRootRoute({ component: RootLayout });

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: () => <Navigate to={getSession() ? '/app/dashboard' : '/login'} />,
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  beforeLoad: () => {
    // Already signed in — the login form has nothing to do here.
    if (getSession()) throw redirect({ to: '/app/dashboard' });
  },
  component: LoginPage,
});

// Standalone — never mounts the authenticated shell, the Sidebar, or the
// idle-session hook. Vendors signing externally have no account; the legacy
// app deliberately kept this off the authenticated render tree entirely.
const externalSignRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/external/sign/$token',
  component: withSuspense(ExternalSignPage),
});

// Standalone, same reasoning as externalSignRoute above — whoever holds a printed page has
// no account either, so this never touches the authenticated shell.
const verifyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/external/verify/$code',
  component: withSuspense(VerifyPage),
});

// Layout route: everything under here requires a session. beforeLoad reads
// sessionStorage directly (not the React context) because route guards run
// outside React's render — this is the standard TanStack Router pattern for
// auth. The sequential UI gates (must-change-password / role / site) are
// handled inside AppShell itself, as conditional renders, not as separate
// guarded routes — same behavior as the legacy App() component's early
// returns, just relocated.
const authenticatedRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'authenticated',
  beforeLoad: () => {
    if (!getSession()) throw redirect({ to: '/login' });
  },
  component: AppShell,
});

const appLayoutRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: '/app',
});

const dashboardRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/dashboard',
  component: withSuspense(DashboardPage),
});
const signaturesRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/signatures',
  // Lets other pages deep-link with a pre-applied status filter (e.g. a
  // Dashboard stat tile) — mirrors the legacy app's onNavigate(page, filter)
  // callback, but as a real URL instead of prop-drilled navigation state.
  validateSearch: (search: Record<string, unknown>): { status?: string } => ({
    status: typeof search.status === 'string' ? search.status : undefined,
  }),
  component: withSuspense(SignaturesPage),
});
const auditRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/audit',
  component: withSuspense(AuditTrailPage),
});
const usersRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/users',
  component: withSuspense(UsersPage),
});
const sitesRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/sites',
  component: withSuspense(SitesPage),
});
const departmentsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/departments',
  component: withSuspense(DepartmentsPage),
});
const changeRequestsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/change-requests',
  component: withSuspense(ChangeRequestsPage),
});
const reportsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/reports',
  component: withSuspense(ReportsPage),
});
const settingsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/settings',
  component: withSuspense(SettingsPage),
});
const privilegesRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/privileges',
  component: withSuspense(PrivilegesPage),
});

const appRouteTree = appLayoutRoute.addChildren([
  dashboardRoute,
  signaturesRoute,
  auditRoute,
  usersRoute,
  sitesRoute,
  departmentsRoute,
  changeRequestsRoute,
  reportsRoute,
  settingsRoute,
  privilegesRoute,
]);

const routeTree = rootRoute.addChildren([
  indexRoute,
  loginRoute,
  externalSignRoute,
  verifyRoute,
  authenticatedRoute.addChildren([appRouteTree]),
]);

export const router = createRouter({ routeTree, defaultPreload: 'intent' });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
