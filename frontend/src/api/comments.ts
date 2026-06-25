/**
 * comments.ts — API types and fetch helpers for comments and record history.
 *
 * Endpoints:
 *   GET    /api/v1/comments?entityType=ACTIVITY_RECORD&entityId={uuid}
 *   POST   /api/v1/comments
 *   DELETE /api/v1/comments/{id}
 *   GET    /api/v1/activity-records/{id}/history
 */

import { API_BASE } from '@lib/apiBase';
const BASE = API_BASE;

// ── Comment types ─────────────────────────────────────────────────────────────

export interface CommentAuthor {
  userId: string;
  name: string;
  designationCode: string;
}

export interface CommentDto {
  id: string;
  entityType: string;
  entityId: string;
  parentCommentId: string | null;
  author: CommentAuthor;
  bodyMarkdown: string;
  workflowStateAtComment: string | null;
  createdAt: string;
  updatedAt: string;
  replies: CommentDto[];
}

export interface CreateCommentRequest {
  entityType: string;
  entityId: string;
  parentCommentId?: string | null;
  bodyMarkdown: string;
}

// ── Record history types ──────────────────────────────────────────────────────

export interface RecordHistoryEntry {
  historyId: string;
  instanceId: string;
  sectionCode: string | null;
  fromStateCode: string | null;
  fromStateLabel: string | null;
  toStateCode: string;
  toStateLabel: string;
  actionCode: string | null;
  actorUserId: string;
  actorName: string;
  comment: string | null;
  occurredAt: string;
}

// ── API helpers ───────────────────────────────────────────────────────────────

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined as unknown as T;
  return res.json() as Promise<T>;
}

export async function fetchComments(entityType: string, entityId: string): Promise<CommentDto[]> {
  const res = await fetch(
    `${BASE}/comments?entityType=${encodeURIComponent(entityType)}&entityId=${encodeURIComponent(entityId)}`,
    { credentials: 'include' },
  );
  return handleResponse<CommentDto[]>(res);
}

export async function postComment(request: CreateCommentRequest): Promise<CommentDto> {
  const res = await fetch(`${BASE}/comments`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  return handleResponse<CommentDto>(res);
}

export async function deleteComment(commentId: string): Promise<void> {
  const res = await fetch(`${BASE}/comments/${commentId}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  return handleResponse<void>(res);
}

export async function fetchRecordHistory(recordId: string): Promise<RecordHistoryEntry[]> {
  const res = await fetch(`${BASE}/activity-records/${recordId}/history`, {
    credentials: 'include',
  });
  return handleResponse<RecordHistoryEntry[]>(res);
}
