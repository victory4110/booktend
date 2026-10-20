import { Businesses } from '@/server/db';
import { defineRoute, HttpError, jsonOk, parseBody, requireStaff } from '@/server/http';
import { servicesFor } from '@/server/operations';
import { servicesSchema } from '@/server/schemas';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(async ({ session }) => {
  requireStaff(session);
  const business = await Businesses.collection.findOne(
    { _id: session.businessId } as Record<string, unknown>,
    { projection: { services: 1, publicListed: 1 } }
  );
  if (!business) throw new HttpError(404, 'Workspace not found.');
  return jsonOk({
    services: servicesFor(business as { services?: string[] }),
    publicListed: (business as { publicListed?: boolean }).publicListed !== false
  });
});

export const PUT = defineRoute(async ({ request, session }) => {
  requireStaff(session);
  const input = await parseBody(request, servicesSchema);

  const business = await Businesses.collection.findOne({ _id: session.businessId } as Record<string, unknown>);
  if (!business) throw new HttpError(404, 'Workspace not found.');
  const owner = (business as { owner?: { _id?: string } }).owner;
  if (owner?._id !== session.userId) throw new HttpError(403, 'Only the workspace owner can edit services.');

  const services = input.services
    ? input.services.map((service) => service.trim())
    : servicesFor(business as { services?: string[] });
  const publicListed = input.publicListed ?? ((business as { publicListed?: boolean }).publicListed !== false);
  const updates: Record<string, unknown> = { publicListed };
  if (input.services) updates.services = services;

  await Businesses.collection.updateOne(
    { _id: session.businessId } as Record<string, unknown>,
    { $set: updates }
  );
  return jsonOk({ services, publicListed });
});
