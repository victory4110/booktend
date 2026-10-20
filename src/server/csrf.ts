import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { SessionData } from './session';
import { HttpError } from './errors';

/** Returns the session CSRF token, creating and persisting one if absent. */
export async function ensureCsrfToken(session: SessionData & { save: () => Promise<void> }): Promise<string> {
  if (!session.csrfToken) {
    session.csrfToken = randomBytes(32).toString('base64url');
    await session.save();
  }
  return session.csrfToken;
}

/** Double-submit CSRF check for state-changing requests. */
export function assertCsrf(request: Request, session: SessionData): void {
  const sent = request.headers.get('x-csrf-token');
  const expected = session.csrfToken;
  if (!sent || !expected) throw new HttpError(403, 'Refresh the page and try again.');
  const sentBytes = Buffer.from(sent);
  const expectedBytes = Buffer.from(expected);
  if (sentBytes.length !== expectedBytes.length || !timingSafeEqual(sentBytes, expectedBytes)) {
    throw new HttpError(403, 'Refresh the page and try again.');
  }
}

export function newCsrfToken(): string {
  return randomBytes(32).toString('base64url');
}
