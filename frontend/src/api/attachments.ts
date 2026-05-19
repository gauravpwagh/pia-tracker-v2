/**
 * attachments.ts — API types and fetch helpers for file attachments.
 *
 * Endpoints:
 *   GET    /api/v1/attachments?entityType=X&entityId=Y  — list
 *   POST   /api/v1/attachments                          — upload (multipart)
 *   GET    /api/v1/attachments/{id}/download            — presigned URL
 *   DELETE /api/v1/attachments/{id}                     — soft-delete
 */

const BASE = '/api/v1';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AttachmentDto {
  id: string;
  entityType: string;
  entityId: string;
  originalFilename: string;
  contentType: string;
  fileSizeBytes: number;
  scanStatus: string; // CLEAN | INFECTED | PENDING
  createdAt: string;
  uploadedByUserId: string;
}

export interface AttachmentDownloadDto {
  presignedUrl: string;
  originalFilename: string;
  contentType: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined as unknown as T;
  return res.json() as Promise<T>;
}

export async function fetchAttachments(
  entityType: string,
  entityId: string,
): Promise<AttachmentDto[]> {
  const params = new URLSearchParams({ entityType, entityId });
  const res = await fetch(`${BASE}/attachments?${params.toString()}`, {
    credentials: 'include',
  });
  return handleResponse<AttachmentDto[]>(res);
}

export async function uploadAttachment(
  entityType: string,
  entityId: string,
  file: File,
): Promise<AttachmentDto> {
  const form = new FormData();
  form.append('entityType', entityType);
  form.append('entityId', entityId);
  form.append('file', file);

  const res = await fetch(`${BASE}/attachments`, {
    method: 'POST',
    credentials: 'include',
    body: form,
  });
  return handleResponse<AttachmentDto>(res);
}

export async function getAttachmentDownloadUrl(id: string): Promise<AttachmentDownloadDto> {
  const res = await fetch(`${BASE}/attachments/${id}/download`, {
    credentials: 'include',
  });
  return handleResponse<AttachmentDownloadDto>(res);
}

export async function deleteAttachment(id: string): Promise<void> {
  const res = await fetch(`${BASE}/attachments/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  return handleResponse<void>(res);
}
