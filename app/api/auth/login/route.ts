import { newCsrfToken } from '@/server/csrf';
import { Businesses, StaffUsers, type StaffUser } from '@/server/db';
import { defineRoute, HttpError, jsonOk, parseBody } from '@/server/http';
import { verifyPassword } from '@/server/password';
import { enforceRateLimit } from '@/server/ratelimit';
import { loginSchema } from '@/server/schemas';

export const dynamic = 'force-dynamic';

export const POST = defineRoute(async ({ request, session }) => {
  enforceRateLimit('login', request, 8, 15 * 60 * 1000, 'Too many sign-in attempts. Try again later.');
  const input = await parseBody(request, loginSchema);

  const business = await Businesses.findOne({ slug: input.slug }).lean();
  const invalid = new HttpError(401, 'Workspace, email, or password is incorrect.');
  if (!business) throw invalid;

  const owner =
    business.owner?.email === input.email && business.owner._id && (await verifyPassword(input.password, business.owner.passwordHash)) ? business.owner : null;
  const user = owner ? null : await StaffUsers.findOne({ businessId: business._id, email: input.email }).lean<StaffUser>();
  if (!owner && (!user || !(await verifyPassword(input.password, user.passwordHash)))) throw invalid;

  session.userId = owner?._id ?? user!._id;
  session.businessId = business._id;
  const csrfToken = newCsrfToken();
  session.csrfToken = csrfToken;
  await session.save();

  return jsonOk({
    user: { name: owner?.name ?? user!.name, email: owner?.email ?? user!.email, role: owner ? 'owner' : 'staff' },
    business: { name: business.name, slug: business.slug },
    csrfToken
  });
});
