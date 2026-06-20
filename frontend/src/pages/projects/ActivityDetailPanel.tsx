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
  Modal,
  notification,
  Select,
  Skeleton,
  Space,
  Tag,
  Typography,
} from 'antd';
import { ActivityMetadataForm, ActivityMetadataView, getMetadataDefaults } from './ActivityMetadataForm';
import {
  CloseOutlined,
  EditOutlined,
  PlusOutlined,
  SaveOutlined,
} from '@ant-design/icons';
import {
  IconBuildingBridge2,
  IconFileInvoice,
  IconHomeCog,
  IconMapPinDollar,
  IconRoute,
  IconRuler2,
  IconTools,
  IconTrees,
} from '@tabler/icons-react';
import {
  updateActivity,
  type ActivityDetailResponse,
  type UpdateActivityRequest,
} from '@api/projects';
import {
  createRecord,
  patchRecord,
  type ActivityRecordDetail,
} from '@api/activityRecords';

const { Text, Title } = Typography;
const { TextArea } = Input;

// ── Constants ─────────────────────────────────────────────────────────────────

const SZ = 15;
const ti = (icon: React.ReactNode) => <span className="anticon">{icon}</span>;

const ACTIVITY_TYPE_ICONS: Record<string, React.ReactNode> = {
  LAND_ACQUISITION:       ti(<IconMapPinDollar    size={SZ} />),
  FOREST_CLEARANCE:       ti(<IconTrees           size={SZ} />),
  UTILITY_SHIFTING:       ti(<IconTools           size={SZ} />),
  DRAWING_APPROVAL:       ti(<IconRuler2          size={SZ} />),
  TENDER_PACKAGING:       ti(<IconFileInvoice     size={SZ} />),
  TEMPORARY_OFFICE_SPACE: ti(<IconHomeCog         size={SZ} />),
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
  UTILITY_SHIFTING:       'Brief description of what needs to be shifted — type, stretch, agencies involved. Detailed scope goes in the metadata fields below.',
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
  /** Called after a new record is created so the parent can add it to the tree. */
  onRecordCreated?: (record: ActivityRecordDetail) => void;
}

/** Activity types that support manual record creation. */
const RECORD_CREATABLE_TYPES = new Set(['LAND_ACQUISITION', 'FOREST_CLEARANCE', 'UTILITY_SHIFTING', 'TEMPORARY_OFFICE_SPACE', 'TENDER_PACKAGING', 'DRAWING_APPROVAL']);

// ── Panel ─────────────────────────────────────────────────────────────────────

export function ActivityDetailPanel({ activityId, canEdit, onClose, onRecordCreated }: ActivityDetailPanelProps) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [addRecordOpen, setAddRecordOpen] = useState(false);
  const [newRecordName, setNewRecordName] = useState('');
  const [newRecordSubtype, setNewRecordSubtype] = useState<string | undefined>(undefined);
  const [newRecordMetadata, setNewRecordMetadata] = useState<Record<string, unknown>>({});
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

  const createRecordMutation = useMutation({
    mutationFn: async () => {
      const isUs      = activity?.activityTypeCode === 'UTILITY_SHIFTING';
      const isDrawing = activity?.activityTypeCode === 'DRAWING_APPROVAL';

      // For US records, subtype = utility type; for Drawing, subtype = drawing type
      const subtype = (isUs || isDrawing) ? newRecordSubtype : undefined;
      const record = await createRecord(activityId, subtype, newRecordName || undefined);

      // For US: pre-populate utility_type in dataJson so RJSF form filters correctly on first open
      if (isUs && newRecordSubtype) {
        await patchRecord(record.id, { utility_type: newRecordSubtype });
      }

      // For LA/FC: if user filled scope metadata, persist it to the activity
      if (!isUs && activity) {
        const metaValues = Object.fromEntries(
          Object.entries(newRecordMetadata).filter(([, v]) => v !== undefined && v !== null && v !== ''),
        );
        if (Object.keys(metaValues).length > 0) {
          await updateActivity(activityId, {
            name: activity.name,
            scopeNotes: activity.scopeNotes ?? undefined,
            targetCompletionDate: activity.targetCompletionDate ?? undefined,
            metadataJson: { ...(activity.metadataJson as Record<string, unknown> ?? {}), ...metaValues },
          });
          void queryClient.invalidateQueries({ queryKey: ['activity', activityId] });
        }
      }
      return record;
    },
    onSuccess: (record) => {
      void queryClient.invalidateQueries({ queryKey: ['records', activityId] });
      setAddRecordOpen(false);
      setNewRecordName('');
      setNewRecordSubtype(undefined);
      setNewRecordMetadata({});
      onRecordCreated?.(record);
    },
    onError: (err: Error) => {
      notifApi.error({ message: 'Failed to create record', description: err.message, duration: 5 });
    },
  });

  const activity = activityQuery.data;
  const isTerminal = activity?.status === 'AUTHENTICATED';

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
    ? (ACTIVITY_TYPE_ICONS[activity.activityTypeCode] ?? ti(<IconRoute size={SZ} />))
    : ti(<IconBuildingBridge2 size={SZ} />);

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
          <Space size={4}>
            {RECORD_CREATABLE_TYPES.has(activity.activityTypeCode) && (
              <Button
                size="small"
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => { setNewRecordName(''); setAddRecordOpen(true); }}
              >
                Add Record
              </Button>
            )}
            <Button size="small" icon={<EditOutlined />} onClick={startEditing}>
              Edit
            </Button>
          </Space>
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

            {/* Records are shown as tree children — expand the activity node in the left tree. */}
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

      {/* ── Add Record modal ──────────────────────────────────────────────── */}
      <Modal
        title="Add Record"
        open={addRecordOpen}
        onOk={() => createRecordMutation.mutate()}
        okButtonProps={{
          disabled: (activity?.activityTypeCode === 'UTILITY_SHIFTING' || activity?.activityTypeCode === 'DRAWING_APPROVAL') && !newRecordSubtype,
        }}
        onCancel={() => {
          setAddRecordOpen(false);
          setNewRecordName('');
          setNewRecordSubtype(undefined);
          setNewRecordMetadata({});
        }}
        okText="Add"
        confirmLoading={createRecordMutation.isPending}
        destroyOnClose
        width={520}
      >
        <Form layout="vertical" style={{ marginTop: 16 }}>
          {/* Utility Shifting: infringement/utility type */}
          {activity?.activityTypeCode === 'UTILITY_SHIFTING' && (
            <Form.Item label="Infringement / Utility Type" required>
              <Select
                autoFocus
                placeholder="Select utility type…"
                style={{ width: '100%' }}
                value={newRecordSubtype}
                onChange={(v) => setNewRecordSubtype(v as string)}
                options={[
                  { value: 'LT',                   label: 'LT' },
                  { value: 'HT',                   label: 'HT' },
                  { value: 'EHV',                  label: 'EHV' },
                  { value: 'PIPELINE_WATER',        label: 'Pipeline (Water)' },
                  { value: 'PIPELINE_INFLAMMABLE',  label: 'Pipeline (Inflammable Material)' },
                  { value: 'PIPELINE_OTHER',        label: 'Pipeline (Other)' },
                  { value: 'SNT_SIGNAL_TELECOM',    label: 'SNT Signal and Telecom Cable' },
                  { value: 'SNT_LOCATION_BOX',      label: 'SNT Location Box' },
                  { value: 'SNT_SIGNAL_MAST',       label: 'SNT Signal Mast' },
                  { value: 'SNT_IBH',               label: 'SNT IBH' },
                  { value: 'QUARTER',               label: 'Quarter' },
                  { value: 'STATION_BUILDING',      label: 'Station Building' },
                  { value: 'AQUEDUCT_CANAL',        label: 'Aqueduct / Canal' },
                  { value: 'ROAD',                  label: 'Road' },
                  { value: 'TSS',                   label: 'TSS' },
                  { value: 'SS',                    label: 'SS' },
                  { value: 'OHE_MAST',              label: 'OHE Mast' },
                ]}
              />
            </Form.Item>
          )}

          {/* Drawing Approval: drawing type determines the form */}
          {activity?.activityTypeCode === 'DRAWING_APPROVAL' && (
            <Form.Item
              label="Drawing Type"
              required
              extra="Determines the approval chain and form for this drawing"
            >
              <Select
                autoFocus
                placeholder="Select drawing type…"
                style={{ width: '100%' }}
                showSearch
                optionFilterProp="label"
                value={newRecordSubtype}
                onChange={(v) => setNewRecordSubtype(v as string)}
                options={[
                  { value: 'ESP',                   label: 'ESP — Earth Slope Profile' },
                  { value: 'SIP',                   label: 'SIP — Section Improvement Plan' },
                  { value: 'ST_LT_TOC',             label: 'ST / LT / TOC' },
                  { value: 'SWR',                   label: 'SWR — Site Working Report' },
                  { value: 'SWRD',                  label: 'SWRD' },
                  { value: 'FAT',                   label: 'FAT — Final Alignment Transect' },
                  { value: 'SAT',                   label: 'SAT — Site Assessment Template' },
                  { value: 'RSP',                   label: 'RSP — Route Survey Plan' },
                  { value: 'CABLE_ROUTE_PLAN',      label: 'Cable Route Plan' },
                  { value: 'LOP',                   label: 'LOP — Layout of Project' },
                  { value: 'PROJECT_SHEET',         label: 'Project Sheet' },
                  { value: 'GAD_MEGA',              label: 'GAD — Mega Bridge' },
                  { value: 'GAD_MAJOR',             label: 'GAD — Major Bridge' },
                  { value: 'GAD_MINOR',             label: 'GAD — Minor Bridge' },
                  { value: 'LWR_PLAN',              label: 'LWR Plan' },
                  { value: 'CURVE_DETAILS',         label: 'Curve Details' },
                  { value: 'GRADE_CONDONATION',     label: 'Grade Condonation' },
                  { value: 'BRIDGE_MINOR_SANCTION', label: 'Bridge Minor Sanction' },
                  { value: 'YARD_DISPENSATION',     label: 'Yard Dispensation' },
                  { value: 'YARD_MINOR_SANCTION',   label: 'Yard Minor Sanction' },
                  { value: 'STATION_BUILDING_GAD',  label: 'Station Building GAD' },
                  { value: 'FOB_GAD_TAD',           label: 'FOB GAD / TAD' },
                  { value: 'TUNNEL_DESIGN',         label: 'Tunnel Design' },
                ]}
              />
            </Form.Item>
          )}

          <Form.Item
            label="Record name"
            extra={
              activity?.activityTypeCode === 'UTILITY_SHIFTING'
                ? 'Optional — e.g. "OHT Km 134", "Water Main Section A"'
                : activity?.activityTypeCode === 'DRAWING_APPROVAL'
                ? 'Optional — e.g. "ESP Km 132–145", "GAD Minor Bridge"'
                : 'A short label to identify this record, e.g. "Ambala Village" or "Section 3"'
            }
          >
            <Input
              autoFocus={activity?.activityTypeCode !== 'UTILITY_SHIFTING' && activity?.activityTypeCode !== 'DRAWING_APPROVAL'}
              placeholder={
                activity?.activityTypeCode === 'UTILITY_SHIFTING'
                  ? 'e.g. OHT Km 134, Water Main A…'
                  : activity?.activityTypeCode === 'DRAWING_APPROVAL'
                  ? 'e.g. ESP Km 132–145, GAD Minor Bridge…'
                  : 'e.g. Ambala Village, Section 3…'
              }
              value={newRecordName}
              onChange={(e) => setNewRecordName(e.target.value)}
              onPressEnter={() => {
                if (!createRecordMutation.isPending) createRecordMutation.mutate();
              }}
            />
          </Form.Item>
        </Form>

        {/* LA / FC: scope details saved to activity metadataJson */}
        {activity && activity.activityTypeCode !== 'UTILITY_SHIFTING' && activity.activityTypeCode !== 'DRAWING_APPROVAL' && (
          <>
            <Divider orientation="left" orientationMargin={0}
              style={{ fontSize: 12, color: 'var(--ant-color-text-secondary)', margin: '4px 0 12px' }}>
              {typeLabel} details
            </Divider>
            <Form layout="vertical">
              <ActivityMetadataForm
                activityTypeCode={activity.activityTypeCode}
                values={{ ...(activity.metadataJson as Record<string, unknown> ?? {}), ...newRecordMetadata }}
                onChange={(key, value) => setNewRecordMetadata((prev) => ({ ...prev, [key]: value }))}
              />
            </Form>
          </>
        )}
      </Modal>
    </div>
  );
}
