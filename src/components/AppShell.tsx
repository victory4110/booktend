'use client';

import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { initials } from '@/lib/format';
import type { SessionUser, Workspace } from '@/lib/types';

/** Views the dashboard can switch between without a page load. */
export type WorkspaceView = 'overview' | 'jobs' | 'customers' | 'services';
/** Every section the sidebar can highlight, including the separate profile route. */
export type ShellSection = WorkspaceView | 'profile';

/** Breadcrumb label for each dashboard tab. */
export const WORKSPACE_VIEW_TITLES: Record<WorkspaceView, string> = {
  overview: 'Overview',
  jobs: 'All jobs',
  customers: 'Customers',
  services: 'Services'
};

const NAV_ITEMS: { id: WorkspaceView; label: string; icon: string; ownerOnly?: boolean }[] = [
  { id: 'overview', label: 'Overview', icon: '▦' },
  { id: 'jobs', label: 'Jobs', icon: '▤' },
  { id: 'customers', label: 'Customers', icon: '♙' },
  { id: 'services', label: 'Services', icon: '✳', ownerOnly: true }
];

interface Props {
  user: SessionUser;
  workspace: Workspace;
  /** Which sidebar entry is highlighted. */
  active: ShellSection;
  /** Text after the "Workspace /" separator in the topbar. */
  crumb: string;
  /** Shown as the Jobs nav count. Omitted on pages that do not load jobs. */
  totalJobs?: number;
  /**
   * Called when a nav entry is picked. When omitted the entries become links to
   * `/?view=<id>`, which is how the profile page reaches the dashboard.
   */
  onNavigate?: (view: WorkspaceView) => void;
  onSignOut: () => void;
  /** Extra controls for the topbar, placed before the sign-out button. */
  topbarActions?: ReactNode;
  children: ReactNode;
}

/**
 * The app chrome shared by the dashboard and every other signed-in page: sidebar
 * with workspace navigation, the workspace/copy-link card, the account menu, and
 * the topbar. Owns only presentation state (sidebar drawer, open menu, copy
 * feedback) so callers keep their own data loading.
 */
export default function AppShell({ user, workspace, active, crumb, totalJobs, onNavigate, onSignOut, topbarActions, children }: Props) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [copyLabel, setCopyLabel] = useState('Copy link');
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const bookingUrl = `/book/${encodeURIComponent(workspace.slug)}`;
  const avatar = user.avatarUrl ? (
    <img src={user.avatarUrl} alt={user.name} className="avatar-img" />
  ) : (
    initials(user.name) || 'BT'
  );

  useEffect(() => () => clearTimeout(copyTimer.current), []);

  useEffect(() => {
    // A click on the trigger or inside the menu must not close that menu. React
    // handlers cannot stop this listener with stopPropagation (the event still
    // reaches document), so decide by where the click landed instead.
    const close = (event: MouseEvent) => {
      const target = event.target as Element | null;
      if (target?.closest('.profile-more, .profile-menu')) return;
      setMenuOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      // Escape returns focus to the trigger so keyboard users are not dropped
      // back at the top of the document.
      setMenuOpen((open) => {
        if (open) menuButtonRef.current?.focus();
        return false;
      });
    };
    document.addEventListener('click', close);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('click', close);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  const copyBookingLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(new URL(bookingUrl, window.location.origin).href);
      setCopyLabel('Copied ✓');
    } catch {
      setCopyLabel('Copy failed');
    }
    clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopyLabel('Copy link'), 2200);
  }, [bookingUrl]);

  const go = (view: WorkspaceView) => {
    setSidebarOpen(false);
    onNavigate?.(view);
  };

  const navEntry = (item: (typeof NAV_ITEMS)[number], className: string) =>
    onNavigate ? (
      <button key={item.id} className={className} onClick={() => go(item.id)}>
        <span className="nav-icon">{item.icon}</span> {item.label}
        {item.id === 'jobs' && totalJobs !== undefined && <span className="nav-count">{totalJobs}</span>}
      </button>
    ) : (
      <Link key={item.id} className={className} href={`/?view=${item.id}`}>
        <span className="nav-icon">{item.icon}</span> {item.label}
      </Link>
    );

  const todayLabel = new Intl.DateTimeFormat('en', { weekday: 'short', month: 'short', day: 'numeric' }).format(new Date());

  return (
    <div className="app-shell">
      <aside className={`sidebar${sidebarOpen ? ' open' : ''}`}>
        <Link className="brand" href="/" aria-label="Booktend home">
          <span className="brand-mark">
            <svg viewBox="0 0 40 40" aria-hidden="true">
              <rect x="1" y="1" width="38" height="38" rx="12" fill="currentColor" />
              <path d="M12.5 16h15v14h-15zM16 12.5v6M24 12.5v6M12.5 20h15" fill="none" stroke="#fff" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
              <path d="m17 25 2.5 2.5 5-5" fill="none" stroke="#c9e4b7" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.4" />
            </svg>
          </span>
          <span>
            booktend<span className="brand-period">.</span>
          </span>
        </Link>
        <div className="workspace-label">WORKSPACE</div>
        <nav className="main-nav" aria-label="Main navigation">
          {NAV_ITEMS.filter((item) => !item.ownerOnly || user.role === 'owner').map((item) =>
            navEntry(item, `nav-link${active === item.id ? ' active' : ''}`)
          )}
        </nav>
        <div className="sidebar-bottom">
          <div className="help-card">
            <div className="help-icon">✳</div>
            <strong>Keep your day moving</strong>
            <p>Every booking, one clear place.</p>
            <div className="booking-link-actions">
              <a className="public-page-link" href={bookingUrl} target="_blank" rel="noopener">
                Open page ↗
              </a>
              <button className="copy-link-button" type="button" onClick={() => void copyBookingLink()}>
                {copyLabel}
              </button>
            </div>
          </div>
          <div className="profile-menu-anchor">
            {menuOpen && (
              <div className="profile-menu" role="menu" aria-label="Workspace menu">
                <p className="profile-menu-head">
                  <strong>{workspace.name}</strong>
                  <small>{user.email}</small>
                </p>
                {user.role === 'owner' &&
                  (onNavigate ? (
                    <button className="profile-menu-item" role="menuitem" type="button" onClick={() => { setMenuOpen(false); go('services'); }}>
                      Workspace settings
                    </button>
                  ) : (
                    <Link className="profile-menu-item" role="menuitem" href="/?view=services">
                      Workspace settings
                    </Link>
                  ))}
                {active === 'profile' ? (
                  <Link className="profile-menu-item" role="menuitem" href="/" onClick={() => setMenuOpen(false)} aria-current="page">
                    Dashboard
                  </Link>
                ) : (
                  <Link className="profile-menu-item" role="menuitem" href="/profile" onClick={() => setMenuOpen(false)}>
                    Profile
                  </Link>
                )}
                <a className="profile-menu-item" role="menuitem" href={bookingUrl} target="_blank" rel="noopener">
                  Open booking page
                </a>
                <button className="profile-menu-item" role="menuitem" type="button" onClick={() => void copyBookingLink()}>
                  {copyLabel}
                </button>
                <button
                  className="profile-menu-item profile-menu-signout"
                  role="menuitem"
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onSignOut();
                  }}
                >
                  Sign out
                </button>
              </div>
            )}
            <div className="profile-button">
              <Link
                className={`profile-identity${active === 'profile' ? ' active' : ''}`}
                href="/profile"
                onClick={() => {
                  setSidebarOpen(false);
                  setMenuOpen(false);
                }}
                aria-label={`Open ${user.name}'s profile`}
                aria-current={active === 'profile' ? 'page' : undefined}
              >
                <span className="avatar">{avatar}</span>
                <span className="profile-copy">
                  <strong>{workspace.name}</strong>
                  <small>{user.name}</small>
                </span>
              </Link>
              <button
                className="profile-more"
                type="button"
                ref={menuButtonRef}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((open) => !open)}
                aria-label="Workspace options"
              >
                <span className="more">···</span>
              </button>
            </div>
          </div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <button className="mobile-menu" aria-label="Toggle navigation" onClick={() => setSidebarOpen((open) => !open)}>
            ☰
          </button>
          <div className="breadcrumb">
            <span>Workspace</span>
            <span className="crumb-slash">/</span>
            <strong>{crumb}</strong>
          </div>
          <div className="topbar-actions">
            <span className="today-label">{todayLabel}</span>
            {topbarActions}
            <button className="button button-light sign-out" type="button" onClick={onSignOut}>
              Sign out
            </button>
            <span className="avatar top-avatar">{avatar}</span>
          </div>
        </header>
        {children}
      </main>
    </div>
  );
}
