/**
 * API helpers for activity records.
 *
 * All calls carry credentials (session cookie) and handle ETag capture /
 * If-Match dispatch automatically so callers never need to touch HTTP headers.
 */

import { captureETag, getETag } from '@lib/etag';

const BASE = '/api/v1';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ActivityRecordDetail {
  id: string;
  projectActivityId: string;
  formDefinitionId: string;
  schemaVersionAtSave: number;
  /** Full form data — empty object `{}` at creation. */
  dataJson: Record<string, unknown>;
  recordState: string;
  recordSubtype: string | null;
  /** User-supplied display name, or null for records without a name. */
  name: string | null;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface ActivityDetail {
  id: string;
  projectId: string;
  activityTypeCode: string;
  name: string;
  scopeNotes: string | null;
  targetCompletionDate: string | null;
  primaryDyceUserId: string;
  status: string;
  defaultFormDefinitionId: string | null;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
  version: number;
}

// ── Shared ────────────────────────────────────────────────────────────────────

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      message = body?.message ?? body?.detail ?? message;
    } catch {
      // ignore parse error — original status message is fine
    }
    const err = new Error(message) as Error & { status: number };
    err.status = res.status;
    throw err;
  }
  return res.json() as Promise<T>;
}

// ── Activity records ──────────────────────────────────────────────────────────

/**
 * GET /api/v1/activity-records/{recordId}
 *
 * Captures the ETag from the response header and stores it in the ETag store
 * keyed by `recordId`.
 */
export async function fetchRecord(recordId: string): Promise<ActivityRecordDetail> {
  const res = await fetch(`${BASE}/activity-records/${recordId}`, {
    credentials: 'include',
  });
  captureETag(recordId, res);
  return handleResponse<ActivityRecordDetail>(res);
}

/**
 * POST /api/v1/activities/{activityId}/records
 *
 * Creates an empty record and captures the ETag from the 201 response.
 */
export async function createRecord(
  activityId: string,
  recordSubtype?: string,
  name?: string,
): Promise<ActivityRecordDetail> {
  const payload: Record<string, unknown> = {};
  if (recordSubtype) payload.recordSubtype = recordSubtype;
  if (name) payload.name = name;
  const body = JSON.stringify(payload);
  const res = await fetch(`${BASE}/activities/${activityId}/records`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
  const record = await handleResponse<ActivityRecordDetail>(res);
  captureETag(record.id, res);
  return record;
}

/**
 * PATCH /api/v1/activity-records/{recordId}
 *
 * Sends `If-Match` from the ETag store.  If no ETag is stored (should not
 * happen in normal flow), throws a descriptive error rather than sending a
 * potentially corrupt write.
 *
 * Captures the new ETag from the 200 response.
 *
 * @throws {Error & { status: 409 }} on concurrent-edit conflict.
 */
export async function patchRecord(
  recordId: string,
  dataJson: Record<string, unknown>,
): Promise<ActivityRecordDetail> {
  const etag = getETag(recordId);
  if (etag === undefined) {
    throw new Error(`No ETag cached for record ${recordId}. Fetch the record first.`);
  }

  const res = await fetch(`${BASE}/activity-records/${recordId}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'If-Match': etag,
    },
    body: JSON.stringify({ dataJson }),
  });

  const updated = await handleResponse<ActivityRecordDetail>(res);
  captureETag(recordId, res);
  return updated;
}

/**
 * GET /api/v1/activities/{activityId}/records
 */
export async function listRecords(activityId: string): Promise<ActivityRecordDetail[]> {
  const res = await fetch(`${BASE}/activities/${activityId}/records`, {
    credentials: 'include',
  });
  return handleResponse<ActivityRecordDetail[]>(res);
}

/**
 * DELETE /api/v1/activity-records/{recordId}
 * Soft-deletes a non-authenticated record.
 * Requires ACTIVITY_RECORD.DELETE.OWN permission.
 * Returns 409 if the record is AUTHENTICATED.
 */
export async function deleteRecord(recordId: string): Promise<void> {
  const res = await fetch(`${BASE}/activity-records/${recordId}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `HTTP ${res.status}`);
  }
}

// ── Drawing approver checklist ────────────────────────────────────────────────

export interface DrawingApproverDto {
  id: string;
  approvalDesignationCode: string;
  /** Human-readable designation name, e.g. "Senior Divisional Engineer". */
  designationName: string;
  position: number;
  /** ISO date string "YYYY-MM-DD" or null if not yet approved. */
  approvedOn: string | null;
  remarks: string | null;
}

export interface DrawingApproverListResponse {
  recordId: string;
  /** True when all slots have an approvedOn date. */
  allApproved: boolean;
  approvers: DrawingApproverDto[];
}

export async function fetchDrawingApprovers(recordId: string): Promise<DrawingApproverListResponse> {
  const res = await fetch(`${BASE}/activity-records/${recordId}/drawing-approvers`, { credentials: 'include' });
  return handleResponse<DrawingApproverListResponse>(res);
}

export async function updateDrawingApproval(
  recordId: string,
  approverId: string,
  approvedOn: string | null,
  remarks: string | null,
): Promise<DrawingApproverDto> {
  const res = await fetch(`${BASE}/activity-records/${recordId}/drawing-approvers/${approverId}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ approvedOn, remarks }),
  });
  return handleResponse<DrawingApproverDto>(res);
}

export async function addDrawingApprover(
  recordId: string,
  designationCode: string,
  position?: number,
): Promise<DrawingApproverDto> {
  const res = await fetch(`${BASE}/activity-records/${recordId}/drawing-approvers`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ designationCode, position }),
  });
  return handleResponse<DrawingApproverDto>(res);
}

export async function removeDrawingApprover(recordId: string, approverId: string): Promise<void> {
  const res = await fetch(`${BASE}/activity-records/${recordId}/drawing-approvers/${approverId}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `HTTP ${res.status}`);
  }
}

/**
 * GET /api/v1/activities/{activityId}
 */
export async function fetchActivity(activityId: string): Promise<ActivityDetail> {
  const res = await fetch(`${BASE}/activities/${activityId}`, {
    credentials: 'include',
  });
  return handleResponse<ActivityDetail>(res);
}
