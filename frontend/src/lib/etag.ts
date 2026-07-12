/**
 * ETag carry-around helpers.
 *
 * The backend emits `ETag: "\"0\""` on GET and POST responses for
 * activity records.  PATCH requires `If-Match: "\"0\""`.  These helpers
 * centralise the parsing / formatting so the rest of the app never
 * hand-rolls the quoting.
 *
 * ## Storage
 *
 * ETags are kept in a module-level Map keyed by record UUID.  The Map is
 * populated by the API helper after every successful GET / POST / PATCH.
 * TanStack Query handles cache invalidation; this Map is the ETag layer.
 */

/** Raw ETag string as the server sends it, e.g. `"\"3\""`. */
export type RawETag = string;

const store = new Map<string, RawETag>();

/** Persist an ETag received from the server. */
export function setETag(id: string, etag: RawETag): void {
  store.set(id, etag);
}

/**
 * Persist an ETag synthesized from a record's numeric version.
 *
 * The version in the response *body* is the source of truth for the ETag
 * (`ETag: "{version}"`). The ETag response *header* can be stripped or weakened
 * by intermediaries — nginx gzip drops/weakens it when it compresses the JSON —
 * which left `getETag` empty and produced spurious "No ETag cached" errors on
 * the create→patch path. Deriving it from the body makes it deterministic.
 */
export function setETagFromVersion(id: string, version: number): void {
  store.set(id, `"${version}"`);
}

/** Retrieve the stored ETag for an id, or undefined if unknown. */
export function getETag(id: string): RawETag | undefined {
  return store.get(id);
}

/** Clear the stored ETag for an id (e.g. after delete). */
export function clearETag(id: string): void {
  store.delete(id);
}

/**
 * Parse the numeric version from a raw ETag string.
 *
 * `"\"3\""` → 3
 * Returns `null` if the ETag is missing or malformed.
 */
export function etagVersion(etag: RawETag | undefined): number | null {
  if (!etag) return null;
  const n = parseInt(etag.replace(/"/g, ''), 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * Extract the ETag header from a fetch `Response` and store it under `id`.
 * Returns the raw ETag string (or undefined if the header is absent).
 */
export function captureETag(id: string, res: Response): RawETag | undefined {
  const etag = res.headers.get('ETag') ?? undefined;
  if (etag) setETag(id, etag);
  return etag;
}
