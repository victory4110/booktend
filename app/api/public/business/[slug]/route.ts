import { Businesses } from '@/server/db';
import { defineRoute, HttpError, jsonOk } from '@/server/http';
import { servicesFor } from '@/server/operations';

export const dynamic = 'force-dynamic';

export const GET = defineRoute<{ slug: string }>(async ({ params }) => {
  const business = await Businesses.findOne({ slug: params.slug }, { name: 1, slug: 1, timezone: 1, services: 1 }).lean();
  if (!business) throw new HttpError(404, 'This booking page could not be found.');
  return jsonOk({ name: business.name, slug: business.slug, timezone: business.timezone || 'Africa/Lagos', services: servicesFor(business) });
});
