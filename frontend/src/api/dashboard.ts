/**
 * dashboard.ts — API types and fetch helpers for all dashboard scopes.
 *
 * Endpoints:
 *   GET /api/v1/dashboard/zone                             — zone scope (principal-filtered)
 *   GET /api/v1/dashboard/pan-india                        — PAN India scope (super-admin / EDGS)
 *   GET /api/v1/dashboard/projects/{id}                    — per-project activity summary
 *   GET /api/v1/dashboard/projects/{id}/overview           — cross-activity project overview
 *   GET /api/v1/dashboard/projects/{id}/utility-breakdown  — utility-type breakdown
 *   GET /api/v1/dashboard/projects/{id}/forest-stage-breakdown — Forest Clearance stages
 */

const BASE = '/api/v1';

// ── Activity summary (per-type counts) ───────────────────────────────────────

export interface ActivitySummaryDto {
  activityTypeCode: string;
  totalRecords: number;
  draftCount: number;
  submittedCount: number;
  verifiedCount: number;
  authenticatedCount: number;
  sentBackCount: number;
  slaBreachCount: number;
  updatedAt: string;
}

export interface ProjectDashboardDto {
  projectId: string;
  summaries: ActivitySummaryDto[];
}

// ── Project overview (cross-activity, RAG) ────────────────────────────────────

export interface ActivityCardDto {
  activityTypeCode: string;
  totalRecords: number;
  authenticatedCount: number;
  pendingCount: number;
  slaBreachCount: number;
  /** "GREEN" | "AMBER" | "RED" */
  ragStatus: string;
}

export interface ProjectOverviewDto {
  projectId: string;
  projectCode: string | null;
  name: string;
  zoneCode: string | null;
  lifecycleState: string;
  daysSinceRbRecommendation: number | null;
  totalSlaBreaches: number;
  totalDrawingsInApproval: number;
  activityCards: ActivityCardDto[];
}

// ── Utility breakdown ─────────────────────────────────────────────────────────

export interface UtilitySubtypeSummaryDto {
  recordSubtype: string;
  totalRecords: number;
  draftCount: number;
  submittedCount: number;
  verifiedCount: number;
  authenticatedCount: number;
  sentBackCount: number;
  updatedAt: string;
}

export interface UtilitySubtypeBreakdownDto {
  projectId: string;
  subtypes: UtilitySubtypeSummaryDto[];
}

// ── Forest clearance stage breakdown ─────────────────────────────────────────

export interface ForestStageSummaryDto {
  stageCode: string;
  totalRecords: number;
  draftCount: number;
  submittedCount: number;
  verifiedCount: number;
  authenticatedCount: number;
  sentBackCount: number;
  updatedAt: string;
}

export interface ForestStageBreakdownDto {
  projectId: string;
  stages: ForestStageSummaryDto[];
}

// ── Zone scope ────────────────────────────────────────────────────────────────

export interface ZoneProjectDto {
  projectId: string;
  projectCode: string | null;
  name: string;
  lifecycleState: string;
  daysSinceRbRecommendation: number | null;
  slaBreachCount: number;
  drawingsInApproval: number;
}

export interface ZoneSummaryDto {
  zoneId: string;
  zoneCode: string;
  zoneName: string;
  projectsActive: number;
  projectsWithSlaBreaches: number;
  totalDrawingsInApproval: number;
  projects: ZoneProjectDto[];
}

export interface ZoneDashboardResponse {
  zones: ZoneSummaryDto[];
}

// ── PAN India scope ───────────────────────────────────────────────────────────

export interface PanIndiaDashboardResponse {
  totalProjectsActive: number;
  totalProjectsWithSlaBreaches: number;
  totalDrawingsInApproval: number;
  zones: ZoneSummaryDto[];
}

// ── Fetch helpers ─────────────────────────────────────────────────────────────

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function fetchZoneDashboard(): Promise<ZoneDashboardResponse> {
  const res = await fetch(`${BASE}/dashboard/zone`, { credentials: 'include' });
  return handleResponse<ZoneDashboardResponse>(res);
}

export async function fetchPanIndiaDashboard(): Promise<PanIndiaDashboardResponse> {
  const res = await fetch(`${BASE}/dashboard/pan-india`, { credentials: 'include' });
  return handleResponse<PanIndiaDashboardResponse>(res);
}

export async function fetchProjectDashboard(projectId: string): Promise<ProjectDashboardDto> {
  const res = await fetch(`${BASE}/dashboard/projects/${projectId}`, { credentials: 'include' });
  return handleResponse<ProjectDashboardDto>(res);
}

export async function fetchProjectOverview(projectId: string): Promise<ProjectOverviewDto> {
  const res = await fetch(`${BASE}/dashboard/projects/${projectId}/overview`, { credentials: 'include' });
  return handleResponse<ProjectOverviewDto>(res);
}

export async function fetchUtilityBreakdown(projectId: string): Promise<UtilitySubtypeBreakdownDto> {
  const res = await fetch(`${BASE}/dashboard/projects/${projectId}/utility-breakdown`, { credentials: 'include' });
  return handleResponse<UtilitySubtypeBreakdownDto>(res);
}

export async function fetchForestStageBreakdown(projectId: string): Promise<ForestStageBreakdownDto> {
  const res = await fetch(`${BASE}/dashboard/projects/${projectId}/forest-stage-breakdown`, { credentials: 'include' });
  return handleResponse<ForestStageBreakdownDto>(res);
}
