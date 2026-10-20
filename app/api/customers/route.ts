import { Jobs } from '@/server/db';
import { defineRoute, jsonOk, requireStaff } from '@/server/http';

export const dynamic = 'force-dynamic';

interface CustomerSummary {
  _id: string;
  customer: string;
  email: string;
  phone: string;
  lastService: string;
  count: number;
}

export const GET = defineRoute(async ({ session }) => {
  requireStaff(session);
  const customers = await Jobs.aggregate<CustomerSummary>([
    { $match: { businessId: session.businessId } },
    { $sort: { date: -1, createdAt: -1 } },
    { $group: { _id: '$email', customer: { $first: '$customer' }, email: { $first: '$email' }, phone: { $first: '$phone' }, lastService: { $first: '$service' }, count: { $sum: 1 } } },
    { $sort: { customer: 1 } }
  ]);
  return jsonOk({ customers });
});
