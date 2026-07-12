/**
 * Global 401 handler for session timeout.
 *
 * There is no central API client (60+ `fetch` call sites across `src/api/*`), so
 * rather than thread a wrapper through every one, we install a single `window.fetch`
 * interceptor once at startup. When any `/api/v1` request comes back 401 — i.e. the
 * session has expired mid-use — we clear the local user and hard-redirect to /login.
 *
 * Deliberately excluded:
 *   - the session probe `/auth/me` (a 401 there just means "not logged in yet"; the
 *     normal RequireAuth flow handles first load — we don't want a hard reload there).
 *   - requests made while already on the /login route (avoids redirect loops).
 */

import { useAuthStore } from '@stores/authStore';

let installed = false;
let redirecting = false;

export function installAuthInterceptor(): void {
  if (installed) return;
  installed = true;

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const res = await originalFetch(input, init);
    if (res.status === 401 && shouldHandle(urlOf(input))) handleUnauthorized();
    return res;
  };
}

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function shouldHandle(url: string): boolean {
  return url.includes('/api/v1') && !url.includes('/auth/me');
}

function handleUnauthorized(): void {
  if (redirecting) return;
  if (window.location.pathname.startsWith('/login')) return;
  redirecting = true;
  // Clear the cached principal so the app doesn't briefly render as logged-in.
  useAuthStore.setState({ currentUser: null });
  // Full-document navigation (not client routing) — guarantees a clean slate.
  window.location.assign('/login');
}
