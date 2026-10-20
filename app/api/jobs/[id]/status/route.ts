import { type Job, Jobs } from '@/server/db';
import { defineRoute, HttpError, jsonOk, parseBody, requireStaff } from '@/server/http';
import { statusSchema } from '@/server/schemas';

export const dynamic = 'force-dynamic';

export const PATCH = defineRoute<{ id: string }>(async ({ request, session, params }) => {
  requireStaff(session);
  const input = await parseBody(request, statusSchema);

  const now = new Date();
  const job = await Jobs.findOneAndUpdate(
    { _id: params.id, businessId: session.businessId },
    { $set: { status: input.status, updatedAt: now }, $push: { statusHistory: { status: input.status, changedAt: now, changedBy: session.userId! } } },
    { returnDocument: 'after' }
  ).lean<Job>();
  if (!job) throw new HttpError(404, 'Job not found.');
  return jsonOk({ job });
});
