/**
 * notifications.ts — API types and fetch helpers for in-app notifications.
 *
 * Endpoints:
 *   GET  /api/v1/notifications              — list latest notifications + unread count
 *   POST /api/v1/notifications/{id}/read   — mark one notification read
 *   POST /api/v1/notifications/read-all    — mark all notifications read
 */

import { API_BASE } from '@lib/apiBase';
const BASE = API_BASE;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface NotificationDto {
  id: string;
  notificationType: string; // WORKFLOW_ACTION | MENTION | SYSTEM
  title: string;
  body: string;
  entityType: string | null;
  entityId: string | null;
  linkUrl: string | null;
  isRead: boolean;
  createdAt: string;
}

export interface NotificationSummaryDto {
  unreadCount: number;
  notifications: NotificationDto[];
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

export async function fetchNotifications(limit = 30): Promise<NotificationSummaryDto> {
  const res = await fetch(`${BASE}/notifications?limit=${limit}`, {
    credentials: 'include',
  });
  return handleResponse<NotificationSummaryDto>(res);
}

export async function markNotificationRead(id: string): Promise<void> {
  const res = await fetch(`${BASE}/notifications/${id}/read`, {
    method: 'POST',
    credentials: 'include',
  });
  return handleResponse<void>(res);
}

export async function markAllNotificationsRead(): Promise<void> {
  const res = await fetch(`${BASE}/notifications/read-all`, {
    method: 'POST',
    credentials: 'include',
  });
  return handleResponse<void>(res);
}
