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
  recordId: string;
  sectionCode: string | null;
  projectCode: string | null;
  projectName: string;
  activityName: string;
  activityTypeCode: string;
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
