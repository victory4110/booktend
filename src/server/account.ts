import { Businesses, connectToDatabase, StaffUsers, type StaffUser } from './db';
import type { SessionData } from './session';
import type { SessionUser, Workspace } from '@/lib/types';

export interface StaffAccount {
  user: SessionUser;
  workspace: Workspace;
}

/**
 * Resolves the account behind a session: the embedded business owner or one of
 * the business's staff users. Returns null when the session points at a user or
 * workspace that no longer exists, which callers treat as signed out.
 *
 * Used by both the staff layout (which renders the app chrome on the server) and
 * GET /api/auth/me, so the two can never disagree about who is signed in.
 */
export async function loadStaffAccount(session: SessionData): Promise<StaffAccount | null> {
  if (!session.userId || !session.businessId) return null;

  await connectToDatabase();
  const business = await Businesses.findOne({ _id: session.businessId }).lean();
  if (!business) return null;

  const owner = business.owner?._id === session.userId ? business.owner : null;
  const staff = owner
    ? null
    : await StaffUsers.findOne({ _id: session.userId, businessId: session.businessId }, { name: 1, email: 1, role: 1, avatarUrl: 1 }).lean<StaffUser>();
  if (!owner && !staff) return null;

  return {
    user: owner
      ? { name: owner.name, email: owner.email, role: 'owner', avatarUrl: owner.avatarUrl ?? null }
      : { name: staff!.name, email: staff!.email, role: staff!.role, avatarUrl: staff!.avatarUrl ?? null },
    workspace: { name: business.name, slug: business.slug }
  };
}
