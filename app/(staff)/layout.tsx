import '@/styles/dashboard.css';
import '@/styles/skeleton.css';
import StaffFrame from '@/components/StaffFrame';
import { loadStaffAccount } from '@/server/account';
import { getSession } from '@/server/session';

// The signed-in account is resolved per request, so the chrome in the first HTML
// response already shows the sidebar instead of flashing a loading state.
export const dynamic = 'force-dynamic';

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  const account = await loadStaffAccount(session);
  return (
    <StaffFrame account={account} csrfToken={session.csrfToken ?? ''}>
      {children}
    </StaffFrame>
  );
}
