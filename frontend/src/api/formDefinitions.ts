/**
 * API helpers for form definitions.
 *
 * The by-id endpoint (`/api/v1/form-definitions/by-id/{id}`) is gated on
 * `ACTIVITY_RECORD.READ.OWN` — the permission that Dy CE/C, Nodal Dy CE/C,
 * and CE/C all hold.  This lets them fetch the schema to render RJSF without
 * needing the admin-level `FORM_DEFINITION.READ`.
 */

import { API_BASE } from '@lib/apiBase';
const BASE = API_BASE;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface FormDefinitionDetail {
  id: string;
  code: string;
  version: number;
  label: string;
  activityTypeCode: string;
  /** JSON Schema object — passed directly to RJSF as `schema`. */
  schemaJson: Record<string, unknown>;
  /** RJSF ui-schema object — passed directly to RJSF as `uiSchema`. */
  uiSchemaJson: Record<string, unknown>;
  /** Ordered section codes; empty → no section nav. */
  sectionCodes: string[];
  isActive: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      message = body?.message ?? body?.detail ?? message;
    } catch {
      // ignore
    }
    const err = new Error(message) as Error & { status: number };
    err.status = res.status;
    throw err;
  }
  return res.json() as Promise<T>;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/form-definitions/by-id/{id}
 *
 * Fetches the full form definition (schema + ui-schema + section codes) by
 * UUID.  Used by the Record Edit Page to load the RJSF rendering spec.
 *
 * Requires `ACTIVITY_RECORD.READ.OWN` (not admin-only `FORM_DEFINITION.READ`).
 */
export async function fetchFormDefinitionById(id: string): Promise<FormDefinitionDetail> {
  const res = await fetch(`${BASE}/form-definitions/by-id/${id}`, {
    credentials: 'include',
  });
  return handleResponse<FormDefinitionDetail>(res);
}
