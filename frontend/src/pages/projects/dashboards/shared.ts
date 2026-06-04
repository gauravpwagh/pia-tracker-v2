/** Shared constants and helpers used across per-activity dashboard components. */

export const RECORD_STATE_COLORS: Record<string, string> = {
  DRAFT:                       'default',
  SUBMITTED_FOR_VERIFICATION:  'blue',
  VERIFIED:                    'cyan',
  AUTHENTICATED:               'green',
  SENT_BACK_TO_DYCE:           'orange',
  SENT_BACK_TO_NODAL:          'gold',
};

export const RECORD_STATE_LABELS: Record<string, string> = {
  DRAFT:                       'Draft',
  SUBMITTED_FOR_VERIFICATION:  'Submitted',
  VERIFIED:                    'Verified',
  AUTHENTICATED:               'Authenticated',
  SENT_BACK_TO_DYCE:           'Sent Back',
  SENT_BACK_TO_NODAL:          'Sent Back',
};

export function stateLabel(s: string): string {
  return RECORD_STATE_LABELS[s] ?? s.replace(/_/g, ' ');
}

export function stateColor(s: string): string {
  return RECORD_STATE_COLORS[s] ?? 'default';
}

/** Safely parse a number stored as string or number in dataJson. */
export function parseNum(v: unknown): number {
  if (v === null || v === undefined || v === '') return 0;
  const n = Number(v);
  return isFinite(n) ? n : 0;
}
