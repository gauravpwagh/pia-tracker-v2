/**
 * ActivityDetailPanel — right-pane content when an activity node is selected.
 *
 * Two modes:
 *   View  — shows all fields read-only with an Edit button in the title bar.
 *   Edit  — inline form over the same fields; Save / Cancel in the title bar.
 *
 * Editable fields: name, scope notes, target completion date.
 * Read-only:  activity type, status (workflow-managed), created by, dates.
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import {
  Alert,
  Button,
  DatePicker,
  Descriptions,
  Divider,
  Form,
  Input,
  Skeleton,
  Space,
  Tag,
  Typography,
} from 'antd';
import { ActivityMetadataForm, ActivityMetadataView } from './ActivityMetadataForm';
import {
  AuditOutlined,
  BranchesOutlined,
  CloseOutlined,
  ClusterOutlined,
  EditOutlined,
  HomeOutlined,
  SaveOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import {
  updateActivity,
  type ActivityDetailResponse,
  type UpdateActivityRequest,
} from '@api/projects';

const { Text, Title } = Typography;
const { TextArea } = Input;

// ── Constants ─────────────────────────────────────────────────────────────────

const ACTIVITY_TYPE_ICONS: Record<string, React.ReactNode> = {
  LAND_ACQUISITION:       <HomeOutlined />,
  FOREST_CLEARANCE:       <ClusterOutlined />,
  UTILITY_SHIFTING:       <ThunderboltOutlined />,
  DRAWING_APPROVAL:       <AuditOutlined />,
};

const ACTIVITY_TYPE_LABELS: Record<string, string> = {
  LAND_ACQUISITION:       'Land Acquisition',
  FOREST_CLEARANCE:       'Forest Clearance',
  UTILITY_SHIFTING:       'Utility Shifting',
  DRAWING_APPROVAL:       'Drawing Approval',
  TENDER_PACKAGING:       'Tender Packaging',
  TEMPORARY_OFFICE_SPACE: 'Temporary Office Space',
};

const SCOPE_NOTE_PLACEHOLDERS: Record<string, string> = {
  LAND_ACQUISITION:       'Villages, survey numbers, district, total area (ha), acquisition stage (Section 11 / Award / Possession)…',
  FOREST_CLEARANCE:       'Forest division, area (ha), FC-I / FC-II stage, wildlife zone considerations, compensatory afforestation details…',
  UTILITY_SHIFTING:       'Utility type (OHE / signalling / water / telecom), chainage range, executing agency, estimated cost…',
  DRAWING_APPROVAL:       'Drawing type, DPR reference, design standard, approving authority, revision notes…',
  TENDER_PACKAGING:       'Package scope, estimated cost range, tender type (open / limited), current stage…',
  TEMPORARY_OFFICE_SPACE: 'Location, area required (sqm), type (rented / railway land), facilities needed, estimated rent…',
};

const STATUS_COLORS: Record<string, string> = {
  NOT_STARTED: 'default',
  IN_PROGRESS: 'blue',
  COMPLETED:   'green',
  ON_HOLD:     'orange',
  CANCELLED:   'red',
};

// ── Edit form values ──────────────────────────────────────────────────────────

interface EditValues {
  name: string;
  scopeNotes?: string;
  targetCompletionDate?: dayjs.Dayjs | null;
  metadata?: Record<string, unknown>;
}

// ── Panel ─────────────────────────────────────────────────────────────────────

interface ActivityDetailPanelProps {
  activityId: string;
  canEdit: boolean;         // true when caller has ACTIVITY.UPDATE.OWN
  onClose: () => void;
}

export function ActivityDetailPanel({ activityId, canEdit, onClose }: ActivityDetailPanelProps) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [form] = Form.useForm<EditValues>();

  const activityQuery = useQuery<ActivityDetailResponse>({
    queryKey: ['activity', activityId],
    queryFn: async () => {
      const res = await fetch(`/api/v1/activities/${activityId}`, { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json() as Promise<ActivityDetailResponse>;
    },
    staleTime: 60_000,
  });

  const updateMutation = useMutation({
    mutationFn: (values: UpdateActivityRequest) => updateActivity(activityId, values),
    onSuccess: (updated) => {
      queryClient.setQueryData(['activity', activityId], updated);
      void queryClient.invalidateQueries({ queryKey: ['activities'] });
      setEditing(false);
    },
  });

  const activity = activityQuery.data;

  const startEditing = () => {
    if (!activity) return;
    form.setFieldsValue({
      name: activity.name,
      scopeNotes: activity.scopeNotes ?? undefined,
      targetCompletionDate: activity.targetCompletionDate
        ? dayjs(activity.targetCompletionDate)
        : null,
      // Pre-populate type-specific metadata; cast is safe — backend always returns an object
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      metadata: (activity.metadataJson ?? {}) as any,
    });
    setEditing(true);
  };

  const handleSave = () => {
    form.validateFields().then((values) => {
      const cleanedMetadata = Object.fromEntries(
        Object.entries(values.metadata ?? {}).filter(([, v]) => v !== undefined && v !== null && v !== ''),
      );
      updateMutation.mutate({
        name: values.name,
        scopeNotes: values.scopeNotes || undefined,
        targetCompletionDate: values.targetCompletionDate
          ? values.targetCompletionDate.format('YYYY-MM-DD')
          : undefined,
        metadataJson: Object.keys(cleanedMetadata).length > 0 ? cleanedMetadata : {},
      });
    });
  };

  const handleCancel = () => {
    form.resetFields();
    setEditing(false);
  };

  const typeIcon = activity
    ? (ACTIVITY_TYPE_ICONS[activity.activityTypeCode] ?? <BranchesOutlined />)
    : <BranchesOutlined />;

  const typeLabel = activity
    ? (ACTIVITY_TYPE_LABELS[activity.activityTypeCode] ?? activity.activityTypeCode.replace(/_/g, ' '))
    : '…';

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
        <span style={{ color: 'var(--ant-color-text-secondary)', flexShrink: 0, fontSize: 14 }}>
          {typeIcon}
        </span>
        <Text
          strong
          style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13 }}
        >
          {activity?.name ?? typeLabel}
        </Text>

        {/* Action buttons */}
        {activity && canEdit && !editing && (
          <Button size="small" icon={<EditOutlined />} onClick={startEditing}>
            Edit
          </Button>
        )}
        {editing && (
          <Space size={4}>
            <Button size="small" onClick={handleCancel} disabled={updateMutation.isPending}>
              Cancel
            </Button>
            <Button
              size="small"
              type="primary"
              icon={<SaveOutlined />}
              loading={updateMutation.isPending}
              onClick={handleSave}
            >
              Save
            </Button>
          </Space>
        )}

        <Button type="text" size="small" icon={<CloseOutlined />} onClick={onClose}
          style={{ flexShrink: 0 }} />
      </div>

      {/* ── Body ──────────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        {activityQuery.isLoading && <Skeleton active paragraph={{ rows: 5 }} />}

        {activityQuery.isError && (
          <Alert type="error" message="Failed to load activity" showIcon />
        )}

        {updateMutation.isError && (
          <Alert
            type="error"
            message="Failed to save changes"
            description={updateMutation.error instanceof Error ? updateMutation.error.message : undefined}
            showIcon
            style={{ marginBottom: 12 }}
          />
        )}

        {activity && !editing && (
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            {/* Name + status */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
              <Title level={5} style={{ margin: 0, flex: 1, minWidth: 0 }}>
                {activity.name}
              </Title>
              <Tag color={STATUS_COLORS[activity.status] ?? 'default'} style={{ flexShrink: 0 }}>
                {activity.status.replace(/_/g, ' ')}
              </Tag>
            </div>

            <Descriptions size="small" column={1} bordered>
              <Descriptions.Item label="Activity type">
                <Space size={4}>
                  {typeIcon}
                  {typeLabel}
                </Space>
              </Descriptions.Item>

              {activity.scopeNotes && (
                <Descriptions.Item label="Scope notes">
                  <Text style={{ whiteSpace: 'pre-wrap' }}>{activity.scopeNotes}</Text>
                </Descriptions.Item>
              )}

              {activity.targetCompletionDate && (
                <Descriptions.Item label="Target completion">
                  {dayjs(activity.targetCompletionDate).format('D MMM YYYY')}
                </Descriptions.Item>
              )}

              <Descriptions.Item label="Created">
                {dayjs(activity.createdAt).format('D MMM YYYY')}
              </Descriptions.Item>

              <Descriptions.Item label="Last updated">
                {dayjs(activity.updatedAt).format('D MMM YYYY, HH:mm')}
              </Descriptions.Item>
            </Descriptions>

            {/* Type-specific metadata (read-only) */}
            <div>
              <Divider orientation="left" orientationMargin={0}
                style={{ fontSize: 12, color: 'var(--ant-color-text-secondary)', margin: '4px 0 10px' }}>
                {typeLabel} details
              </Divider>
              <ActivityMetadataView
                activityTypeCode={activity.activityTypeCode}
                metadataJson={(activity.metadataJson ?? {}) as Record<string, unknown>}
              />
              {Object.keys(activity.metadataJson ?? {}).length === 0 && (
                <Text type="secondary" style={{ fontSize: 12, fontStyle: 'italic' }}>
                  No details recorded yet. Click Edit to add them.
                </Text>
              )}
            </div>

            {/* Placeholder for records list (Phase 1.9+) */}
            <div style={{
              border: '1px dashed var(--ant-color-border)',
              borderRadius: 6,
              padding: '16px 12px',
              textAlign: 'center',
            }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                Records for this activity will appear here once created.
              </Text>
            </div>
          </Space>
        )}

        {activity && editing && (
          <Form form={form} layout="vertical">
            <Form.Item
              name="name"
              label="Activity name"
              rules={[{ required: true, message: 'Name is required' }]}
            >
              <Input />
            </Form.Item>

            <Form.Item name="scopeNotes" label="Scope notes">
              <TextArea
                rows={4}
                placeholder={
                  SCOPE_NOTE_PLACEHOLDERS[activity.activityTypeCode]
                  ?? 'Describe the scope of this activity…'
                }
              />
            </Form.Item>

            <Form.Item name="targetCompletionDate" label="Target completion date">
              <DatePicker style={{ width: '100%' }} format="D MMM YYYY" />
            </Form.Item>

            {/* Type-specific metadata fields */}
            <Divider orientation="left" orientationMargin={0} style={{ fontSize: 12, color: 'var(--ant-color-text-secondary)', margin: '8px 0 12px' }}>
              {typeLabel} details
            </Divider>
            <ActivityMetadataForm activityTypeCode={activity.activityTypeCode} />
          </Form>
        )}
      </div>
    </div>
  );
}
