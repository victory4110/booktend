import { type Job, Jobs } from '@/server/db';
import { todayInBusinessTimezone } from '@/server/constants';
import { defineRoute, jsonOk, requireStaff } from '@/server/http';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(async ({ session }) => {
  requireStaff(session);
  const businessId = session.businessId;
  const [counts, recent, today] = await Promise.all([
    Jobs.aggregate<{ _id: string; count: number }>([{ $match: { businessId } }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    Jobs.find({ businessId }).sort({ createdAt: -1 }).limit(8).lean<Job[]>(),
    Jobs.find({ businessId, date: todayInBusinessTimezone(), status: { $ne: 'Completed' } }).sort({ date: 1 }).limit(6).lean<Job[]>()
  ]);
  return jsonOk({ counts: Object.fromEntries(counts.map((row) => [row._id, row.count])), recent, today });
});
