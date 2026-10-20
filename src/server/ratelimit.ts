import { HttpError } from './errors';

interface Bucket {
  count: number;
  resetAt: number;
}

// In-memory fixed-window limiter. Fine for a single instance; move to a shared
// store (e.g. Redis) before running more than one. Cached on the global object
// so it survives Next.js hot reloads.
const globalForLimiter = globalThis as unknown as { _booktendLimiter?: Map<string, Bucket> };
const buckets = (globalForLimiter._booktendLimiter ??= new Map<string, Bucket>());

export function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  return forwarded?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'local';
}

/** Throws a 429 when the caller exceeds `limit` requests per `windowMs`. */
export function enforceRateLimit(name: string, request: Request, limit: number, windowMs: number, message: string): void {
  const key = `${name}:${clientIp(request)}`;
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  bucket.count += 1;
  if (bucket.count > limit) throw new HttpError(429, message);
}
