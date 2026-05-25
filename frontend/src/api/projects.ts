/**
 * projects.ts — API types and fetch helpers for projects and zones.
 *
 * Endpoints:
 *   GET  /api/v1/zones             — active zone list (zone picker)
 *   GET  /api/v1/projects          — projects visible to the caller
 *   POST /api/v1/projects          — create a new project (EDGS/CI only)
 */

const BASE = '/api/v1';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ZoneResponse {
  id: string;
  code: string;
  name: string;
  shortName: string;
  displayOrder: number;
}

export interface ProjectSummaryResponse {
  id: string;
  name: string;
  zoneId: string;
}

export interface ProjectDetailResponse {
  id: string;
  name: string;
  zoneId: string;
  projectCode: string | null;
  projectType: string | null;
  divisionId: string | null;
  lifecycleState: string;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface CreateProjectRequest {
  name: string;
  zoneId: string;
  projectCode?: string;
  projectType?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ── Zones ─────────────────────────────────────────────────────────────────────

export async function fetchZones(): Promise<ZoneResponse[]> {
  const res = await fetch(`${BASE}/zones`, { credentials: 'include' });
  return handleResponse<ZoneResponse[]>(res);
}

// ── Projects ──────────────────────────────────────────────────────────────────

export async function fetchProjects(): Promise<ProjectSummaryResponse[]> {
  const res = await fetch(`${BASE}/projects`, { credentials: 'include' });
  return handleResponse<ProjectSummaryResponse[]>(res);
}

export async function createProject(
  request: CreateProjectRequest,
): Promise<ProjectDetailResponse> {
  const res = await fetch(`${BASE}/projects`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  return handleResponse<ProjectDetailResponse>(res);
}
