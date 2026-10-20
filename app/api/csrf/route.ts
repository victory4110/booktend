import { ensureCsrfToken } from '@/server/csrf';
import { defineRoute, jsonOk } from '@/server/http';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(async ({ session }) => {
  const token = await ensureCsrfToken(session);
  return jsonOk({ token });
});
