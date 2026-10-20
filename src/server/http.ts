import { NextResponse } from 'next/server';
import { z, type ZodType } from 'zod';
import { assertCsrf } from './csrf';
import { connectToDatabase } from './db';
import { HttpError } from './errors';
import { getSession, type SessionData } from './session';
import type { IronSession } from 'iron-session';

export { HttpError } from './errors';

const noStore = { 'Cache-Control': 'no-store' };
const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS']);
const production = process.env.NODE_ENV === 'production';

export function jsonOk<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status, headers: noStore });
}

export function jsonError(error: string, status: number, details?: unknown): NextResponse {
  return NextResponse.json(details !== undefined ? { error, details } : { error }, { status, headers: noStore });
}

/** Parses and validates the JSON request body, throwing a 400 on failure. */
export async function parseBody<T>(request: Request, schema: ZodType<T>): Promise<T> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = undefined;
  }
  const result = schema.safeParse(body);
  if (!result.success) throw new HttpError(400, 'Check the highlighted fields and try again.', z.treeifyError(result.error));
  return result.data;
}

export function requireStaff(session: SessionData): void {
  if (!session.userId || !session.businessId) throw new HttpError(401, 'Sign in to continue.');
}

export interface RouteContext<P> {
  params: P;
  session: IronSession<SessionData>;
  request: Request;
}

type Handler<P> = (context: RouteContext<P>) => Promise<NextResponse> | NextResponse;

/**
 * Wraps a route handler with the cross-cutting behavior the Nest app applied
 * globally: DB connection, session loading, CSRF checks on unsafe methods,
 * `Cache-Control: no-store`, and `{ error }` error formatting.
 */
export function defineRoute<P = Record<string, never>>(handler: Handler<P>, opts: { csrf?: boolean } = {}) {
  return async (request: Request, context: { params: Promise<P> }): Promise<NextResponse> => {
    try {
      await connectToDatabase();
      const session = await getSession();
      if ((opts.csrf ?? true) && !safeMethods.has(request.method.toUpperCase())) assertCsrf(request, session);
      const params = (context?.params ? await context.params : {}) as P;
      return await handler({ params, session, request });
    } catch (error) {
      if (error instanceof HttpError) return jsonError(error.message, error.status, error.details);
      console.error(error instanceof Error ? error.message : 'Unknown server error');
      return jsonError(production ? 'Something went wrong. Please try again.' : error instanceof Error ? error.message : 'Server error', 500);
    }
  };
}
