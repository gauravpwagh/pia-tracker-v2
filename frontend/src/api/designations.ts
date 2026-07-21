/**
 * API helpers for the designation reference catalogue.
 */

import { API_BASE } from '@lib/apiBase';

const BASE = API_BASE;

export interface DesignationDto {
  code: string;
  name: string;
  shortLabel: string;
  category: string;
  isApprovalRole: boolean;
  isDataEntryRole: boolean;
  displayOrder: number;
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

/** GET /api/v1/designations/approval-roles — all designations flagged is_approval_role, for the drawing "Add Approver" picker. */
export async function fetchApprovalRoleDesignations(): Promise<DesignationDto[]> {
  const res = await fetch(`${BASE}/designations/approval-roles`, { credentials: 'include' });
  return handleResponse<DesignationDto[]>(res);
}
