import { cookies } from 'next/headers';
import { getIronSession, type IronSession, type SessionOptions } from 'iron-session';

export interface SessionData {
  userId?: string;
  businessId?: string;
  csrfToken?: string;
}

const production = process.env.NODE_ENV === 'production';

function options(): SessionOptions {
  const password = process.env.SESSION_SECRET;
  if (!password || password.length < 32) throw new Error('SESSION_SECRET must contain at least 32 characters.');
  return {
    password,
    cookieName: production ? '__Host-booktend' : 'booktend_session',
    cookieOptions: {
      httpOnly: true,
      secure: production,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 12
    }
  };
}

export async function getSession(): Promise<IronSession<SessionData>> {
  return getIronSession<SessionData>(await cookies(), options());
}
