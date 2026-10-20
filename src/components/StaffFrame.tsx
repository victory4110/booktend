'use client';

import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import AppShell, { WORKSPACE_VIEW_TITLES, type WorkspaceView } from '@/components/AppShell';
import LoginScreen from '@/components/LoginScreen';
import { SessionProvider, type SessionValue } from '@/components/SessionContext';
import { api, ApiError, refreshCsrf, setCsrfToken } from '@/services/api';
import type { StaffAccount } from '@/server/account';

const VIEWS: WorkspaceView[] = ['overview', 'jobs', 'customers', 'services'];

interface Props {
  /** Null when the session is missing or stale, in which case the sign-in screen shows. */
  account: StaffAccount | null;
  csrfToken: string;
  children: ReactNode;
}

/**
 * Wraps every signed-in page with the app chrome. Because it sits in the route
 * group's layout, the sidebar and topbar mount once and stay mounted while the
 * user moves between the dashboard and the profile page.
 */
export default function StaffFrame({ account, csrfToken, children }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [view, setViewState] = useState<WorkspaceView>('overview');
  const [jobCount, setJobCount] = useState<number | undefined>(undefined);

  if (csrfToken) setCsrfToken(csrfToken);

  useEffect(() => {
    // The layout already knows the token the session carries, so a normal page
    // load needs no extra round trip.
    if (csrfToken) setCsrfToken(csrfToken);
    else void refreshCsrf().catch(() => undefined);
  }, [csrfToken]);

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get('view') as WorkspaceView | null;
    if (requested && VIEWS.includes(requested)) setViewState(requested);
  }, []);

  const setView = useCallback((next: WorkspaceView) => {
    setViewState(next);
    // Keep the URL in step so a refresh reopens the same tab.
    const url = new URL(window.location.href);
    url.searchParams.set('view', next);
    window.history.replaceState(null, '', url);
  }, []);

  const signOut = useCallback(async () => {
    try {
      await api<void>('/api/auth/logout', { method: 'POST', body: '{}' });
    } catch (error) {
      // A 401 means the session was already gone; a 403 on logout after a CSRF
      // retry means the cookie cannot be mutated in this context (e.g. embedded
      // iframe preview blocking third-party cookies). Still return to sign-in.
      if (!(error instanceof ApiError && (error.status === 401 || error.status === 403))) throw error;
    }
    router.replace('/');
    // Ask the server for the layout again so the sign-in screen replaces the app.
    router.refresh();
  }, [router]);

  const onNavigate = useCallback(
    (next: WorkspaceView) => {
      // On the dashboard the tabs swap in place; from another page we route back.
      if (pathname === '/') setView(next);
      else router.push(`/?view=${next}`);
    },
    [pathname, router, setView]
  );

  const value = useMemo<SessionValue | null>(
    () => (account ? { user: account.user, workspace: account.workspace, view, setView, jobCount, setJobCount, signOut } : null),
    [account, view, setView, jobCount, signOut]
  );

  if (!account || !value) return <LoginScreen onSignedIn={() => router.refresh()} />;

  const onProfile = pathname === '/profile';
  return (
    <SessionProvider value={value}>
      <AppShell
        user={account.user}
        workspace={account.workspace}
        active={onProfile ? 'profile' : view}
        crumb={onProfile ? 'Profile' : WORKSPACE_VIEW_TITLES[view]}
        totalJobs={jobCount}
        onNavigate={onNavigate}
        onSignOut={() => void signOut()}
      >
        {children}
      </AppShell>
    </SessionProvider>
  );
}
