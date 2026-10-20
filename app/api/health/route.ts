import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/server/db';
import { countFailedMail, countPendingMail } from '@/server/mail';

export const dynamic = 'force-dynamic';
const noStore = { 'Cache-Control': 'no-store' };

export async function GET(): Promise<NextResponse> {
  try {
    const connection = await connectToDatabase();
    await connection.connection.db!.command({ ping: 1 });
    const [failedEmails, pendingEmails] = await Promise.all([countFailedMail(), countPendingMail()]);
    return NextResponse.json(
      { status: failedEmails ? 'degraded' : 'ok', failedNotifications: failedEmails, pendingNotifications: pendingEmails },
      { headers: noStore }
    );
  } catch {
    return NextResponse.json({ status: 'unavailable' }, { status: 503, headers: noStore });
  }
}
