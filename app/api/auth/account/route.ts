import { NextResponse } from 'next/server';
import { Businesses, Jobs, MailOutbox, StaffUsers } from '@/server/db';
import { defineRoute, HttpError, requireStaff } from '@/server/http';

export const dynamic = 'force-dynamic';

export const DELETE = defineRoute(async ({ session }) => {
  requireStaff(session);

  const business = await Businesses.findOne({ _id: session.businessId });
  if (!business) throw new HttpError(404, 'Workspace not found.');

  const isOwner = business.owner?._id === session.userId;
  if (isOwner) {
    await Promise.all([
      Jobs.deleteMany({ businessId: session.businessId }),
      StaffUsers.deleteMany({ businessId: session.businessId }),
      MailOutbox.deleteMany({ businessId: session.businessId }),
      Businesses.deleteOne({ _id: session.businessId })
    ]);
  } else {
    await StaffUsers.deleteOne({ _id: session.userId, businessId: session.businessId });
  }

  session.destroy();
  return new NextResponse(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
});
