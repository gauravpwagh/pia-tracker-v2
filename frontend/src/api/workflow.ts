/**
 * Workflow state and action API helpers.
 *
 * Endpoints:
 *   GET  /api/v1/activity-records/{id}/workflow
 *   POST /api/v1/activity-records/{id}/submit
 *   POST /api/v1/activity-records/{id}/verify
 *   POST /api/v1/activity-records/{id}/authenticate
 *   POST /api/v1/activity-records/{id}/send-back
 *   POST /api/v1/activity-records/{id}/resubmit
 *   POST /api/v1/activity-records/{id}/re-verify
 */

const BASE = '/api/v1/activity-records';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SectionWorkflowState {
  instanceId: string;
  sectionCode: string | null;
  currentStateCode: string;
  currentStateLabel: string;
  isTerminal: boolean;
  isSlaBreached: boolean;
  enteredStateAt: string;
  /** Action codes the calling user may perform right now. */
  availableActions: string[];
}

export interface RecordWorkflowStateResponse {
  recordId: string;
  instances: SectionWorkflowState[];
}

export interface WorkflowActionRequest {
  sectionCode?: string | null;
  comment?: string | null;
}

export type WorkflowActionCode =
  | 'submit'
  | 'verify'
  | 'authenticate'
  | 'send-back'
  | 'resubmit'
  | 're-verify';

export interface ActivityWorkflowActionResult {
  totalRecords: number;
  succeeded: number;
  failed: number;
  skipped: number;
}

// ── API calls ─────────────────────────────────────────────────────────────────

export async function fetchWorkflowState(
  recordId: string,
): Promise<RecordWorkflowStateResponse> {
  const resp = await fetch(`${BASE}/${recordId}/workflow`, {
    credentials: 'include',
  });
  if (!resp.ok) throw new Error(`Workflow state fetch failed: ${resp.status}`);
  return resp.json() as Promise<RecordWorkflowStateResponse>;
}

/**
 * GET /api/v1/activities/{activityId}/workflow
 * Returns the activity-level workflow state (independent of records).
 */
export async function fetchActivityWorkflowState(
  activityId: string,
): Promise<SectionWorkflowState> {
  const resp = await fetch(`/api/v1/activities/${activityId}/workflow`, {
    credentials: 'include',
  });
  if (!resp.ok) throw new Error(`Activity workflow state fetch failed: ${resp.status}`);
  return resp.json() as Promise<SectionWorkflowState>;
}

/**
 * POST /api/v1/activities/{activityId}/{action}
 * Performs a workflow action on the activity itself (submit / verify / authenticate / …).
 */
export async function performActivityAction(
  activityId: string,
  action: 'submit' | 'verify' | 'authenticate' | 'send-back' | 'resubmit' | 're-verify',
  comment?: string,
): Promise<SectionWorkflowState> {
  const resp = await fetch(`/api/v1/activities/${activityId}/${action}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ comment: comment ?? null }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(text || `Activity action '${action}' failed: ${resp.status}`);
  }
  return resp.json() as Promise<SectionWorkflowState>;
}

/**
 * POST /api/v1/activities/{activityId}/workflow-action
 * Applies a workflow action to ALL eligible records (and sections) in the activity.
 */
export async function performActivityWorkflowAction(
  activityId: string,
  action: string,
  comment?: string,
): Promise<ActivityWorkflowActionResult> {
  const resp = await fetch(`/api/v1/activities/${activityId}/workflow-action`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, comment: comment ?? null }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(text || `Activity workflow action failed: ${resp.status}`);
  }
  return resp.json() as Promise<ActivityWorkflowActionResult>;
}

export async function performWorkflowAction(
  recordId: string,
  action: WorkflowActionCode,
  body: WorkflowActionRequest = {},
): Promise<SectionWorkflowState> {
  const resp = await fetch(`${BASE}/${recordId}/${action}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(text || `Workflow action '${action}' failed: ${resp.status}`);
  }
  return resp.json() as Promise<SectionWorkflowState>;
}
