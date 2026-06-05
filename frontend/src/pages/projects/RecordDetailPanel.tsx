/**
 * RecordDetailPanel — right-pane content when a record node is selected in the tree.
 *
 * Shows: record name/label, state, dates, a link to open the form,
 * and for Drawing Approval records the approver checklist inline.
 */

import { useNavigate, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import {
  Alert,
  Button,
  Descriptions,
  Divider,
  Skeleton,
  Space,
  Tag,
  Typography,
} from 'antd';
import {
  CloseOutlined,
  EditOutlined,
  FileTextOutlined,
} from '@ant-design/icons';
import { fetchRecord, type ActivityRecordDetail } from '@api/activityRecords';
import { DrawingApproversPanel } from './DrawingApproversPanel';

const { Text, Title } = Typography;

// ── Record state colours / labels ─────────────────────────────────────────────

const RECORD_STATE_COLORS: Record<string, string> = {
  DRAFT:                        'default',
  SUBMITTED_FOR_VERIFICATION:   'blue',
  VERIFIED:                     'cyan',
  AUTHENTICATED:                'green',
  SENT_BACK_TO_DYCE:            'orange',
  SENT_BACK_TO_NODAL:           'gold',
};

const RECORD_STATE_LABELS: Record<string, string> = {
  DRAFT:                        'Draft',
  SUBMITTED_FOR_VERIFICATION:   'Submitted',
  VERIFIED:                     'Pending Authentication',
  AUTHENTICATED:                'Authenticated',
  SENT_BACK_TO_DYCE:            'Sent Back to Dy CE/C',
  SENT_BACK_TO_NODAL:           'Sent Back to Nodal',
};

function recordLabel(record: ActivityRecordDetail, index?: number): string {
  if (record.name) return record.name;
  if (record.recordSubtype) return record.recordSubtype.replace(/_/g, ' ');
  return index !== undefined ? `Record ${index + 1}` : 'Record';
}

// ── Types with a link-to-form button ─────────────────────────────────────────

const TYPES_WITH_FORM = new Set([
  'LAND_ACQUISITION',
  'FOREST_CLEARANCE',
]);

// ── Panel ─────────────────────────────────────────────────────────────────────

interface RecordDetailPanelProps {
  recordId: string;
  activityTypeCode: string;
  canEdit: boolean;
  onClose: () => void;
}

export function RecordDetailPanel({
  recordId,
  activityTypeCode,
  canEdit,
  onClose,
}: RecordDetailPanelProps) {
  const navigate = useNavigate();
  const location = useLocation();

  const recordQuery = useQuery<ActivityRecordDetail>({
    queryKey: ['record', recordId],
    queryFn: () => fetchRecord(recordId),
    staleTime: 30_000,
  });

  const record = recordQuery.data;
  const stateColor = RECORD_STATE_COLORS[record?.recordState ?? ''] ?? 'default';
  const stateLabel = RECORD_STATE_LABELS[record?.recordState ?? ''] ?? (record?.recordState ?? '').replace(/_/g, ' ');
  const displayName = record ? recordLabel(record) : '…';

  const showFormButton = TYPES_WITH_FORM.has(activityTypeCode) && canEdit;
  const showApprovers  = activityTypeCode === 'DRAWING_APPROVAL';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

      {/* ── Title bar ─────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 12px',
        borderBottom: '1px solid var(--ant-color-border)',
        flexShrink: 0,
        minHeight: 48,
      }}>
        <FileTextOutlined style={{ color: 'var(--ant-color-text-secondary)', flexShrink: 0 }} />
        <Text
          strong
          style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13 }}
        >
          {displayName}
        </Text>

        {record && (
          <Tag
            color={stateColor}
            style={{ margin: 0, flexShrink: 0, fontSize: 11 }}
          >
            {stateLabel}
          </Tag>
        )}

        {showFormButton && record && record.recordState !== 'AUTHENTICATED' && (
          <Button
            size="small"
            icon={<EditOutlined />}
            onClick={() => navigate(`/records/${recordId}/edit`, { state: { returnPath: location.pathname } })}
          >
            Open Form
          </Button>
        )}

        <Button type="text" size="small" icon={<CloseOutlined />} onClick={onClose}
          style={{ flexShrink: 0 }} />
      </div>

      {/* ── Body ──────────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        {recordQuery.isLoading && <Skeleton active paragraph={{ rows: 4 }} />}
        {recordQuery.isError && (
          <Alert type="error" message="Failed to load record" showIcon />
        )}

        {record && (
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            {/* Name + state */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
              <Title level={5} style={{ margin: 0, flex: 1, minWidth: 0 }}>
                {displayName}
              </Title>
              <Tag color={stateColor} style={{ flexShrink: 0 }}>
                {stateLabel}
              </Tag>
            </div>

            <Descriptions size="small" column={1} bordered>
              {record.recordSubtype && (
                <Descriptions.Item label="Type">
                  {record.recordSubtype.replace(/_/g, ' ')}
                </Descriptions.Item>
              )}
              <Descriptions.Item label="Created">
                {dayjs(record.createdAt).format('D MMM YYYY')}
              </Descriptions.Item>
              <Descriptions.Item label="Last updated">
                {dayjs(record.updatedAt).format('D MMM YYYY, HH:mm')}
              </Descriptions.Item>
            </Descriptions>

            {/* Form link for types with RJSF forms */}
            {showFormButton && record.recordState !== 'AUTHENTICATED' && (
              <Button
                block
                type="primary"
                icon={<EditOutlined />}
                onClick={() => navigate(`/records/${recordId}/edit`, { state: { returnPath: location.pathname } })}
              >
                Open Form
              </Button>
            )}

            {/* Drawing approvers panel */}
            {showApprovers && (
              <>
                <Divider orientation="left" orientationMargin={0}
                  style={{ fontSize: 12, color: 'var(--ant-color-text-secondary)', margin: '4px 0 10px' }}>
                  Approval Checklist
                </Divider>
                <DrawingApproversPanel recordId={recordId} canEdit={canEdit} />
              </>
            )}
          </Space>
        )}
      </div>
    </div>
  );
}
