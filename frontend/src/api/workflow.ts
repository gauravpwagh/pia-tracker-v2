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
