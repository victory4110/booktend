import { Businesses, type Job, Jobs } from '@/server/db';
    import { todayInBusinessTimezone } from '@/server/constants';
    import { decodeJobCursor, encodeJobCursor, JOB_SORT, jobCursorFilter } from '@/server/cursor';
    import { defineRoute, HttpError, jsonOk, parseBody, requireStaff } from '@/server/http';
    import { insertBooking, servicesFor } from '@/server/operations';
    import { queueBookingEmails } from '@/server/mail';
    import { bookingSchema } from '@/server/schemas';
    import { JOB_STATUSES } from '@/server/constants';
    
    export const dynamic = 'force-dynamic';
    
    export const POST = defineRoute(async ({ request, session }) => {
      requireStaff(session);
      const input = await parseBody(request, bookingSchema);
    
      const business = await Businesses.findOne({ _id: session.businessId }).lean();
      if (!business) throw new HttpError(404, 'Workspace not found.');
      if (!servicesFor(business).includes(input.service)) throw new HttpError(400, 'Choose a service currently offered by this business.');
      if (input.date < todayInBusinessTimezone(business.timezone)) throw new HttpError(400, 'Choose today or a future date.');
    
      const job = await insertBooking(session.businessId!, input, session.userId!);
      const notificationsQueued = await queueBookingEmails(job, business);
      return jsonOk({ job, notificationsQueued }, 201);
    });
    
    export const GET = defineRoute(async ({ request, session }) => {
      requireStaff(session);
      const url = new URL(request.url);
      const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 100, 1), 200);
      const cursorParam = url.searchParams.get('cursor');
      const status = url.searchParams.get('status');
    
      const query: Record<string, unknown> = { businessId: session.businessId };
      if (status && (JOB_STATUSES as readonly string[]).includes(status)) query.status = status;
      if (cursorParam) {
        const cursor = decodeJobCursor(cursorParam);
        if (!cursor) throw new HttpError(400, 'That page of jobs is no longer valid. Refresh the list and try again.');
        Object.assign(query, jobCursorFilter(cursor));
      }
    
      const found = await Jobs.find(query).sort(JOB_SORT).limit(limit + 1).lean<Job[]>();
      const hasMore = found.length > limit;
      const page = found.slice(0, limit);
      const last = page.at(-1);
      return jsonOk({ jobs: page, nextCursor: hasMore && last ? encodeJobCursor(last) : null });
    });
    