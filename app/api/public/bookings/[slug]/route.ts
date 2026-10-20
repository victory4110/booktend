import { Businesses } from '@/server/db';
import { todayInBusinessTimezone } from '@/server/constants';
import { defineRoute, HttpError, jsonOk, parseBody } from '@/server/http';
import { queueBookingEmails } from '@/server/mail';
import { insertBooking, servicesFor } from '@/server/operations';
import { enforceRateLimit } from '@/server/ratelimit';
import { bookingSchema } from '@/server/schemas';

export const dynamic = 'force-dynamic';

export const POST = defineRoute<{ slug: string }>(async ({ request, params }) => {
  enforceRateLimit('bookings', request, 12, 60 * 60 * 1000, 'Too many booking requests. Please try again later.');
  const input = await parseBody(request, bookingSchema);

  const business = await Businesses.findOne({ slug: params.slug }).lean();
  if (!business) throw new HttpError(404, 'This booking page could not be found.');
  if (!servicesFor(business).includes(input.service)) throw new HttpError(400, 'Choose a service currently offered by this business.');
  if (input.date < todayInBusinessTimezone(business.timezone)) throw new HttpError(400, 'Choose today or a future date.');

  const job = await insertBooking(business._id, input, 'customer');
  const notificationsQueued = await queueBookingEmails(job, business);
  const message = notificationsQueued
    ? 'Your request has been sent. The team will be in touch soon.'
    : 'Your request is saved. Please contact the business directly if you need a quick response.';
  return jsonOk({ message, reference: job._id }, 201);
});
