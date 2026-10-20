import { Businesses, StaffUsers, type StaffUser } from '@/server/db';
import { defineRoute, HttpError, jsonOk, requireStaff } from '@/server/http';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(async ({ session }) => {
  requireStaff(session);
  const notSignedIn = new HttpError(401, 'Sign in to continue.');

  const business = await Businesses.findOne({ _id: session.businessId }).lean();
  if (!business) throw notSignedIn;

  const owner = business.owner?._id === session.userId ? business.owner : null;
  const user = owner ? null : await StaffUsers.findOne({ _id: session.userId, businessId: session.businessId }, { name: 1, email: 1, role: 1, avatarUrl: 1 }).lean<StaffUser>();
  if (!owner && !user) throw notSignedIn;

  return jsonOk({
    user: owner
      ? { name: owner.name, email: owner.email, role: 'owner', avatarUrl: owner.avatarUrl ?? null }
      : { name: user!.name, email: user!.email, role: 'staff', avatarUrl: user!.avatarUrl ?? null },
    business: { name: business.name, slug: business.slug }
  });
});
