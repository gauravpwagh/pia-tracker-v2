/**
 * RecordDetailPanel — right-pane content when a record node is selected in the tree.
 *
 * For activity types that have an RJSF form (LAND_ACQUISITION, FOREST_CLEARANCE) the
 * full form is rendered inline — no navigation to a separate page.
 *
 * For DRAWING_APPROVAL the approver checklist is shown inline.
 *
 * Layout (form types):
 *   ┌─────────────────────────────────┐
 *   │ Title bar (name · badge · ✕)    │  fixed
 *   ├─────────────────────────────────┤
 *   │ Section tabs (if multi-section) │  fixed
 *   ├─────────────────────────────────┤
 *   │ RJSF form                       │  scrollable
 *   ├─────────────────────────────────┤
 *   │ Save · Workflow · Autosave      │  fixed
 *   └─────────────────────────────────┘
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import {
  Alert,
  Badge,
  Button,
  Descriptions,
  Divider,
  Flex,
  Skeleton,
  Space,
  Spin,
  Tabs,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import {
  CloseOutlined,
  FileTextOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';

import { fetchRecord, patchRecord, type ActivityRecordDetail } from '@api/activityRecords';
import { fetchFormDefinitionById } from '@api/formDefinitions';
import {
  fetchWorkflowState,
  performWorkflowAction,
  type SectionWorkflowState,
  type WorkflowActionCode,
} from '@api/workflow';
import { useAutosave } from '@hooks/useAutosave';
import { RjsfForm } from '@/forms/RjsfForm';
import type { RjsfFormHandle } from '@/forms/RjsfForm';
import type { RJSFSchema, UiSchema } from '@rjsf/utils';
import { DrawingApproversPanel } from './DrawingApproversPanel';
import { SendBackModal } from '@pages/records/SendBackModal';

const { Text, Title } = Typography;

// ── Constants ─────────────────────────────────────────────────────────────────

/** Activity types whose records have an RJSF form rendered inline. */
const FORM_TYPES = new Set(['LAND_ACQUISITION', 'FOREST_CLEARANCE']);

// ── State colours / labels ────────────────────────────────────────────────────

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

const SECTION_DOT_COLORS: Record<string, string> = {
  DRAFT:                        '#d9d9d9',
  SUBMITTED_FOR_VERIFICATION:   '#1677ff',
  VERIFIED:                     '#52c41a',
  AUTHENTICATED:                '#722ed1',
  SENT_BACK_TO_DYCE:            '#fa8c16',
  SENT_BACK_TO_NODAL:           '#fa8c16',
};

function recordLabel(record: ActivityRecordDetail): string {
  if (record.name) return record.name;
  if (record.recordSubtype) return record.recordSubtype.replace(/_/g, ' ');
  return 'Record';
}

// ── Workflow actions (bottom bar) ─────────────────────────────────────────────

interface WorkflowActionsProps {
  sectionState: SectionWorkflowState | undefined;
  sectionLabel: string;
  onAction: (action: WorkflowActionCode, comment?: string) => void;
  loading: boolean;
}

function WorkflowActions({ sectionState, sectionLabel, onAction, loading }: WorkflowActionsProps) {
  const { t } = useTranslation('forms');
  const [sendBackOpen, setSendBackOpen] = useState(false);

  if (!sectionState || sectionState.isTerminal) return null;

  const actions = sectionState.availableActions;
  const canSubmit   = actions.includes('submit');
  const canResubmit = actions.includes('resubmit');
  const canVerify   = actions.includes('verify');
  const canReVerify = actions.includes('re_verify');
  const canAuth     = actions.includes('authenticate');
  const canSendBack = actions.includes('send_back');

  return (
    <>
      <Space>
        {canSubmit && (
          <Tooltip title={t('record.actions.submitTooltip')}>
            <Button type="primary" loading={loading} onClick={() => onAction('submit')}>
              {t('record.actions.submitSection')}
            </Button>
          </Tooltip>
        )}
        {canResubmit && (
          <Button loading={loading} onClick={() => onAction('resubmit')}>
            {t('record.actions.resubmit')}
          </Button>
        )}
        {canVerify && (
          <Tooltip title={t('record.actions.verifyTooltip')}>
            <Button type="primary" loading={loading} onClick={() => onAction('verify')}>
              {t('record.actions.verify')}
            </Button>
          </Tooltip>
        )}
        {canReVerify && (
          <Button loading={loading} onClick={() => onAction('re-verify')}>
            {t('record.actions.reVerify')}
          </Button>
        )}
        {canAuth && (
          <Tooltip title={t('record.actions.authenticateTooltip')}>
            <Button type="primary" loading={loading} onClick={() => onAction('authenticate')}>
              {t('record.actions.authenticate')}
            </Button>
          </Tooltip>
        )}
        {canSendBack && (
          <Tooltip title={t('record.actions.sendBackTooltip')}>
            <Button danger loading={loading} onClick={() => setSendBackOpen(true)}>
              {t('record.actions.sendBack')}
            </Button>
          </Tooltip>
        )}
      </Space>

      <SendBackModal
        open={sendBackOpen}
        sectionLabel={sectionLabel}
        loading={loading}
        onConfirm={(comment) => { setSendBackOpen(false); onAction('send-back', comment); }}
        onCancel={() => setSendBackOpen(false)}
      />
    </>
  );
}

// ── Autosave indicator ────────────────────────────────────────────────────────

function AutosaveIndicator({ status, savedAt }: { status: string; savedAt: Date | null }) {
  const { t } = useTranslation('forms');
  if (status === 'saving') return <Text type="secondary" style={{ fontSize: 12 }}>{t('record.autosave.saving')}</Text>;
  if (status === 'saved' && savedAt)
    return <Text type="secondary" style={{ fontSize: 12 }}>{t('record.autosave.saved', { time: dayjs(savedAt).format('HH:mm') })}</Text>;
  if (status === 'error') return <Text type="danger" style={{ fontSize: 12 }}>{t('record.autosave.saveFailed')}</Text>;
  return null;
}

// ── Inline form view ──────────────────────────────────────────────────────────

interface RecordFormInlineProps {
  recordId: string;
  canEdit: boolean;
}

function RecordFormInline({ recordId, canEdit }: RecordFormInlineProps) {
  const { t } = useTranslation('forms');
  const queryClient = useQueryClient();

  // ── Data ──────────────────────────────────────────────────────────────────

  const {
    data: record,
    isLoading: recordLoading,
    error: recordError,
    refetch: refetchRecord,
  } = useQuery({
    queryKey: ['record', recordId],
    queryFn: () => fetchRecord(recordId),
    staleTime: 30_000,
  });

  const { data: formDef, isLoading: schemaLoading, error: schemaError } = useQuery({
    queryKey: ['formDef', record?.formDefinitionId],
    queryFn: () => fetchFormDefinitionById(record!.formDefinitionId),
    enabled: !!record?.formDefinitionId,
  });

  const { data: workflowState } = useQuery({
    queryKey: ['workflow', recordId],
    queryFn: () => fetchWorkflowState(recordId),
    enabled: !!recordId,
    refetchOnWindowFocus: false,
  });

  // ── Section state ──────────────────────────────────────────────────────────

  const sectionCodes = formDef?.sectionCodes ?? [];
  const hasSections = sectionCodes.length > 0;
  const [activeSection, setActiveSection] = useState('');
  const activeSectionResolved = hasSections ? activeSection || sectionCodes[0] : '';

  const sectionStates: Record<string, SectionWorkflowState> = {};
  if (workflowState) {
    for (const inst of workflowState.instances) {
      if (inst.sectionCode) sectionStates[inst.sectionCode] = inst;
    }
  }
  const activeSectionState = activeSectionResolved
    ? sectionStates[activeSectionResolved]
    : (workflowState?.instances[0] ?? undefined);

  // ── Form data + autosave ───────────────────────────────────────────────────

  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const formDataRef = useRef<Record<string, unknown>>({});
  const formRef = useRef<RjsfFormHandle>(null);

  useEffect(() => {
    if (record) {
      const data = record.dataJson as Record<string, unknown>;
      setFormData(data);
      formDataRef.current = data;
    }
  }, [record?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const { status: autosaveStatus, savedAt, markDirty, saveNow } = useAutosave({
    saveFn: useCallback(async () => {
      await patchRecord(recordId, formDataRef.current);
    }, [recordId]),
  });

  const handleFormChange = useCallback(
    (sectionData: Record<string, unknown>) => {
      const next = hasSections && activeSectionResolved
        ? { ...formDataRef.current, [activeSectionResolved]: sectionData }
        : sectionData;
      setFormData(next);
      formDataRef.current = next;
      markDirty();
    },
    [markDirty, activeSectionResolved, hasSections],
  );

  const handleReload = useCallback(async () => {
    const result = await refetchRecord();
    if (result.data) {
      const data = result.data.dataJson as Record<string, unknown>;
      setFormData(data);
      formDataRef.current = data;
    }
  }, [refetchRecord]);

  // ── Workflow ───────────────────────────────────────────────────────────────

  const workflowMutation = useMutation({
    mutationFn: ({ action, comment }: { action: WorkflowActionCode; comment?: string }) =>
      performWorkflowAction(recordId, action, {
        sectionCode: activeSectionResolved || null,
        comment: comment ?? null,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['workflow', recordId] });
      void queryClient.invalidateQueries({ queryKey: ['record', recordId] });
      void queryClient.invalidateQueries({ queryKey: ['comments', 'ACTIVITY_RECORD', recordId] });
      void queryClient.invalidateQueries({ queryKey: ['recordHistory', recordId] });
    },
  });

  const handleWorkflowAction = useCallback(
    (action: WorkflowActionCode, comment?: string) => workflowMutation.mutate({ action, comment }),
    [workflowMutation],
  );

  // ── Schema slicing ─────────────────────────────────────────────────────────

  const sectionSchema: RJSFSchema | undefined = formDef
    ? activeSectionResolved
      ? buildSectionSchema(formDef.schemaJson as RJSFSchema, activeSectionResolved)
      : (formDef.schemaJson as RJSFSchema)
    : undefined;

  const sectionUiSchema: UiSchema | undefined = formDef
    ? activeSectionResolved
      ? ((formDef.uiSchemaJson as UiSchema)?.[activeSectionResolved] as UiSchema | undefined)
      : (formDef.uiSchemaJson as UiSchema | undefined)
    : undefined;

  const sectionLabel = activeSectionResolved
    ? activeSectionResolved.replace(/_/g, ' ')
    : 'Record';

  // ── Render ─────────────────────────────────────────────────────────────────

  if (recordLoading || schemaLoading) {
    return (
      <Flex justify="center" align="center" style={{ flex: 1 }}>
        <Spin size="large" tip={t('common:feedback.loading')} />
      </Flex>
    );
  }

  if (recordError || !record) {
    return (
      <Alert
        type="error"
        message={t('forms:record.error.loadFailed')}
        showIcon
        style={{ margin: 16 }}
        action={<Button size="small" onClick={() => void refetchRecord()}>Retry</Button>}
      />
    );
  }

  if (schemaError || !formDef || !sectionSchema) {
    return (
      <Alert
        type="error"
        message={t('forms:record.error.schemaLoadFailed')}
        showIcon
        style={{ margin: 16 }}
      />
    );
  }

  const isDisabled = !canEdit ||
    autosaveStatus === 'conflict' ||
    activeSectionState?.isTerminal === true;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>

      {/* Conflict / workflow error alerts */}
      {autosaveStatus === 'conflict' && (
        <Alert
          type="warning"
          showIcon
          message={t('forms:record.error.conflict')}
          description={t('forms:record.error.conflictDetail')}
          action={<Button size="small" onClick={() => void handleReload()}>Reload</Button>}
          style={{ margin: '0 12px 8px', flexShrink: 0 }}
        />
      )}
      {workflowMutation.isError && (
        <Alert
          type="error"
          showIcon
          closable
          message="Workflow action failed"
          description={String(workflowMutation.error)}
          style={{ margin: '0 12px 8px', flexShrink: 0 }}
        />
      )}

      {/* Section tabs (horizontal, compact) */}
      {hasSections && (
        <div style={{
          flexShrink: 0,
          borderBottom: '1px solid var(--ant-color-border)',
          padding: '0 12px',
          background: 'var(--ant-color-bg-container)',
        }}>
          <Tabs
            size="small"
            activeKey={activeSectionResolved}
            onChange={setActiveSection}
            items={sectionCodes.map((code) => {
              const inst = sectionStates[code];
              const dotColor = inst
                ? (SECTION_DOT_COLORS[inst.currentStateCode] ?? '#d9d9d9')
                : '#d9d9d9';
              return {
                key: code,
                label: (
                  <Flex align="center" gap={4}>
                    <Badge color={dotColor} />
                    <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      {code.replace(/_/g, ' ')}
                    </span>
                  </Flex>
                ),
              };
            })}
          />
        </div>
      )}

      {/* Scrollable form area */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 12px' }}>
        <RjsfForm
          ref={formRef}
          schema={sectionSchema}
          uiSchema={sectionUiSchema}
          formData={
            hasSections && activeSectionResolved
              ? ((formData[activeSectionResolved] ?? {}) as Record<string, unknown>)
              : formData
          }
          onChange={handleFormChange}
          disabled={isDisabled}
        />
      </div>

      {/* Bottom action bar */}
      <div style={{
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 12px',
        borderTop: '1px solid var(--ant-color-border)',
        background: 'var(--ant-color-bg-container)',
        flexWrap: 'wrap',
      }}>
        {canEdit && (
          <Button
            size="small"
            onClick={() => void saveNow()}
            disabled={autosaveStatus === 'saving' || autosaveStatus === 'conflict'}
            loading={autosaveStatus === 'saving'}
          >
            {t('forms:record.actions.saveDraft')}
          </Button>
        )}
        <WorkflowActions
          sectionState={activeSectionState}
          sectionLabel={sectionLabel}
          onAction={handleWorkflowAction}
          loading={workflowMutation.isPending}
        />
        <div style={{ marginLeft: 'auto' }}>
          <AutosaveIndicator status={autosaveStatus} savedAt={savedAt} />
        </div>
      </div>
    </div>
  );
}

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
  const recordQuery = useQuery<ActivityRecordDetail>({
    queryKey: ['record', recordId],
    queryFn: () => fetchRecord(recordId),
    staleTime: 30_000,
  });

  const record = recordQuery.data;
  const stateColor = RECORD_STATE_COLORS[record?.recordState ?? ''] ?? 'default';
  const stateLabel = RECORD_STATE_LABELS[record?.recordState ?? ''] ?? (record?.recordState ?? '').replace(/_/g, ' ');
  const displayName = record ? recordLabel(record) : '…';

  const hasForm      = FORM_TYPES.has(activityTypeCode);
  const hasApprovers = activityTypeCode === 'DRAWING_APPROVAL';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

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
        <Text
          strong
          style={{
            flex: 1,
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            fontSize: 13,
          }}
        >
          {displayName}
        </Text>

        {record && (
          <Tag color={stateColor} style={{ margin: 0, flexShrink: 0, fontSize: 11 }}>
            {stateLabel}
          </Tag>
        )}

        <Button
          type="text"
          size="small"
          icon={<CloseOutlined />}
          onClick={onClose}
          style={{ flexShrink: 0 }}
        />
      </div>

      {/* ── Body ───────────────────────────────────────────────────────────── */}
      {hasForm ? (
        /* Full inline form — RecordFormInline manages its own scroll + action bar */
        <RecordFormInline recordId={recordId} canEdit={canEdit} />
      ) : (
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

              {/* Drawing approvers */}
              {hasApprovers && (
                <>
                  <Divider
                    orientation="left"
                    orientationMargin={0}
                    style={{ fontSize: 12, color: 'var(--ant-color-text-secondary)', margin: '4px 0 10px' }}
                  >
                    Approval Checklist
                  </Divider>
                  <DrawingApproversPanel recordId={recordId} canEdit={canEdit} />
                </>
              )}
            </Space>
          )}
        </div>
      )}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildSectionSchema(schema: RJSFSchema, sectionCode: string): RJSFSchema {
  const props = (schema.properties ?? {}) as Record<string, RJSFSchema>;
  const defs  = (schema.$defs  ?? {}) as Record<string, RJSFSchema>;

  const sectionProp = props[sectionCode];
  if (!sectionProp) return schema;

  let sectionSchema: RJSFSchema = sectionProp;
  const ref = sectionProp.$ref as string | undefined;
  if (ref) {
    const defName = ref.replace('#/$defs/', '');
    sectionSchema = defs[defName] ?? sectionProp;
  }

  return { ...sectionSchema, $defs: defs };
}
