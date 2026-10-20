import { Businesses, StaffUsers } from '@/server/db';
import { defineRoute, HttpError, jsonOk, parseBody, requireStaff } from '@/server/http';
import { avatarSchema } from '@/server/schemas';

export const dynamic = 'force-dynamic';

export const POST = defineRoute(async ({ request, session }) => {
  requireStaff(session);
  const { avatar } = await parseBody(request, avatarSchema);

  const business = await Businesses.findOne({ _id: session.businessId });
  if (!business) throw new HttpError(404, 'Workspace not found.');

  const isOwner = business.owner?._id === session.userId;
  if (isOwner) {
    await Businesses.updateOne(
      { _id: session.businessId },
      avatar ? { $set: { 'owner.avatarUrl': avatar } } : { $unset: { 'owner.avatarUrl': 1 } }
    );
  } else {
    await StaffUsers.updateOne(
      { _id: session.userId, businessId: session.businessId },
      avatar ? { $set: { avatarUrl: avatar } } : { $unset: { avatarUrl: 1 } }
    );
  }

  return jsonOk({ ok: true, avatarUrl: avatar ?? null });
});
