/**
 * API helpers for Sub Division/Taluka details (Land Acquisition).
 *
 * SRP and CALA gazette data is entered once per taluka here instead of per
 * record — records reference a taluka by name and fetch these fields read-only.
 */

import { API_BASE } from '@lib/apiBase';
import { wafSafeFetch } from '@lib/wafSafeFetch';

const BASE = API_BASE;

export interface TalukaDetail {
  id: string;
  projectActivityId: string;
  talukaName: string;
  srpDeclaredInGazOn: string | null;
  srpGazettePublishedOn: string | null;
  srpGazetteNumber: string | null;
  calaReceivedFromStateOn: string | null;
  calaGazettePublishedOn: string | null;
  calaGazetteNumber: string | null;
  /** Once true (via "Create"), the taluka can no longer be edited or deleted. */
  isFinalized: boolean;
  /** Number of records under this activity currently referencing this taluka by name. */
  recordCount: number;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface TalukaDetailWriteInput {
  talukaName: string;
  srpDeclaredInGazOn?: string | null;
  srpGazettePublishedOn?: string | null;
  srpGazetteNumber?: string | null;
  calaReceivedFromStateOn?: string | null;
  calaGazettePublishedOn?: string | null;
  calaGazetteNumber?: string | null;
  /** "Save Draft" omits this (or sends false); "Create" sends true — irreversible once set. */
  finalize?: boolean;
}

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

/** GET /api/v1/activities/{activityId}/talukas */
export async function fetchTalukas(activityId: string): Promise<TalukaDetail[]> {
  const res = await fetch(`${BASE}/activities/${activityId}/talukas`, { credentials: 'include' });
  return handleResponse<TalukaDetail[]>(res);
}

/** POST /api/v1/activities/{activityId}/talukas */
export async function createTaluka(activityId: string, input: TalukaDetailWriteInput): Promise<TalukaDetail> {
  const res = await wafSafeFetch(`${BASE}/activities/${activityId}/talukas`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return handleResponse<TalukaDetail>(res);
}

/** PATCH /api/v1/activities/{activityId}/talukas/{talukaId} — sends If-Match from the taluka's current version. */
export async function updateTaluka(
  activityId: string,
  talukaId: string,
  input: TalukaDetailWriteInput,
  currentVersion: number,
): Promise<TalukaDetail> {
  const res = await wafSafeFetch(`${BASE}/activities/${activityId}/talukas/${talukaId}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'If-Match': `"${currentVersion}"`,
    },
    body: JSON.stringify(input),
  });
  return handleResponse<TalukaDetail>(res);
}

/** DELETE /api/v1/activities/{activityId}/talukas/{talukaId} — 409 if still used by records. */
export async function deleteTaluka(activityId: string, talukaId: string): Promise<void> {
  const res = await wafSafeFetch(`${BASE}/activities/${activityId}/talukas/${talukaId}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `HTTP ${res.status}`);
  }
}
