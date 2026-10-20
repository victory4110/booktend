import { type Job, Jobs } from '@/server/db';
import { defineRoute, HttpError, jsonOk, requireStaff } from '@/server/http';

export const dynamic = 'force-dynamic';

/** A customer has no record of its own; it is the jobs that share an email. */
const HISTORY_LIMIT = 200;

interface CustomerAggregate {
  customer: string;
  email: string;
  phone: string;
  lastService: string;
  count: number;
  firstJobAt: Date;
  lastJobAt: Date;
}

export const GET = defineRoute<{ email: string }>(async ({ session, params }) => {
  requireStaff(session);
  const email = decodeURIComponent(params.email ?? '').trim().toLowerCase();
  if (!email) throw new HttpError(400, 'A customer email is required.');

  const [summary] = await Jobs.aggregate<CustomerAggregate>([
    { $match: { businessId: session.businessId, email } },
    { $sort: { date: -1, createdAt: -1 } },
    {
      $group: {
        _id: '$email',
        customer: { $first: '$customer' },
        email: { $first: '$email' },
        phone: { $first: '$phone' },
        lastService: { $first: '$service' },
        count: { $sum: 1 },
        firstJobAt: { $min: '$createdAt' },
        lastJobAt: { $max: '$createdAt' }
      }
    }
  ]);
  if (!summary) throw new HttpError(404, 'No bookings were found for that customer.');

  const jobs = await Jobs.find({ businessId: session.businessId, email })
    .sort({ date: -1, createdAt: -1 })
    .limit(HISTORY_LIMIT)
    .lean<Job[]>();

  return jsonOk({
    customer: {
      customer: summary.customer,
      email: summary.email,
      phone: summary.phone,
      lastService: summary.lastService,
      count: summary.count,
      firstBookingAt: summary.firstJobAt,
      lastBookingAt: summary.lastJobAt
    },
    jobs
  });
});
