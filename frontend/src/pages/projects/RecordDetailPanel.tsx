/**
 * RecordDetailPanel — right-pane content when a record node is selected in the tree.
 *
 * Layout:
 *   ┌───────────────────────────────────────┐
 *   │ Title bar  (name · badge · Edit · ✕)  │  fixed
 *   ├───────────────────────────────────────┤
 *   │                                       │
 *   │  Details (Descriptions)               │
 *   │  Activity metadata (view / edit)      │
 *   │  Workflow state                       │
 *   │  Comments               ↕ scroll      │
 *   │  Attachments                          │
 *   │  History                              │
 *   │                                       │
 *   └───────────────────────────────────────┘
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import {
  Alert,
  Button,
  Descriptions,
  Divider,
  Dropdown,
  Form,
  Input,
  Modal,
  notification,
  Popconfirm,
  Skeleton,
  Space,
  Tag,
  Typography,
} from 'antd';
import {
  CheckCircleOutlined,
  CloseOutlined,
  DeleteOutlined,
  EditOutlined,
  FileTextOutlined,
  MoreOutlined,
  RollbackOutlined,
  SafetyOutlined,
  SaveOutlined,
  SendOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';

import { deleteRecord, fetchRecord, patchRecord, type ActivityRecordDetail } from '@api/activityRecords';
import { fetchActivityById, updateActivity } from '@api/projects';
import { fetchWorkflowState, performWorkflowAction, type SectionWorkflowState, type WorkflowActionCode } from '@api/workflow';
import { useAuthStore } from '@stores/authStore';
import { CommentPanel } from '@components/comments/CommentPanel';
import { HistoryPanel } from '@components/comments/HistoryPanel';
import {
  AttachmentPanel,
  ACCEPT_DOCUMENTS,
  ACCEPT_GEOGRAPHIC,
  ACCEPT_IMAGES,
  ACCEPT_VIDEO,
  ACCEPT_ALL,
} from '@components/attachments/AttachmentPanel';
import { ActivityMetadataForm, ActivityMetadataView } from './ActivityMetadataForm';

const { Text } = Typography;

// ── State colours / labels ────────────────────────────────────────────────────

const RECORD_STATE_COLORS: Record<string, string> = {
  DRAFT:                      'default',
  SUBMITTED_FOR_VERIFICATION: 'blue',
  VERIFIED:                   'cyan',
  AUTHENTICATED:              'green',
  SENT_BACK_TO_DYCE:          'orange',
  SENT_BACK_TO_NODAL:         'gold',
};

const RECORD_STATE_LABELS: Record<string, string> = {
  DRAFT:                      'Draft',
  SUBMITTED_FOR_VERIFICATION: 'Submitted',
  VERIFIED:                   'Pending Authentication',
  AUTHENTICATED:              'Authenticated',
  SENT_BACK_TO_DYCE:          'Sent Back to Dy CE/C',
  SENT_BACK_TO_NODAL:         'Sent Back to Nodal',
};

function recordLabel(record: ActivityRecordDetail): string {
  if (record.name)          return record.name;
  if (record.recordSubtype) return record.recordSubtype.replace(/_/g, ' ');
  return 'Record';
}

// ── Divider style ─────────────────────────────────────────────────────────────

const DIVIDER_STYLE: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--ant-color-text-secondary)',
  margin: '0 0 10px',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
};

// ── Per-activity-type attachment config ───────────────────────────────────────

interface AttachmentConfig {
  accept: string;
  uploadHint: string;
}

const ATTACHMENT_CONFIG: Record<string, AttachmentConfig> = {
  LAND_ACQUISITION: {
    accept: ACCEPT_DOCUMENTS,
    uploadHint: 'PDF · Word · Excel · max 10 GB',
  },
  FOREST_CLEARANCE: {
    accept: [ACCEPT_DOCUMENTS, ACCEPT_IMAGES, ACCEPT_GEOGRAPHIC].join(','),
    uploadHint: 'PDF · Word · KMZ/KML · GeoTIFF · max 10 GB',
  },
  UTILITY_SHIFTING: {
    accept: [ACCEPT_DOCUMENTS, ACCEPT_IMAGES].join(','),
    uploadHint: 'PDF · Word · Images · max 10 GB',
  },
  DRAWING_APPROVAL: {
    accept: [ACCEPT_DOCUMENTS, ACCEPT_IMAGES, ACCEPT_GEOGRAPHIC].join(','),
    uploadHint: 'PDF · Word · DWG/GeoTIFF · KMZ · max 10 GB',
  },
  TENDER_PACKAGING: {
    accept: ACCEPT_DOCUMENTS,
    uploadHint: 'PDF · Word · Excel · max 10 GB',
  },
  TEMPORARY_OFFICE_SPACE: {
    accept: [ACCEPT_DOCUMENTS, ACCEPT_IMAGES].join(','),
    uploadHint: 'PDF · Word · Images · max 10 GB',
  },
};

const DGPS_TYPES = [ACCEPT_GEOGRAPHIC, ACCEPT_IMAGES, ACCEPT_VIDEO].join(',');
const DEFAULT_ATTACHMENT_CONFIG: AttachmentConfig = {
  accept: ACCEPT_ALL,
  uploadHint: 'PDF · KMZ · GeoTIFF · Video · max 10 GB',
};

function attachmentConfigFor(activityTypeCode: string): AttachmentConfig {
  if (activityTypeCode.startsWith('DGPS') || activityTypeCode.includes('SURVEY')) {
    return { accept: DGPS_TYPES, uploadHint: 'KMZ · KML · GeoTIFF · CSV · Video · max 10 GB' };
  }
  return ATTACHMENT_CONFIG[activityTypeCode] ?? DEFAULT_ATTACHMENT_CONFIG;
}

// ── Panel ─────────────────────────────────────────────────────────────────────

interface RecordDetailPanelProps {
  recordId: string;
  activityTypeCode: string;
  canEdit: boolean;
  onClose: () => void;
  onDelete?: () => void;
}

export function RecordDetailPanel({
  recordId,
  activityTypeCode,
  canEdit,
  onClose,
  onDelete,
}: RecordDetailPanelProps) {
  const { t } = useTranslation('forms');
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const currentUser = useAuthStore((s) => s.currentUser);

  const [notifApi, notifCtx] = notification.useNotification();

  // ── Edit state ─────────────────────────────────────────────────────────────
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editMetadata, setEditMetadata] = useState<Record<string, unknown>>({});

  // ── Send-back modal state ──────────────────────────────────────────────────
  const [sendBackOpen, setSendBackOpen] = useState(false);
  const [sendBackComment, setSendBackComment] = useState('');

  // ── Data ───────────────────────────────────────────────────────────────────
  const recordQuery = useQuery<ActivityRecordDetail>({
    queryKey: ['record', recordId],
    queryFn: () => fetchRecord(recordId),
    staleTime: 30_000,
  });
  const record = recordQuery.data;

  const activityQuery = useQuery({
    queryKey: ['activity', record?.projectActivityId],
    queryFn: () => fetchActivityById(record!.projectActivityId),
    enabled: !!record?.projectActivityId,
    staleTime: 60_000,
  });
  const activity = activityQuery.data;

  const { data: workflowState } = useQuery({
    queryKey: ['workflow', recordId],
    queryFn: () => fetchWorkflowState(recordId),
    enabled: !!recordId,
    refetchOnWindowFocus: false,
  });

  const activeSectionState: SectionWorkflowState | undefined = workflowState?.instances[0];

  // ── Save mutation ──────────────────────────────────────────────────────────
  const saveMutation = useMutation({
    mutationFn: async () => {
      // 1. Patch record (updates dataJson + optionally name)
      await patchRecord(
        recordId,
        (record!.dataJson as Record<string, unknown>),
        editName.trim() || null,
      );
      // 2. Update activity metadata if anything was changed
      if (activity) {
        const metaValues = Object.fromEntries(
          Object.entries(editMetadata).filter(([, v]) => v !== undefined && v !== null && v !== ''),
        );
        await updateActivity(record!.projectActivityId, {
          name: activity.name,
          scopeNotes: activity.scopeNotes ?? undefined,
          targetCompletionDate: activity.targetCompletionDate ?? undefined,
          metadataJson: { ...(activity.metadataJson as Record<string, unknown> ?? {}), ...metaValues },
        });
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['record', recordId] });
      void queryClient.invalidateQueries({ queryKey: ['activity', record?.projectActivityId] });
      setEditing(false);
    },
  });

  // ── Delete mutation ───────────────────────────────────────────────────────
  const deleteMutation = useMutation({
    mutationFn: () => deleteRecord(recordId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['records', record?.projectActivityId] });
      onDelete?.();
      onClose();
    },
    onError: (err: Error) => {
      void Modal.error({ title: 'Delete failed', content: err.message });
    },
  });

  const confirmDelete = () => {
    Modal.confirm({
      title: 'Delete record?',
      content: 'This cannot be undone.',
      okText: 'Delete',
      okButtonProps: { danger: true },
      onOk: () => deleteMutation.mutate(),
    });
  };

  // ── Workflow mutation ──────────────────────────────────────────────────────
  const workflowMutation = useMutation({
    mutationFn: ({ action, comment }: { action: WorkflowActionCode; comment?: string }) =>
      performWorkflowAction(recordId, action, comment ? { comment } : undefined),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['workflow', recordId] });
      void queryClient.invalidateQueries({ queryKey: ['record', recordId] });
      notifApi.success({ message: 'Action completed', duration: 2 });
    },
    onError: (err: Error) => {
      notifApi.error({ message: 'Action failed', description: err.message, duration: 5 });
    },
  });

  const startEditing = () => {
    setEditName(record?.name ?? '');
    setEditMetadata({ ...(activity?.metadataJson as Record<string, unknown> ?? {}) });
    setEditing(true);
  };

  const cancelEditing = () => {
    setEditing(false);
    setEditName('');
    setEditMetadata({});
  };

  // ── Derived display values ─────────────────────────────────────────────────
  const stateColor  = RECORD_STATE_COLORS[record?.recordState ?? ''] ?? 'default';
  const stateLabel  = RECORD_STATE_LABELS[record?.recordState ?? ''] ?? (record?.recordState ?? '').replace(/_/g, ' ');
  const displayName = record ? recordLabel(record) : '…';
  const typeLabel   = activity?.activityTypeCode.replace(/_/g, ' ') ?? '';
  const isTerminal  = activeSectionState?.isTerminal ?? false;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {notifCtx}

      {/* ── Title bar ──────────────────────────────────────────────────────── */}
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
        <Text strong style={{
          flex: 1, minWidth: 0,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          fontSize: 13,
        }}>
          {displayName}
        </Text>

        {record && (
          <Tag color={stateColor} style={{ margin: 0, flexShrink: 0, fontSize: 11 }}>
            {stateLabel}
          </Tag>
        )}

        {/* Save / Cancel while editing details */}
        {editing && (
          <Space size={4}>
            <Button size="small" onClick={cancelEditing} disabled={saveMutation.isPending}>
              Cancel
            </Button>
            <Button
              size="small"
              type="primary"
              icon={<SaveOutlined />}
              loading={saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
            >
              Save
            </Button>
          </Space>
        )}

        {/* Primary: Edit (opens RJSF form) + ⋯ overflow with Edit details */}
        {canEdit && record && !editing && (
          <Space size={4}>
            <Button
              size="small"
              type="primary"
              icon={<EditOutlined />}
              onClick={() => navigate(`/records/${recordId}/edit`, { state: { returnPath: window.location.pathname } })}
            >
              Edit
            </Button>
            <Dropdown
              trigger={['click']}
              menu={{
                items: [
                  ...(!isTerminal ? [{
                    key: 'edit-details',
                    icon: <EditOutlined />,
                    label: 'Edit details',
                    onClick: startEditing,
                  }] : []),
                  { type: 'divider' as const },
                  {
                    key: 'delete',
                    icon: <DeleteOutlined />,
                    label: 'Delete',
                    danger: true,
                    onClick: confirmDelete,
                  },
                ],
              }}
            >
              <Button size="small" icon={<MoreOutlined />} />
            </Dropdown>
          </Space>
        )}

        <Button type="text" size="small" icon={<CloseOutlined />} onClick={onClose}
          style={{ flexShrink: 0 }} />
      </div>

      {/* ── Scrollable body ─────────────────────────────────────────────────── */}
      {recordQuery.isLoading ? (
        <div style={{ padding: 16 }}>
          <Skeleton active paragraph={{ rows: 5 }} />
        </div>
      ) : recordQuery.isError ? (
        <Alert
          type="error"
          message="Failed to load record"
          description={String(recordQuery.error)}
          showIcon
          style={{ margin: 16 }}
          action={<Button size="small" onClick={() => void recordQuery.refetch()}>Retry</Button>}
        />
      ) : record ? (
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, padding: 16 }}>
          <Space direction="vertical" size={0} style={{ width: '100%' }}>

            {/* ── Record metadata ──────────────────────────────────────────── */}
            <div style={{ marginBottom: 16 }}>
              <Divider orientation="left" orientationMargin={0} style={DIVIDER_STYLE}>
                Details
              </Divider>

              {editing ? (
                <Form layout="vertical">
                  <Form.Item label="Record name" style={{ marginBottom: 8 }}>
                    <Input
                      autoFocus
                      placeholder="e.g. Ambala Village, Section 3…"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                    />
                  </Form.Item>
                </Form>
              ) : null}

              <Descriptions size="small" column={1} bordered>
                <Descriptions.Item label="State">
                  <Tag color={stateColor} style={{ margin: 0 }}>{stateLabel}</Tag>
                </Descriptions.Item>
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
            </div>

            {/* ── Record data (US) or activity scope (LA/FC) ──────────────── */}
            {activity && (
              <div style={{ marginBottom: 16 }}>
                <Divider orientation="left" orientationMargin={0} style={DIVIDER_STYLE}>
                  {typeLabel} details
                </Divider>

                {activity.activityTypeCode === 'UTILITY_SHIFTING' ? (
                  // For US, details come from record.dataJson — editable via the RJSF form
                  (() => {
                    const data = (record.dataJson ?? {}) as Record<string, unknown>;
                    const hasData = Object.keys(data).length > 0;
                    const UTILITY_TYPE_LABELS: Record<string, string> = {
                      LT:                   'LT',
                      HT:                   'HT',
                      EHV:                  'EHV',
                      PIPELINE_WATER:       'Pipeline (Water)',
                      PIPELINE_INFLAMMABLE: 'Pipeline (Inflammable Material)',
                      PIPELINE_OTHER:       'Pipeline (Other)',
                      SNT_SIGNAL_TELECOM:   'SNT Signal and Telecom Cable',
                      SNT_LOCATION_BOX:     'SNT Location Box',
                      SNT_SIGNAL_MAST:      'SNT Signal Mast',
                      SNT_IBH:              'SNT IBH',
                      QUARTER:              'Quarter',
                      STATION_BUILDING:     'Station Building',
                      AQUEDUCT_CANAL:       'Aqueduct / Canal',
                      ROAD:                 'Road',
                      TSS:                  'TSS',
                      SS:                   'SS',
                      OHE_MAST:             'OHE Mast',
                    };
                    const EXECUTING_AGENCY_LABELS: Record<string, string> = {
                      RAILWAY:      'Railway (Construction)',
                      USER_DEPT:    'User Department',
                      OPEN_LINE:    'Open Line',
                      CONSTRUCTION: 'Construction Organisation',
                    };
                    const US_ORDER = [
                      'record_name', 'block_section',
                      'utility_type', 'owner_agency',
                      'chainage_from', 'chainage_to', 'length_affected_km',
                      'executing_agency',
                      'estimate_position', 'fund_submission',
                      'material_available', 'agency_available',
                      'status_drawing_execution', 'target_removal_date',
                      'consent_state_govt', 'remarks',
                    ];
                    const US_LABELS: Record<string, string> = {
                      record_name:              'Record Name',
                      block_section:            'Block / Section',
                      utility_type:             'Infringement / Utility Type',
                      owner_agency:             'Owner Agency',
                      chainage_from:            'Chainage From',
                      chainage_to:              'Chainage To',
                      length_affected_km:       'Length of Alignment Affected (Km)',
                      executing_agency:         'Executing Agency',
                      estimate_position:        'Position of Estimate',
                      fund_submission:          'Fund Submission Date',
                      material_available:       'Material Available?',
                      agency_available:         'Executing Agency Available?',
                      status_drawing_execution: 'Status of Drawing and Execution Plan',
                      target_removal_date:      'Target Date for Removal',
                      consent_state_govt:       'Consent of State Govt. Obtained',
                      remarks:                  'Remarks',
                    };
                    const orderedEntries = US_ORDER
                      .filter((k) => data[k] !== null && data[k] !== undefined && data[k] !== '')
                      .map((k) => [k, data[k]] as [string, unknown]);
                    return hasData ? (
                      <Descriptions size="small" column={1} bordered>
                        {orderedEntries.map(([k, v]) => {
                            const display =
                              k === 'utility_type'     ? (UTILITY_TYPE_LABELS[String(v)] ?? String(v)) :
                              k === 'executing_agency' ? (EXECUTING_AGENCY_LABELS[String(v)] ?? String(v)) :
                              typeof v === 'boolean'   ? (v ? 'Yes' : 'No') :
                              String(v);
                            return (
                              <Descriptions.Item key={k} label={US_LABELS[k] ?? k}>
                                {display}
                              </Descriptions.Item>
                            );
                          })}
                      </Descriptions>
                    ) : (
                      <Text type="secondary" style={{ fontSize: 12, fontStyle: 'italic' }}>
                        No details recorded yet. Click "Edit" to add them.
                      </Text>
                    );
                  })()
                ) : activity.activityTypeCode === 'TEMPORARY_OFFICE_SPACE' ? (
                  (() => {
                    const data = (record.dataJson ?? {}) as Record<string, unknown>;
                    const hasData = Object.keys(data).length > 0;

                    const STRUCTURE_LABELS: Record<string, string> = {
                      NEW_REQUIRED:  'New structure required',
                      OLD_AVAILABLE: 'Old structure available',
                      HIRING:        'Hiring of structure',
                    };

                    const structureType = String(data.structure_type ?? '');

                    const conditionalLabel =
                      structureType === 'NEW_REQUIRED'  ? 'Agency Available?' :
                      structureType === 'OLD_AVAILABLE' ? 'Possession given by OL?' :
                      structureType === 'HIRING'        ? 'Rental Agreement?' :
                      null;

                    const conditionalValue =
                      structureType === 'NEW_REQUIRED'  ? data.agency_available :
                      structureType === 'OLD_AVAILABLE' ? data.possession_given :
                      structureType === 'HIRING'        ? data.rental_agreement :
                      undefined;

                    return hasData ? (
                      <Descriptions size="small" column={1} bordered>
                        {data.record_name !== undefined && data.record_name !== '' && (
                          <Descriptions.Item label="Record Name">
                            {String(data.record_name)}
                          </Descriptions.Item>
                        )}
                        {data.office_spaces_required !== undefined && (
                          <Descriptions.Item label="Office Spaces Required">
                            {String(data.office_spaces_required)}
                          </Descriptions.Item>
                        )}
                        {data.block_section !== undefined && data.block_section !== '' && (
                          <Descriptions.Item label="Block / Section">
                            {String(data.block_section)}
                          </Descriptions.Item>
                        )}
                        {data.location !== undefined && data.location !== '' && (
                          <Descriptions.Item label="Location">
                            {String(data.location)}
                          </Descriptions.Item>
                        )}
                        {structureType && (
                          <Descriptions.Item label="Type of Structure">
                            {STRUCTURE_LABELS[structureType] ?? structureType}
                          </Descriptions.Item>
                        )}
                        {conditionalLabel !== null && conditionalValue !== undefined && (
                          <Descriptions.Item label={conditionalLabel}>
                            {typeof conditionalValue === 'boolean' ? (conditionalValue ? 'Yes' : 'No') : String(conditionalValue)}
                          </Descriptions.Item>
                        )}
                        {data.tdc !== undefined && data.tdc !== '' && (
                          <Descriptions.Item label="Target Date of Completion">
                            {String(data.tdc)}
                          </Descriptions.Item>
                        )}
                        {data.remarks !== undefined && data.remarks !== '' && (
                          <Descriptions.Item label="Remarks">
                            {String(data.remarks)}
                          </Descriptions.Item>
                        )}
                      </Descriptions>
                    ) : (
                      <Text type="secondary" style={{ fontSize: 12, fontStyle: 'italic' }}>
                        No details recorded yet. Click "Edit" to add them.
                      </Text>
                    );
                  })()
                ) : activity.activityTypeCode === 'TENDER_PACKAGING' ? (
                  (() => {
                    const data = (record.dataJson ?? {}) as Record<string, unknown>;
                    const hasData = Object.keys(data).length > 0;
                    return hasData ? (
                      <Descriptions size="small" column={1} bordered>
                        {data.package_name !== undefined && data.package_name !== '' && (
                          <Descriptions.Item label="Package Name">
                            {String(data.package_name)}
                          </Descriptions.Item>
                        )}
                        {data.packages_required !== undefined && (
                          <Descriptions.Item label="No. of Tender Packages Required">
                            {String(data.packages_required)}
                          </Descriptions.Item>
                        )}
                        {data.block_section !== undefined && data.block_section !== '' && (
                          <Descriptions.Item label="Block / Section">
                            {String(data.block_section)}
                          </Descriptions.Item>
                        )}
                        {data.epc_document_prepared !== undefined && (
                          <Descriptions.Item label="Preparation of EPC Document">
                            {data.epc_document_prepared ? 'Yes' : 'No'}
                          </Descriptions.Item>
                        )}
                        {data.tender_finalized !== undefined && (
                          <Descriptions.Item label="Finalization of EPC Tender">
                            {data.tender_finalized ? 'Yes' : 'No'}
                          </Descriptions.Item>
                        )}
                      </Descriptions>
                    ) : (
                      <Text type="secondary" style={{ fontSize: 12, fontStyle: 'italic' }}>
                        No details recorded yet. Click "Edit" to add them.
                      </Text>
                    );
                  })()
                ) : editing ? (
                  <Form layout="vertical">
                    <ActivityMetadataForm
                      activityTypeCode={activity.activityTypeCode}
                      values={editMetadata}
                      onChange={(key, value) =>
                        setEditMetadata((prev) => ({ ...prev, [key]: value }))
                      }
                    />
                  </Form>
                ) : (
                  <>
                    <ActivityMetadataView
                      activityTypeCode={activity.activityTypeCode}
                      metadataJson={(activity.metadataJson ?? {}) as Record<string, unknown>}
                    />
                    {Object.keys(activity.metadataJson ?? {}).length === 0 && (
                      <Text type="secondary" style={{ fontSize: 12, fontStyle: 'italic' }}>
                        No details recorded yet. Click ⋯ → "Edit details" to add them.
                      </Text>
                    )}
                  </>
                )}

                {saveMutation.isError && (
                  <Alert
                    type="error"
                    message="Save failed"
                    description={saveMutation.error instanceof Error ? saveMutation.error.message : undefined}
                    showIcon
                    style={{ marginTop: 8 }}
                  />
                )}
              </div>
            )}

            {/* ── Workflow state + actions ─────────────────────────────────── */}
            {activeSectionState && (
              <div style={{ marginBottom: 16 }}>
                <Divider orientation="left" orientationMargin={0} style={DIVIDER_STYLE}>
                  {t('record.panel.workflow')}
                </Divider>
                <div>
                  <Text type="secondary" style={{ fontSize: 12 }}>{t('record.workflow.stateLabel')}: </Text>
                  <Tag color={RECORD_STATE_COLORS[activeSectionState.currentStateCode] ?? 'default'} style={{ margin: 0 }}>
                    {RECORD_STATE_LABELS[activeSectionState.currentStateCode] ?? activeSectionState.currentStateCode}
                  </Tag>
                </div>
                <div style={{ marginTop: 4 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {t('record.workflow.enteredAt', {
                      date: dayjs(activeSectionState.enteredStateAt).format('DD MMM YYYY HH:mm'),
                    })}
                  </Text>
                </div>
                {activeSectionState.isSlaBreached && (
                  <Tag color="error" style={{ marginTop: 8 }}>SLA Breached</Tag>
                )}

                {/* Workflow action buttons */}
                {canEdit && !isTerminal && activeSectionState.availableActions.length > 0 && (
                  <Space direction="vertical" style={{ width: '100%', marginTop: 12 }} size={8}>
                    {activeSectionState.availableActions.includes('submit') && (
                      <Button type="primary" icon={<SendOutlined />} block
                        loading={workflowMutation.isPending}
                        onClick={() => workflowMutation.mutate({ action: 'submit' })}>
                        Submit for Verification
                      </Button>
                    )}
                    {activeSectionState.availableActions.includes('resubmit') && (
                      <Button icon={<SendOutlined />} block
                        loading={workflowMutation.isPending}
                        onClick={() => workflowMutation.mutate({ action: 'resubmit' })}>
                        Resubmit
                      </Button>
                    )}
                    {activeSectionState.availableActions.includes('verify') && (
                      <Button type="primary" icon={<CheckCircleOutlined />} block
                        loading={workflowMutation.isPending}
                        onClick={() => workflowMutation.mutate({ action: 'verify' })}>
                        Submit for Authentication
                      </Button>
                    )}
                    {activeSectionState.availableActions.includes('re_verify') && (
                      <Button icon={<CheckCircleOutlined />} block
                        loading={workflowMutation.isPending}
                        onClick={() => workflowMutation.mutate({ action: 're-verify' })}>
                        Re-verify
                      </Button>
                    )}
                    {activeSectionState.availableActions.includes('authenticate') && (
                      <Popconfirm
                        title="Authenticate this record?"
                        description="Authentication is irreversible."
                        okText="Authenticate" cancelText="Cancel"
                        onConfirm={() => workflowMutation.mutate({ action: 'authenticate' })}>
                        <Button type="primary" icon={<SafetyOutlined />} block
                          loading={workflowMutation.isPending}>
                          Authenticate
                        </Button>
                      </Popconfirm>
                    )}
                    {activeSectionState.availableActions.includes('send-back') && (
                      <Button danger icon={<RollbackOutlined />} block
                        loading={workflowMutation.isPending}
                        onClick={() => { setSendBackComment(''); setSendBackOpen(true); }}>
                        Send Back
                      </Button>
                    )}
                  </Space>
                )}
              </div>
            )}

            {/* ── Comments ─────────────────────────────────────────────────── */}
            <div style={{ marginBottom: 16 }}>
              <Divider orientation="left" orientationMargin={0} style={DIVIDER_STYLE}>
                {t('record.panel.comments')}
              </Divider>
              <CommentPanel
                entityType="ACTIVITY_RECORD"
                entityId={recordId}
                currentUserId={currentUser?.userId}
              />
            </div>

            {/* ── Attachments ──────────────────────────────────────────────── */}
            <div style={{ marginBottom: 16 }}>
              <Divider orientation="left" orientationMargin={0} style={DIVIDER_STYLE}>
                {t('record.panel.attachments')}
              </Divider>
              <AttachmentPanel
                entityType="ACTIVITY_RECORD"
                entityId={recordId}
                canUpload={currentUser?.permissions.includes('ATTACHMENT.UPLOAD.OWN_RECORDS')}
                currentUserId={currentUser?.userId}
                {...attachmentConfigFor(activityTypeCode)}
              />
            </div>

            {/* ── History ──────────────────────────────────────────────────── */}
            <div style={{ marginBottom: 8 }}>
              <Divider orientation="left" orientationMargin={0} style={DIVIDER_STYLE}>
                {t('record.panel.history')}
              </Divider>
              <HistoryPanel recordId={recordId} />
            </div>

          </Space>
        </div>
      ) : null}

      {/* ── Send Back modal ────────────────────────────────────────────────── */}
      <Modal
        title="Send Back"
        open={sendBackOpen}
        onCancel={() => setSendBackOpen(false)}
        okText="Send Back"
        okButtonProps={{ danger: true, disabled: !sendBackComment.trim() }}
        confirmLoading={workflowMutation.isPending}
        onOk={() => {
          workflowMutation.mutate(
            { action: 'send-back', comment: sendBackComment.trim() },
            { onSuccess: () => setSendBackOpen(false) },
          );
        }}
        destroyOnClose
      >
        <Form layout="vertical" style={{ marginTop: 8 }}>
          <Form.Item label="Reason for sending back" required>
            <Input.TextArea
              autoFocus
              rows={4}
              placeholder="Provide a reason…"
              value={sendBackComment}
              onChange={(e) => setSendBackComment(e.target.value)}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
