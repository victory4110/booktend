import { randomUUID } from 'node:crypto';
import { newCsrfToken } from '@/server/csrf';
import { type Business, Businesses } from '@/server/db';
import { defineRoute, HttpError, jsonOk, parseBody } from '@/server/http';
import { hashPassword } from '@/server/password';
import { enforceRateLimit } from '@/server/ratelimit';
import { signupSchema } from '@/server/schemas';

export const dynamic = 'force-dynamic';

export const POST = defineRoute(async ({ request, session }) => {
  enforceRateLimit('signup', request, 5, 60 * 60 * 1000, 'Too many workspace sign-ups. Try again later.');
  const input = await parseBody(request, signupSchema);

  try {
    new Intl.DateTimeFormat('en', { timeZone: input.timezone }).format(new Date());
  } catch {
    throw new HttpError(400, 'Choose a valid time zone.');
  }

  const passwordHash = await hashPassword(input.password);
  const now = new Date();
  const ownerId = randomUUID();
  const business: Business = {
    _id: randomUUID(),
    name: input.businessName,
    slug: input.slug,
    timezone: input.timezone,
    owner: { _id: ownerId, email: input.email, name: input.ownerName, passwordHash, createdAt: now },
    notificationEmail: input.email,
    createdAt: now
  };

  try {
    await Businesses.create(business);
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && (error as { code?: number }).code === 11000) {
      throw new HttpError(409, 'That workspace URL or email is already in use.');
    }
    throw error;
  }

  session.userId = ownerId;
  session.businessId = business._id;
  const csrfToken = newCsrfToken();
  session.csrfToken = csrfToken;
  await session.save();

  return jsonOk({ user: { name: input.ownerName, email: input.email, role: 'owner' }, business: { name: business.name, slug: business.slug }, csrfToken }, 201);
});
