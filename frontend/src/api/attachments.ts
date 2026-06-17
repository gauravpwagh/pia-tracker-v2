/**
 * attachments.ts — API types and fetch helpers for file attachments.
 *
 * Upload flow (presigned URL — Spring never sees file bytes):
 *
 *   Single-part (≤ 100 MB):
 *     POST /api/v1/attachments/initiate       → { attachmentId, presignedUrl }
 *     PUT  <presignedUrl>                     → browser → MinIO
 *     POST /api/v1/attachments/{id}/confirm   → AttachmentDto (status: SCANNING)
 *
 *   Multipart (> 100 MB):
 *     POST /api/v1/attachments/initiate-multipart   → { attachmentId, uploadId, parts[] }
 *     PUT  <part.presignedUrl>                      → browser → MinIO (each part)
 *     POST /api/v1/attachments/{id}/complete-multipart → AttachmentDto (status: SCANNING)
 *
 *   Read / manage:
 *     GET    /api/v1/attachments?entityType=X&entityId=Y  — list
 *     GET    /api/v1/attachments/{id}/download            — presigned GET URL
 *     DELETE /api/v1/attachments/{id}                     — soft-delete
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
  /** PENDING | SCANNING | CLEAN | INFECTED | SCAN_FAILED | EXEMPT */
  scanStatus: string;
  sha256?: string;
  createdAt: string;
  uploadedByUserId: string;
}

export interface AttachmentDownloadDto {
  presignedUrl: string;
  originalFilename: string;
  contentType: string;
}

export interface InitiateUploadRequest {
  entityType: string;
  entityId: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
}

export interface InitiateUploadResponse {
  attachmentId: string;
  presignedUrl: string;
  expiresAt: string;
}

export interface PresignedPart {
  partNumber: number;
  presignedUrl: string;
}

export interface InitiateMultipartResponse {
  attachmentId: string;
  uploadId: string;
  parts: PresignedPart[];
}

export interface CompletedPart {
  partNumber: number;
  etag: string;
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

function jsonPost<T>(path: string, body: unknown): Promise<T> {
  return fetch(`${BASE}${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then((r) => handleResponse<T>(r));
}

// ── Upload initiation ─────────────────────────────────────────────────────────

export function initiateUpload(req: InitiateUploadRequest): Promise<InitiateUploadResponse> {
  return jsonPost('/attachments/initiate', req);
}

export function confirmUpload(attachmentId: string): Promise<AttachmentDto> {
  return jsonPost(`/attachments/${attachmentId}/confirm`, {});
}

export function initiateMultipartUpload(
  req: InitiateUploadRequest,
): Promise<InitiateMultipartResponse> {
  return jsonPost('/attachments/initiate-multipart', req);
}

export function completeMultipartUpload(
  attachmentId: string,
  parts: CompletedPart[],
): Promise<AttachmentDto> {
  return jsonPost(`/attachments/${attachmentId}/complete-multipart`, { parts });
}

// ── List / Download / Delete ──────────────────────────────────────────────────

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

export async function getAttachmentDownloadUrl(id: string): Promise<AttachmentDownloadDto> {
  const res = await fetch(`${BASE}/attachments/${id}/download`, { credentials: 'include' });
  return handleResponse<AttachmentDownloadDto>(res);
}

export async function deleteAttachment(id: string): Promise<void> {
  const res = await fetch(`${BASE}/attachments/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  return handleResponse<void>(res);
}
