/**
 * HistoryPanel — right-panel History tab for a record.
 *
 * Renders the workflow transition history fetched from
 * GET /api/v1/activity-records/{id}/history.
 *
 * Each entry shows:
 *   - Actor name + relative time
 *   - Section code (if applicable)
 *   - Transition: fromState → toState (coloured chips)
 *   - Comment (if present, e.g. send-back reason)
 */

import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  Empty,
  Spin,
  Tag,
  Timeline,
  Typography,
} from 'antd';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { fetchRecordHistory } from '@api/comments';

dayjs.extend(relativeTime);

const { Text } = Typography;

// State-code colours (same map used throughout the app)
const STATE_COLORS: Record<string, string> = {
  DRAFT: 'default',
  SUBMITTED_FOR_VERIFICATION: 'processing',
  VERIFIED: 'success',
  AUTHENTICATED: 'purple',
  SENT_BACK_TO_DYCE: 'warning',
  SENT_BACK_TO_NODAL: 'warning',
};

// Timeline dot colours (Ant Design uses named colours)
const TIMELINE_COLORS: Record<string, string> = {
  DRAFT: 'gray',
  SUBMITTED_FOR_VERIFICATION: 'blue',
  VERIFIED: 'green',
  AUTHENTICATED: '#722ed1',
  SENT_BACK_TO_DYCE: 'orange',
  SENT_BACK_TO_NODAL: 'orange',
};

export interface HistoryPanelProps {
  recordId: string;
}

export function HistoryPanel({ recordId }: HistoryPanelProps) {
  const { t } = useTranslation('forms');

  const { data: history, isLoading } = useQuery({
    queryKey: ['recordHistory', recordId],
    queryFn: () => fetchRecordHistory(recordId),
    enabled: !!recordId,
  });

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
        <Spin size="small" />
      </div>
    );
  }

  const entries = history ?? [];

  if (entries.length === 0) {
    return (
      <Empty
        description={t('record.history.empty')}
        image={Empty.PRESENTED_IMAGE_SIMPLE}
      />
    );
  }

  // Reverse so most recent is at top
  const reversed = [...entries].reverse();

  const items = reversed.map((entry) => ({
    color: TIMELINE_COLORS[entry.toStateCode] ?? 'blue',
    children: (
      <div style={{ paddingBottom: 8 }}>
        {/* Header: actor + time */}
        <div>
          <Text strong style={{ fontSize: 12 }}>
            {entry.actorName}
          </Text>
          <Text type="secondary" style={{ fontSize: 11, marginLeft: 8 }}>
            {dayjs(entry.occurredAt).fromNow()}
          </Text>
        </div>

        {/* Section + transition */}
        <div style={{ marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
          {entry.sectionCode && (
            <Text style={{ fontSize: 11, fontFamily: 'monospace' }}>
              [{entry.sectionCode.toUpperCase()}]
            </Text>
          )}
          {entry.fromStateCode && (
            <>
              <Tag
                color={STATE_COLORS[entry.fromStateCode] ?? 'default'}
                style={{ fontSize: 11, marginRight: 0 }}
              >
                {entry.fromStateLabel ?? entry.fromStateCode}
              </Tag>
              <Text type="secondary" style={{ fontSize: 11 }}>→</Text>
            </>
          )}
          <Tag
            color={STATE_COLORS[entry.toStateCode] ?? 'default'}
            style={{ fontSize: 11, marginRight: 0 }}
          >
            {entry.toStateLabel}
          </Tag>
        </div>

        {/* Comment (e.g. send-back reason) */}
        {entry.comment && (
          <Text
            type="secondary"
            italic
            style={{ fontSize: 12, display: 'block', marginTop: 4 }}
          >
            "{entry.comment}"
          </Text>
        )}
      </div>
    ),
  }));

  return <Timeline items={items} style={{ paddingTop: 8 }} />;
}
