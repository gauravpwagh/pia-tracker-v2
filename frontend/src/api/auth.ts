const BASE = '/api/v1';

export interface UserSummary {
  id: string;
  name: string;
  email: string;
  designationCode: string;
  /** Human-readable short label, e.g. "EDGS/C-I", "Dy CE/C". */
  designationShortLabel: string;
  primaryZoneId: string | null;
}

export interface PrincipalInfo {
  userId: string;
  name: string;
  email: string;
  designationCode: string;
  primaryZoneId: string | null;
  accessibleZoneIds: string[];
  permissions: string[];
  isSuperAdmin: boolean;
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

/** Returns the list of active seeded users for the dev role picker. */
export async function fetchUsers(): Promise<UserSummary[]> {
  const res = await fetch(`${BASE}/auth/users`, {
    credentials: 'include',
  });
  return handleResponse<UserSummary[]>(res);
}

/** Returns users filtered to a specific designation (e.g. "CE_C", "DY_CE_C"). */
export async function fetchUsersByDesignation(designationCode: string): Promise<UserSummary[]> {
  const res = await fetch(`${BASE}/auth/users?designationCode=${encodeURIComponent(designationCode)}`, {
    credentials: 'include',
  });
  return handleResponse<UserSummary[]>(res);
}

/** Selects a user for the current session and returns the resolved principal. */
export async function selectUser(userId: string): Promise<PrincipalInfo> {
  const res = await fetch(`${BASE}/auth/select-user`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId }),
  });
  return handleResponse<PrincipalInfo>(res);
}

/** Logs out by invalidating the current session. */
export async function logout(): Promise<void> {
  await fetch(`${BASE}/auth/logout`, {
    method: 'POST',
    credentials: 'include',
  });
}

/**
 * Returns the current principal from the server, or null if there is no active
 * session (401).
 */
export async function fetchMe(): Promise<PrincipalInfo | null> {
  const res = await fetch(`${BASE}/auth/me`, {
    credentials: 'include',
  });
  if (res.status === 401) {
    return null;
  }
  return handleResponse<PrincipalInfo>(res);
}
