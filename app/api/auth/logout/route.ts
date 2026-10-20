import { NextResponse } from 'next/server';
import { defineRoute, requireStaff } from '@/server/http';

export const dynamic = 'force-dynamic';

export const POST = defineRoute(async ({ session }) => {
  requireStaff(session);
  session.destroy();
  return new NextResponse(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
});
