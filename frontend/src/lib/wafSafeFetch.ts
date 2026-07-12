/**
 * TEMPORARY WAF workaround — see HANDOVER.md / docs/deployment.md.
 *
 * The network path in front of the beta VM has a WAF that blocks PATCH/PUT/DELETE
 * (confirmed: it returns HTTP 200 with a rejection page instead of reaching the app).
 * GET and POST pass through fine.
 *
 * When enabled (`VITE_WAF_METHOD_OVERRIDE=true`), this wrapper resends PATCH/PUT/DELETE
 * as `POST ...?_method=<verb>` instead. The backend's Spring `HiddenHttpMethodFilter`
 * (see application.yml `spring.mvc.hiddenmethod.filter.enabled`) reads `_method` and
 * routes the request as the real verb, so controllers/security/ETag handling are
 * unaffected.
 *
 * To revert once the network team allows PATCH/PUT/DELETE through directly: unset
 * `VITE_WAF_METHOD_OVERRIDE` (or set it to `false`). No further code changes needed.
 */

const OVERRIDE_ENABLED = (import.meta.env.VITE_WAF_METHOD_OVERRIDE as string) === 'true';
const OVERRIDDEN_METHODS = new Set(['PATCH', 'PUT', 'DELETE']);

export function wafSafeFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const method = (init.method ?? 'GET').toUpperCase();

  if (!OVERRIDE_ENABLED || !OVERRIDDEN_METHODS.has(method)) {
    return fetch(url, init);
  }

  const separator = url.includes('?') ? '&' : '?';
  const overriddenUrl = `${url}${separator}_method=${method}`;

  return fetch(overriddenUrl, { ...init, method: 'POST' });
}
