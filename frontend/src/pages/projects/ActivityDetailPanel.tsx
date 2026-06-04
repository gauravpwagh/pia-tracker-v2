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
import { useNavigate, useLocation } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@stores/authStore';
import dayjs from 'dayjs';
import {
  Alert,
  Button,
  DatePicker,
  Descriptions,
  Divider,
  Form,
  Input,
  List,
  notification,
  Popconfirm,
  Skeleton,
  Space,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import { ActivityMetadataForm, ActivityMetadataView, getMetadataDefaults } from './ActivityMetadataForm';
import {
  AuditOutlined,
  BranchesOutlined,
  CheckCircleOutlined,
  CloseOutlined,
  ClusterOutlined,
  DeleteOutlined,
  EditOutlined,
  FileTextOutlined,
  HomeOutlined,
  PlusOutlined,
  SafetyOutlined,
  SaveOutlined,
  SendOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import {
  updateActivity,
  type ActivityDetailResponse,
  type UpdateActivityRequest,
} from '@api/projects';
import {
  listRecords,
  createRecord,
  deleteRecord,
  type ActivityRecordDetail,
} from '@api/activityRecords';
import { DrawingApproversPanel } from './DrawingApproversPanel';
import {
  fetchActivityWorkflowState,
  performActivityAction,
  type SectionWorkflowState,
} from '@api/workflow';

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
  DRAFT:                       'default',
  SUBMITTED_FOR_VERIFICATION:  'blue',
  VERIFIED:                    'cyan',
  AUTHENTICATED:               'green',
  SENT_BACK_TO_DYCE:           'orange',
  SENT_BACK_TO_NODAL:          'gold',
  // legacy DB values
  NOT_STARTED:                 'default',
  IN_PROGRESS:                 'blue',
  COMPLETED:                   'green',
  ON_HOLD:                     'orange',
  CANCELLED:                   'red',
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT:                       'Draft',
  SUBMITTED_FOR_VERIFICATION:  'Submitted',
  VERIFIED:                    'Verified',
  AUTHENTICATED:               'Authenticated',
  SENT_BACK_TO_DYCE:           'Sent back to Dy CE/C',
  SENT_BACK_TO_NODAL:          'Sent back to Nodal',
  // legacy DB values
  NOT_STARTED:                 'Draft',
  IN_PROGRESS:                 'Submitted',
  COMPLETED:                   'Authenticated',
  ON_HOLD:                     'Sent back to Dy CE/C',
  CANCELLED:                   'Sent back to Nodal',
};

// ── Edit form values ──────────────────────────────────────────────────────────

interface EditValues {
  name: string;
  scopeNotes?: string;
  targetCompletionDate?: dayjs.Dayjs | null;
}

// ── Panel ─────────────────────────────────────────────────────────────────────

interface ActivityDetailPanelProps {
  activityId: string;
  canEdit: boolean;         // true when caller has ACTIVITY.UPDATE.OWN
  onClose: () => void;
  onStatusChanged?: (activityId: string, newStatus: string) => void;
}

// ── Record state → badge colour ───────────────────────────────────────────────

const RECORD_STATE_COLORS: Record<string, string> = {
  DRAFT:                        'default',
  SUBMITTED_FOR_VERIFICATION:   'blue',
  VERIFIED:                     'cyan',
  AUTHENTICATED:                'green',
  SENT_BACK_TO_DYCE:            'orange',
  SENT_BACK_TO_NODAL:           'orange',
};

const RECORD_STATE_LABELS: Record<string, string> = {
  DRAFT:                        'Draft',
  SUBMITTED_FOR_VERIFICATION:   'Pending Nodal Verification',
  VERIFIED:                     'Pending CE/C Authentication',
  AUTHENTICATED:                'Authenticated',
  SENT_BACK_TO_DYCE:            'Sent Back to Dy CE/C',
  SENT_BACK_TO_NODAL:           'Sent Back to Nodal Dy CE/C',
};

function recordStateLabel(state: string): string {
  return RECORD_STATE_LABELS[state] ?? state.replace(/_/g, ' ');
}

// ── Panel ─────────────────────────────────────────────────────────────────────

export function ActivityDetailPanel({ activityId, canEdit, onClose, onStatusChanged }: ActivityDetailPanelProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  useAuthStore(); // kept to trigger re-render on auth change
  const [notifApi, notifCtx] = notification.useNotification();
  const [form] = Form.useForm<EditValues>();
  // Metadata is plain React state — no Ant Design form store involvement.
  const [metadataState, setMetadataState] = useState<Record<string, unknown>>({});

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
      setMetadataState({});
      setEditing(false);
    },
  });

  // ── Records ──────────────────────────────────────────────────────────────────

  const recordsQuery = useQuery<ActivityRecordDetail[]>({
    queryKey: ['records', activityId],
    queryFn: () => listRecords(activityId),
    staleTime: 30_000,
  });

  const createRecordMutation = useMutation({
    mutationFn: () => createRecord(activityId),
    onSuccess: (record) => {
      void queryClient.invalidateQueries({ queryKey: ['records', activityId] });
      navigate(`/records/${record.id}/edit`, {
        state: { returnPath: location.pathname },
      });
    },
  });

  const deleteRecordMutation = useMutation({
    mutationFn: (recordId: string) => deleteRecord(recordId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['records', activityId] });
    },
  });

  const activityWorkflowMutation = useMutation({
    mutationFn: ({ action, comment }: { action: 'submit' | 'verify' | 'authenticate' | 'send-back' | 'resubmit' | 're-verify'; comment?: string }) =>
      performActivityAction(activityId, action, comment),
    onSuccess: (updated) => {
      queryClient.setQueryData(['activityWorkflow', activityId], updated);
      void queryClient.invalidateQueries({ queryKey: ['activity', activityId] });
      onStatusChanged?.(activityId, updated.currentStateCode);
      notifApi.success({ message: 'Activity updated', duration: 2 });
    },
    onError: (err: Error) => {
      notifApi.error({ message: 'Action failed', description: err.message, duration: 5 });
    },
  });

  const activityWorkflowQuery = useQuery<SectionWorkflowState>({
    queryKey: ['activityWorkflow', activityId],
    queryFn: () => fetchActivityWorkflowState(activityId),
    staleTime: 30_000,
  });

  const activity = activityQuery.data;
  const activityWorkflow = activityWorkflowQuery.data;

  // Available actions are determined by the activity's own workflow state
  const availableActions = activityWorkflow?.availableActions ?? [];
  const currentStateCode = activityWorkflow?.currentStateCode ?? 'DRAFT';
  const isTerminal       = activityWorkflow?.isTerminal ?? false;

  const startEditing = () => {
    if (!activity) return;
    form.setFieldsValue({
      name: activity.name,
      scopeNotes: activity.scopeNotes ?? undefined,
      targetCompletionDate: activity.targetCompletionDate
        ? dayjs(activity.targetCompletionDate)
        : null,
    });
    // Seed metadata state: start with type defaults (so boolean fields are
    // always present), then overlay the actual saved values.
    setMetadataState({
      ...getMetadataDefaults(activity.activityTypeCode),
      ...(activity.metadataJson ?? {}),
    } as Record<string, unknown>);
    setEditing(true);
  };

  const handleSave = () => {
    form.validateFields().then((values) => {
      // metadataState is kept current by onValuesChange on the metaForm below —
      // no form.getFieldsValue() call needed; state is the reliable source of truth.
      const cleanedMetadata = Object.fromEntries(
        Object.entries(metadataState).filter(([, v]) => v !== undefined && v !== null && v !== ''),
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
    setMetadataState({});
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
      {notifCtx}

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

        {/* Action buttons — hidden once activity is authenticated */}
        {activity && canEdit && !editing && !isTerminal && (
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
                {STATUS_LABELS[activity.status] ?? activity.status.replace(/_/g, ' ')}
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

            {/* ── Activity-level workflow actions ────────────────────────── */}
            {!isTerminal && availableActions.length > 0 && (
              <div>
                <Divider orientation="left" orientationMargin={0}
                  style={{ fontSize: 12, color: 'var(--ant-color-text-secondary)', margin: '4px 0 10px' }}>
                  Workflow
                </Divider>
                <Tag style={{ marginBottom: 10, fontSize: 12 }}
                  color={
                    currentStateCode === 'DRAFT' ? 'default' :
                    currentStateCode === 'SUBMITTED_FOR_VERIFICATION' ? 'blue' :
                    currentStateCode === 'VERIFIED' ? 'cyan' :
                    currentStateCode === 'SENT_BACK_TO_DYCE' ? 'orange' :
                    currentStateCode === 'SENT_BACK_TO_NODAL' ? 'orange' : 'default'
                  }
                >
                  {RECORD_STATE_LABELS[currentStateCode] ?? currentStateCode.replace(/_/g, ' ')}
                </Tag>
                <Space direction="vertical" style={{ width: '100%' }} size={8}>
                  {availableActions.includes('submit') && (
                    <Button type="primary" icon={<SendOutlined />} block
                      loading={activityWorkflowMutation.isPending}
                      onClick={() => activityWorkflowMutation.mutate({ action: 'submit' })}>
                      Submit for Verification
                    </Button>
                  )}
                  {availableActions.includes('resubmit') && (
                    <Button icon={<SendOutlined />} block
                      loading={activityWorkflowMutation.isPending}
                      onClick={() => activityWorkflowMutation.mutate({ action: 'resubmit' })}>
                      Resubmit
                    </Button>
                  )}
                  {availableActions.includes('verify') && (
                    <Button type="primary" icon={<CheckCircleOutlined />} block
                      loading={activityWorkflowMutation.isPending}
                      onClick={() => activityWorkflowMutation.mutate({ action: 'verify' })}>
                      Submit for Authentication
                    </Button>
                  )}
                  {availableActions.includes('re_verify') && (
                    <Button icon={<CheckCircleOutlined />} block
                      loading={activityWorkflowMutation.isPending}
                      onClick={() => activityWorkflowMutation.mutate({ action: 're-verify' })}>
                      Re-verify
                    </Button>
                  )}
                  {availableActions.includes('authenticate') && (
                    <Popconfirm
                      title="Authenticate this activity?"
                      description="Authentication is irreversible."
                      okText="Authenticate" cancelText="Cancel"
                      onConfirm={() => activityWorkflowMutation.mutate({ action: 'authenticate' })}>
                      <Button type="primary" icon={<SafetyOutlined />} block
                        loading={activityWorkflowMutation.isPending}>
                        Authenticate
                      </Button>
                    </Popconfirm>
                  )}
                  {availableActions.includes('send_back') && (
                    <Button danger icon={<SendOutlined />} block
                      loading={activityWorkflowMutation.isPending}
                      onClick={() => activityWorkflowMutation.mutate({ action: 'send-back' })}>
                      Send Back
                    </Button>
                  )}
                </Space>
              </div>
            )}
            {isTerminal && (
              <div>
                <Divider orientation="left" orientationMargin={0}
                  style={{ fontSize: 12, color: 'var(--ant-color-text-secondary)', margin: '4px 0 10px' }}>
                  Workflow
                </Divider>
                <Tag color="purple" style={{ fontSize: 12 }}>Authenticated</Tag>
              </div>
            )}

            {/* ── Records
                  • UTILITY_SHIFTING: hidden (data lives on the activity itself)
                  • DRAWING_APPROVAL: no "New Record" button — the record is auto-created
                    at activity-creation time using drawing_type as recordSubtype.
                  • All others: full create + list UI.
            */}
            {activity.activityTypeCode !== 'UTILITY_SHIFTING'
              && activity.activityTypeCode !== 'TENDER_PACKAGING'
              && <div>
              <Divider orientation="left" orientationMargin={0}
                style={{ fontSize: 12, color: 'var(--ant-color-text-secondary)', margin: '4px 0 10px' }}>
                {activity.activityTypeCode === 'DRAWING_APPROVAL' ? 'Approval record' : 'Records'}
              </Divider>

              {activity.activityTypeCode !== 'DRAWING_APPROVAL' && (
                <>
                  <Button
                    block
                    type="primary"
                    icon={<PlusOutlined />}
                    loading={createRecordMutation.isPending}
                    onClick={() => createRecordMutation.mutate()}
                    style={{ marginBottom: 10 }}
                  >
                    New Record
                  </Button>

                  {createRecordMutation.isError && (
                    <Alert
                      type="error"
                      message="Failed to create record"
                      description={
                        createRecordMutation.error instanceof Error
                          ? createRecordMutation.error.message
                          : undefined
                      }
                      showIcon
                      style={{ marginBottom: 8 }}
                    />
                  )}
                </>
              )}

              {recordsQuery.isLoading && <Skeleton active paragraph={{ rows: 2 }} />}

              {recordsQuery.isError && (
                <Alert type="error" message="Failed to load records" showIcon />
              )}

              {recordsQuery.data && recordsQuery.data.length === 0 && (
                <Text type="secondary" style={{ fontSize: 12, fontStyle: 'italic' }}>
                  No records yet.
                </Text>
              )}

              {deleteRecordMutation.isError && (
                <Alert
                  type="error"
                  message="Failed to delete record"
                  description={
                    deleteRecordMutation.error instanceof Error
                      ? deleteRecordMutation.error.message
                      : undefined
                  }
                  showIcon
                  closable
                  style={{ marginBottom: 8 }}
                />
              )}

              {recordsQuery.data && recordsQuery.data.length > 0 && (
                <List
                  size="small"
                  bordered
                  dataSource={recordsQuery.data}
                  renderItem={(record, index) => {
                    const isAuthenticated = record.recordState === 'AUTHENTICATED';
                    return (
                      <List.Item
                        key={record.id}
                        style={{ padding: '6px 10px' }}
                        actions={[
                          <Tag
                            key="state"
                            color={RECORD_STATE_COLORS[record.recordState] ?? 'default'}
                            style={{ fontSize: 11, margin: 0 }}
                          >
                            {recordStateLabel(record.recordState)}
                          </Tag>,
                          canEdit && !isAuthenticated ? (
                            <Popconfirm
                              key="delete"
                              title="Delete this record?"
                              description="This cannot be undone."
                              okText="Delete"
                              okButtonProps={{ danger: true }}
                              cancelText="Cancel"
                              onConfirm={() => deleteRecordMutation.mutate(record.id)}
                            >
                              <Tooltip title="Delete record">
                                <Button
                                  size="small"
                                  type="text"
                                  danger
                                  icon={<DeleteOutlined />}
                                  loading={deleteRecordMutation.isPending}
                                  onClick={(e) => e.stopPropagation()}
                                />
                              </Tooltip>
                            </Popconfirm>
                          ) : null,
                        ].filter(Boolean)}
                      >
                        <div style={{ flex: 1 }}>
                          <div
                            style={{ cursor: activity.activityTypeCode !== 'DRAWING_APPROVAL' ? 'pointer' : 'default' }}
                            onClick={() => {
                              if (activity.activityTypeCode !== 'DRAWING_APPROVAL') {
                                navigate(`/records/${record.id}/edit`, { state: { returnPath: location.pathname } });
                              }
                            }}
                          >
                            <Space size={6}>
                              <FileTextOutlined style={{ color: 'var(--ant-color-text-secondary)', fontSize: 12 }} />
                              <Text style={{ fontSize: 12 }}>
                                {record.recordSubtype
                                  ? record.recordSubtype
                                  : `Record ${index + 1}`}
                              </Text>
                              <Text type="secondary" style={{ fontSize: 11 }}>
                                {dayjs(record.updatedAt).format('D MMM YYYY')}
                              </Text>
                            </Space>
                          </div>
                          {activity.activityTypeCode === 'DRAWING_APPROVAL' && (
                            <DrawingApproversPanel recordId={record.id} canEdit={canEdit} />
                          )}
                        </div>
                      </List.Item>
                    );
                  }}
                />
              )}
            </div>}
          </Space>
        )}

        {activity && editing && (
          <>
            {/* Common fields */}
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
            </Form>

            {/* Type-specific metadata — controlled component, no Form context needed. */}
            <Divider orientation="left" orientationMargin={0} style={{ fontSize: 12, color: 'var(--ant-color-text-secondary)', margin: '8px 0 12px' }}>
              {typeLabel} details
            </Divider>
            <Form layout="vertical">
              <ActivityMetadataForm
                activityTypeCode={activity.activityTypeCode}
                values={metadataState}
                onChange={(key, value) =>
                  setMetadataState((prev) => ({ ...prev, [key]: value }))
                }
              />
            </Form>
          </>
        )}
      </div>
    </div>
  );
}
