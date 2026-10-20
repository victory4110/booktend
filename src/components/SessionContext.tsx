'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { WorkspaceView } from '@/components/AppShell';
import type { SessionUser, Workspace } from '@/lib/types';

export interface SessionValue {
  user: SessionUser;
  workspace: Workspace;
  /** Which dashboard tab is showing. Lives here so the sidebar highlight survives navigation. */
  view: WorkspaceView;
  setView: (view: WorkspaceView) => void;
  /** Job total for the sidebar badge. Published by the dashboard once it has loaded. */
  jobCount: number | undefined;
  setJobCount: (count: number) => void;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ value, children }: { value: SessionValue; children: ReactNode }) {
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

/** Reads the signed-in account. Only valid below StaffFrame, which guarantees one. */
export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used inside the staff layout.');
  return value;
}
