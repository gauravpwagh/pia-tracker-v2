/**
 * inbox.ts — API types and fetch helpers for GET /api/v1/workflow/inbox.
 *
 * The inbox returns three semantically distinct lists:
 *   - awaiting    items where the current user's role is required to act.
 *   - inProgress  items the user created/owns that are being reviewed upstream.
 *   - slaBreached subset of awaiting where the SLA has been exceeded.
 */

import { API_BASE } from '@lib/apiBase';
const BASE = API_BASE;

export interface InboxItem {
  instanceId: string;
  /** "ACTIVITY_RECORD" for record/section items, "PROJECT" for project-lifecycle approval gates. */
  entityType: 'ACTIVITY_RECORD' | 'PROJECT';
  /** Null for PROJECT items — there's no record yet. */
  recordId: string | null;
  sectionCode: string | null;
  projectId: string;
  /** Often null — project_code is assigned at a later administrative step, not at creation. Navigate by projectId instead. */
  projectCode: string | null;
  projectName: string;
  /** Null for PROJECT items. */
  activityName: string | null;
  /** Null for PROJECT items. */
  activityTypeCode: string | null;
  stateCode: string;
  stateLabel: string;
  /** Whole days since the instance entered its current state. */
  daysPending: number;
  isSlaBreached: boolean;
}

export interface InboxResponse {
  awaiting: InboxItem[];
  inProgress: InboxItem[];
  slaBreached: InboxItem[];
}

export async function fetchInbox(): Promise<InboxResponse> {
  const res = await fetch(`${BASE}/workflow/inbox`, {
    credentials: 'include',
  });
  if (!res.ok) {
    throw new Error(`Failed to load inbox: HTTP ${res.status}`);
  }
  return res.json() as Promise<InboxResponse>;
}
