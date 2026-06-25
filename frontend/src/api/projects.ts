/**
 * projects.ts — API types and fetch helpers for projects, zones, divisions, and activities.
 *
 * Endpoints:
 *   GET  /api/v1/zones                           — active zone list
 *   GET  /api/v1/divisions?zoneId={id}           — divisions for a zone
 *   GET  /api/v1/projects                        — projects visible to the caller
 *   GET  /api/v1/projects/{id}                   — single project detail
 *   POST /api/v1/projects                        — create a new project (EDGS/CI only)
 *   GET  /api/v1/projects/{projectId}/activities — activities on a project
 */

import { API_BASE } from '@lib/apiBase';
const BASE = API_BASE;

// ── Zone ─────────────────────────────────────────────────────────────────────

export interface ZoneResponse {
  id: string;
  code: string;
  name: string;
  shortName: string;
  displayOrder: number;
}

// ── Division ──────────────────────────────────────────────────────────────────

export interface DivisionResponse {
  id: string;
  zoneId: string;
  code: string;
  name: string;
  displayOrder: number;
}

// ── Project ───────────────────────────────────────────────────────────────────

export interface ProjectSummaryResponse {
  id: string;
  name: string;
  zoneId: string;
  projectCode: string | null;
  projectType: string | null;
  lifecycleState: string;
  chainageFromKm: number | null;
  chainageToKm: number | null;
  lengthKm: number | null;
  targetCompletionYear: number | null;
  createdAt: string;
}

export interface ProjectDetailResponse {
  id: string;
  name: string;
  zoneId: string;
  projectCode: string | null;
  projectType: string | null;
  divisionId: string | null;
  chainageFromKm: number | null;
  chainageToKm: number | null;
  lengthKm: number | null;
  recommendedByBoardOn: string | null;
  targetCompletionYear: number | null;
  lifecycleState: string;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface CreateProjectRequest {
  name: string;
  zoneId: string;
  projectCode?: string;
  projectType?: string;
  divisionId?: string;
  chainageFromKm?: number;
  chainageToKm?: number;
  lengthKm?: number;
  targetCompletionYear?: number;
}

// ── Activity ──────────────────────────────────────────────────────────────────

export interface ActivityDetailResponse {
  id: string;
  projectId: string;
  activityTypeCode: string;
  name: string;
  scopeNotes: string | null;
  targetCompletionDate: string | null;
  primaryDyceUserId: string | null;
  status: string;
  defaultFormDefinitionId: string | null;
  /** Type-specific metadata (district, utility type, drawing type, etc.). Always an object. */
  metadataJson: Record<string, unknown>;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
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

// ── Divisions ─────────────────────────────────────────────────────────────────

export async function fetchDivisions(zoneId?: string): Promise<DivisionResponse[]> {
  const url = zoneId ? `${BASE}/divisions?zoneId=${zoneId}` : `${BASE}/divisions`;
  const res = await fetch(url, { credentials: 'include' });
  return handleResponse<DivisionResponse[]>(res);
}

// ── Projects ──────────────────────────────────────────────────────────────────

export async function fetchProjects(): Promise<ProjectSummaryResponse[]> {
  const res = await fetch(`${BASE}/projects`, { credentials: 'include' });
  return handleResponse<ProjectSummaryResponse[]>(res);
}

export async function fetchProjectDetail(id: string): Promise<ProjectDetailResponse> {
  const res = await fetch(`${BASE}/projects/${id}`, { credentials: 'include' });
  return handleResponse<ProjectDetailResponse>(res);
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

// ── Assignments ───────────────────────────────────────────────────────────────

export interface ProjectAssignmentItem {
  id: string;
  userId: string;
  assignmentRole: string;
  assignedAt: string;
  isActive: boolean;
}

export async function fetchProjectAssignments(projectId: string): Promise<ProjectAssignmentItem[]> {
  const res = await fetch(`${BASE}/projects/${projectId}/assignments`, { credentials: 'include' });
  return handleResponse<ProjectAssignmentItem[]>(res);
}

// ── Activities ────────────────────────────────────────────────────────────────

export async function fetchActivities(projectId: string): Promise<ActivityDetailResponse[]> {
  const res = await fetch(`${BASE}/projects/${projectId}/activities`, { credentials: 'include' });
  return handleResponse<ActivityDetailResponse[]>(res);
}

export async function fetchActivityById(activityId: string): Promise<ActivityDetailResponse> {
  const res = await fetch(`${BASE}/activities/${activityId}`, { credentials: 'include' });
  return handleResponse<ActivityDetailResponse>(res);
}

export interface CreateActivityRequest {
  activityTypeCode: string;
  name: string;
  scopeNotes?: string;
  targetCompletionDate?: string; // ISO date "YYYY-MM-DD"
  metadataJson?: Record<string, unknown>;
}

export interface UpdateActivityRequest {
  name: string;
  scopeNotes?: string;
  targetCompletionDate?: string; // ISO date "YYYY-MM-DD"
  metadataJson?: Record<string, unknown>;
}

export async function updateActivity(
  activityId: string,
  request: UpdateActivityRequest,
): Promise<ActivityDetailResponse> {
  const res = await fetch(`${BASE}/activities/${activityId}`, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  return handleResponse<ActivityDetailResponse>(res);
}

export async function createActivity(
  projectId: string,
  request: CreateActivityRequest,
): Promise<ActivityDetailResponse> {
  const res = await fetch(`${BASE}/projects/${projectId}/activities`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  return handleResponse<ActivityDetailResponse>(res);
}

// ── Project lifecycle actions ─────────────────────────────────────────────────

export async function allocateProject(
  projectId: string,
  ceUserId: string,
): Promise<ProjectDetailResponse> {
  const res = await fetch(`${BASE}/projects/${projectId}/allocate`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ceUserId }),
  });
  return handleResponse<ProjectDetailResponse>(res);
}

export async function assignDyceUsers(
  projectId: string,
  dyceUserIds: string[],
): Promise<ProjectDetailResponse> {
  const res = await fetch(`${BASE}/projects/${projectId}/assign-dyce`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dyceUserIds }),
  });
  return handleResponse<ProjectDetailResponse>(res);
}

export async function designateNodalUser(
  projectId: string,
  nodalUserId: string,
): Promise<ProjectDetailResponse> {
  const res = await fetch(`${BASE}/projects/${projectId}/designate-nodal`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nodalUserId }),
  });
  return handleResponse<ProjectDetailResponse>(res);
}
