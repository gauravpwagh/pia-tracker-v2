/**
 * dashboard.ts — API types and fetch helpers for the KPI dashboard.
 *
 * Endpoint:
 *   GET /api/v1/dashboard/projects/{projectId} — aggregated activity summary
 */

const BASE = '/api/v1';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ActivitySummaryDto {
  activityTypeCode: string;
  totalRecords: number;
  draftCount: number;
  submittedCount: number;
  verifiedCount: number;
  authenticatedCount: number;
  sentBackCount: number;
  updatedAt: string;
}

export interface ProjectDashboardDto {
  projectId: string;
  summaries: ActivitySummaryDto[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function fetchProjectDashboard(projectId: string): Promise<ProjectDashboardDto> {
  const res = await fetch(`${BASE}/dashboard/projects/${projectId}`, {
    credentials: 'include',
  });
  return handleResponse<ProjectDashboardDto>(res);
}
