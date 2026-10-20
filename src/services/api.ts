// Client-side API helper. Requests go to the same Next.js origin, where the
// route handlers under app/api serve them, so session cookies are sent
// automatically and there is no CORS. Owns the CSRF token for mutating calls.

let csrfToken = '';

export class ApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

const unsafeMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const method = (options.method ?? 'GET').toUpperCase();
  const isUnsafe = unsafeMethods.has(method);

  if (isUnsafe && !csrfToken) {
    try {
      const { token } = await api<{ token: string }>('/api/csrf');
      csrfToken = token;
    } catch {
      /* proceed and let server respond */
    }
  }

  const doFetch = async (): Promise<Response> => {
    const headers = new Headers(options.headers);
    if (options.body) headers.set('Content-Type', 'application/json');
    if (isUnsafe) headers.set('X-CSRF-Token', csrfToken);
    return fetch(path, { ...options, headers, credentials: 'same-origin' });
  };

  let response = await doFetch();

  // If the client's cached CSRF token fell out of sync with the session (e.g.
  // after hot reload or before StaffFrame's effect ran), refresh it once and retry
  // — unless the caller explicitly passed a custom X-CSRF-Token header.
  const hasExplicitCsrf = new Headers(options.headers).has('X-CSRF-Token');
  if (response.status === 403 && isUnsafe && !hasExplicitCsrf && path !== '/api/csrf') {
    try {
      const { token } = await api<{ token: string }>('/api/csrf');
      if (token && token !== csrfToken) {
        csrfToken = token;
        response = await doFetch();
      }
    } catch {
      /* keep original 403 response */
    }
  }

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  let data: (T & { error?: string }) | null = null;
  if (text) {
    try {
      data = JSON.parse(text) as T & { error?: string };
    } catch {
      throw new ApiError(
        response.status >= 500
          ? `Booktend's service returned an invalid response (HTTP ${response.status}). Check that the API server and MongoDB are running.`
          : `Booktend received an invalid response (HTTP ${response.status}). Refresh the page and try again.`,
        response.status
      );
    }
  }

  if (!response.ok) {
    const message =
      data?.error ||
      (response.status >= 500
        ? `Booktend's service returned an empty response (HTTP ${response.status}). Check that the API server and MongoDB are running.`
        : `The request failed (HTTP ${response.status}). Refresh the page and try again.`);
    throw new ApiError(message, response.status);
  }

  if (!data) throw new ApiError('Booktend received an empty response. Refresh the page and try again.', response.status);
  return data;
}

/** Fetches a fresh CSRF token and caches it for subsequent mutations. */
export async function refreshCsrf(): Promise<void> {
  const { token } = await api<{ token: string }>('/api/csrf');
  csrfToken = token;
}

/** Lets callers set the token returned by login/signup responses. */
export function setCsrfToken(token: string): void {
  csrfToken = token;
}
