/* eslint-disable security/detect-object-injection */
// Bracket-notation accesses throughout this file use typed Record<string,…> keys that are
// derived from validated API responses, not user input — no injection risk here.

/**
 * RecordEditPage — Archetype 3 (docs/ui.md § 3).
 *
 * Path: `/records/:recordId/edit`
 *
 * ## Layout
 *
 * Three columns:
 *   1. Left  — Section nav (Ant Design Tabs tabPosition="left").
 *              Each tab label shows a state-coloured dot for the section's
 *              current workflow state.
 *   2. Centre — RJSF form for the selected section (or full form).
 *   3. Right  — Collapsible panel: Comments | History | Workflow.
 *
 * ## Autosave
 *
 * useAutosave fires every 30 s when the form is dirty.  The dirty flag is
 * set on every RJSF onChange.  Status text ("Saved at 14:23") is shown in
 * the sticky bottom bar.
 *
 * ## Optimistic locking
 *
 * patchRecord sends If-Match from the ETag store.  A 409 response puts the
 * autosave hook into 'conflict' state and the page renders a reload prompt.
 *
 * ## Section workflow
 *
 * Each section has an independent workflow instance (SECTION_STANDARD_V1).
 * Workflow state is fetched from GET /api/v1/activity-records/{id}/workflow.
 * The bottom bar shows the primary action(s) for the active section:
 *   Dy CE/C in DRAFT                    → "Submit for Verification"
 *   Nodal in PENDING_NODAL_VERIFICATION → "Submit for Authentication" + "Send Back"
 *   CE/C in PENDING_CE_C_AUTHENTICATION → "Authenticate" + "Send Back"
 *   SENT_BACK_TO_DYCE                   → "Resubmit"
 *   SENT_BACK_TO_NODAL                  → "Re-verify"
 * Send Back always opens a modal requiring a comment.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Breadcrumb,
  Button,
  Col,
  Divider,
  Flex,
  Row,
  Space,
  Spin,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import {
  CheckOutlined,
  CloseOutlined,
  LeftOutlined,
  ReloadOutlined,
  RightOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';

import { fetchRecord, fetchActivity, patchRecord } from '@api/activityRecords';
import { fetchProjectDetail } from '@api/projects';
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
import { SendBackModal } from './SendBackModal';
import { CommentPanel } from '@components/comments/CommentPanel';
import { HistoryPanel } from '@components/comments/HistoryPanel';
import { AttachmentPanel } from '@components/attachments/AttachmentPanel';
import { useAuthStore } from '@stores/authStore';

const { Title, Text } = Typography;

// ── State badge ───────────────────────────────────────────────────────────────

const STATE_COLORS: Record<string, string> = {
  DRAFT: 'default',
  SUBMITTED_FOR_VERIFICATION: 'processing',
  VERIFIED: 'success',
  AUTHENTICATED: 'purple',
  SENT_BACK_TO_DYCE: 'warning',
  SENT_BACK_TO_NODAL: 'warning',
};


const STATE_LABELS: Record<string, string> = {
  DRAFT:                        'Draft',
  SUBMITTED_FOR_VERIFICATION:   'Pending Nodal Verification',
  VERIFIED:                     'Pending CE/C Authentication',
  AUTHENTICATED:                'Authenticated',
  SENT_BACK_TO_DYCE:            'Sent Back to Dy CE/C',
  SENT_BACK_TO_NODAL:           'Sent Back to Nodal Dy CE/C',
};

function RecordStateBadge({ state }: { state: string }) {
  const label = STATE_LABELS[state] ?? state.replace(/_/g, ' ');
  const color = STATE_COLORS[state] ?? 'default';
  return <Tag color={color}>{label}</Tag>;
}

// ── Section progress sidebar ──────────────────────────────────────────────────

type StepStatus = 'wait' | 'process' | 'finish' | 'error';

function hasValue(v: unknown): boolean {
  if (v === null || v === undefined || v === '' || v === false) return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'object') return Object.keys(v as Record<string, unknown>).length > 0;
  return true; // numbers (incl. 0), non-empty strings, true
}

function isSectionComplete(
  sectionCode: string,
  formData: Record<string, unknown>,
): boolean {
  const sectionData = formData[sectionCode];
  if (!sectionData || typeof sectionData !== 'object') return false;
  // A section is "done" when at least one field has a meaningful user-entered value.
  // false, [], {} are treated as "not filled" since they are common RJSF defaults.
  return Object.values(sectionData as Record<string, unknown>).some(hasValue);
}

function sectionStepStatus(
  code: string,
  activeSection: string,
  inst: SectionWorkflowState | undefined,
  formData: Record<string, unknown>,
): StepStatus {
  if (
    inst?.currentStateCode === 'SENT_BACK_TO_DYCE' ||
    inst?.currentStateCode === 'SENT_BACK_TO_NODAL'
  ) return 'error';
  if (isSectionComplete(code, formData)) return 'finish';
  if (code === activeSection) return 'process';
  if (
    inst?.currentStateCode === 'SUBMITTED_FOR_VERIFICATION' ||
    inst?.currentStateCode === 'VERIFIED' ||
    inst?.currentStateCode === 'AUTHENTICATED'
  ) return 'process';
  return 'wait';
}

const STEP_COLORS: Record<StepStatus, { bg: string; border: string; color: string }> = {
  wait:    { bg: 'transparent',  border: '#d9d9d9', color: '#bfbfbf' },
  process: { bg: '#1677ff',      border: '#1677ff', color: '#fff'    },
  finish:  { bg: '#52c41a',      border: '#52c41a', color: '#fff'    },
  error:   { bg: '#ff4d4f',      border: '#ff4d4f', color: '#fff'    },
};

interface SectionStepsProps {
  sectionCodes: string[];
  activeSection: string;
  onSelect: (code: string) => void;
  sectionStates: Record<string, SectionWorkflowState>;
  formData: Record<string, unknown>;
}

function SectionSteps({ sectionCodes, activeSection, onSelect, sectionStates, formData }: SectionStepsProps) {
  if (sectionCodes.length === 0) return null;

  return (
    <div style={{ padding: '20px 16px' }}>
      {sectionCodes.map((code, idx) => {
        const inst   = sectionStates[code];
        const status = sectionStepStatus(code, activeSection, inst, formData);
        const colors = STEP_COLORS[status];
        const isLast = idx === sectionCodes.length - 1;

        return (
          <div key={code} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
            {/* Row: icon + label */}
            <div
              role="button"
              onClick={() => onSelect(code)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', width: '100%' }}
            >
              {/* Circle icon */}
              <div style={{
                width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                background: colors.bg,
                border: `2px solid ${colors.border}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {status === 'finish' && <CheckOutlined style={{ fontSize: 11, color: colors.color }} />}
                {status === 'error'  && <CloseOutlined style={{ fontSize: 11, color: colors.color }} />}
                {status === 'process' && (
                  <span style={{ fontSize: 11, fontWeight: 700, color: colors.color, lineHeight: 1 }}>
                    {idx + 1}
                  </span>
                )}
                {status === 'wait' && (
                  <span style={{ fontSize: 11, color: colors.color, lineHeight: 1 }}>
                    {idx + 1}
                  </span>
                )}
              </div>

              {/* Label */}
              <span style={{
                fontSize: 11,
                fontWeight: status === 'process' ? 600 : 400,
                color: status === 'process' ? 'var(--ant-color-text)' : 'var(--ant-color-text-secondary)',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}>
                {code.replace(/_/g, ' ')}
              </span>
            </div>

            {/* Connector line */}
            {!isLast && (
              <div style={{
                width: 2,
                height: 20,
                background: status === 'finish' ? '#52c41a' : '#f0f0f0',
                marginLeft: 11,
                marginTop: 2,
                marginBottom: 2,
              }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Right panel ───────────────────────────────────────────────────────────────

interface WorkflowPanelProps {
  activeSectionState: SectionWorkflowState | undefined;
}

function WorkflowPanel({ activeSectionState }: WorkflowPanelProps) {
  const { t } = useTranslation('forms');

  return (
    <div style={{ padding: '0 4px' }}>
      {activeSectionState ? (
        <>
          <Text strong>{t('record.workflow.sectionHeader')}</Text>
          <div style={{ marginTop: 8 }}>
            <Text type="secondary">{t('record.workflow.stateLabel')}: </Text>
            <RecordStateBadge state={activeSectionState.currentStateCode} />
          </div>
          <div style={{ marginTop: 4 }}>
            <Text type="secondary">
              {t('record.workflow.enteredAt', {
                date: dayjs(activeSectionState.enteredStateAt).format('DD MMM YYYY HH:mm'),
              })}
            </Text>
          </div>
          {activeSectionState.isSlaBreached && (
            <Tag color="error" style={{ marginTop: 8 }}>
              SLA Breached
            </Tag>
          )}
        </>
      ) : (
        <Text type="secondary">{t('record.workflow.sectionHeader')}</Text>
      )}
    </div>
  );
}

interface RightPanelProps {
  activeSectionState: SectionWorkflowState | undefined;
  recordId: string;
}

function RightPanel({ activeSectionState, recordId }: RightPanelProps) {
  const { t } = useTranslation('forms');
  const currentUser = useAuthStore((s) => s.currentUser);

  const sectionStyle: React.CSSProperties = { marginBottom: 8 };
  const dividerStyle: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--ant-color-text-secondary)',
    margin: '0 0 10px',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  };

  return (
    <Space direction="vertical" size={0} style={{ width: '100%' }}>
      <div style={sectionStyle}>
        <Divider orientation="left" orientationMargin={0} style={dividerStyle}>
          {t('record.panel.workflow')}
        </Divider>
        <WorkflowPanel activeSectionState={activeSectionState} />
      </div>

      <div style={sectionStyle}>
        <Divider orientation="left" orientationMargin={0} style={dividerStyle}>
          {t('record.panel.comments')}
        </Divider>
        <CommentPanel
          entityType="ACTIVITY_RECORD"
          entityId={recordId}
          currentUserId={currentUser?.userId}
        />
      </div>

      <div style={sectionStyle}>
        <Divider orientation="left" orientationMargin={0} style={dividerStyle}>
          {t('record.panel.attachments')}
        </Divider>
        <AttachmentPanel
          entityType="ACTIVITY_RECORD"
          entityId={recordId}
          canUpload={currentUser?.permissions.includes('ATTACHMENT.UPLOAD.OWN_RECORDS')}
          currentUserId={currentUser?.userId}
        />
      </div>

      <div style={sectionStyle}>
        <Divider orientation="left" orientationMargin={0} style={dividerStyle}>
          {t('record.panel.history')}
        </Divider>
        <HistoryPanel recordId={recordId} />
      </div>
    </Space>
  );
}

// ── Autosave status indicator ─────────────────────────────────────────────────

function AutosaveIndicator({ status, savedAt }: { status: string; savedAt: Date | null }) {
  const { t } = useTranslation('forms');
  if (status === 'saving') return <Text type="secondary">{t('record.autosave.saving')}</Text>;
  if (status === 'saved' && savedAt)
    return (
      <Text type="secondary">
        {t('record.autosave.saved', { time: dayjs(savedAt).format('HH:mm') })}
      </Text>
    );
  if (status === 'error') return <Text type="danger">{t('record.autosave.saveFailed')}</Text>;
  return null;
}

// ── Workflow action buttons ───────────────────────────────────────────────────

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

  const canSubmit     = actions.includes('submit');
  const canResubmit   = actions.includes('resubmit');
  const canVerify     = actions.includes('verify');
  const canReVerify   = actions.includes('re_verify');
  const canAuth       = actions.includes('authenticate');
  const canSendBack   = actions.includes('send_back');

  return (
    <>
      <Space>
        {canSubmit && (
          <Tooltip title={t('record.actions.submitTooltip')}>
            <Button
              type="primary"
              loading={loading}
              onClick={() => onAction('submit')}
            >
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
            <Button
              type="primary"
              loading={loading}
              onClick={() => onAction('verify')}
            >
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
            <Button
              type="primary"
              loading={loading}
              onClick={() => onAction('authenticate')}
            >
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
        onConfirm={(comment) => {
          setSendBackOpen(false);
          onAction('send-back', comment);
        }}
        onCancel={() => setSendBackOpen(false)}
      />
    </>
  );
}

// ── Utility Shifting: dynamic schema filter ───────────────────────────────────
// Narrows the flat RJSF schema to only the fields relevant to the current
// utility_type + executing_agency combination.

const US_COMMON = [
  'utility_type', 'executing_agency', 'location_description',
  'chainage_from', 'chainage_to',
  'work_order_no', 'work_completed_on', 'completion_cert_pdf',
  'affected_track_length_km',
  'remarks',
];

// Agency-conditional field groups
const US_AGENCY_FIELDS: Record<string, string[]> = {
  // Non-Railway: contractor identification
  USER_DEPT:    ['contractor_name', 'work_order_date', 'estimate_position', 'fund_submission'],
  OPEN_LINE:    ['contractor_name', 'work_order_date', 'estimate_position', 'fund_submission_by_construction'],
  CONSTRUCTION: ['contractor_name', 'work_order_date', 'material_available', 'agency_available'],
  RAILWAY:      [],
};

const US_TYPE_FIELDS: Record<string, string[]> = {
  OVERHEAD_LINE:  ['pole_count', 'span_length_m'],
  WATER_PIPELINE: ['pipe_diameter_mm', 'length_m'],
  NALA:           ['nala_width_m', 'nala_length_m', 'revetment_type'],
  TELECOM_CABLE:  ['cable_length_m', 'cable_type'],
  GAS_PIPELINE:   ['pipe_diameter_mm', 'length_m'],
};

const US_TYPE_REQUIRED: Record<string, string[]> = {
  OVERHEAD_LINE:  ['pole_count'],
  WATER_PIPELINE: ['pipe_diameter_mm', 'length_m'],
  NALA:           ['nala_width_m', 'nala_length_m'],
  TELECOM_CABLE:  ['cable_length_m'],
  GAS_PIPELINE:   ['pipe_diameter_mm', 'length_m'],
};

function filterUsSchema(
  schema: RJSFSchema,
  utilityType: string,
  executingAgency: string,
): RJSFSchema {
  const agencyFields = US_AGENCY_FIELDS[executingAgency] ?? [];
  const typeFields   = US_TYPE_FIELDS[utilityType] ?? [];
  const allowed = new Set([
    ...US_COMMON,
    ...typeFields,
    ...agencyFields,
  ]);

  const props = schema.properties;
  const filteredProps = props
    ? Object.fromEntries(Object.entries(props).filter(([k]) => allowed.has(k)))
    : undefined;

  const baseRequired = (schema.required as string[] | undefined) ?? [];
  const required = [
    ...baseRequired.filter((k) => allowed.has(k)),
    ...(US_TYPE_REQUIRED[utilityType] ?? []),
  ].filter((v, i, a) => a.indexOf(v) === i); // dedupe

  const { allOf: _dropped, ...rest } = schema;
  return { ...rest, properties: filteredProps, required };
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function RecordEditPage() {
  const { recordId } = useParams<{ recordId: string }>();
  const navigate = useNavigate();
  const { state: routeState } = useLocation();
  const returnPath: string = (routeState as { returnPath?: string } | null)?.returnPath ?? '/projects';
  const { t } = useTranslation(['forms', 'common']);
  const queryClient = useQueryClient();

  // ── Data fetching ──────────────────────────────────────────────────────────

  const {
    data: record,
    isLoading: recordLoading,
    error: recordError,
    refetch: refetchRecord,
  } = useQuery({
    queryKey: ['record', recordId],
    queryFn: () => fetchRecord(recordId!),
    enabled: !!recordId,
  });

  const { data: activity } = useQuery({
    queryKey: ['activity', record?.projectActivityId],
    queryFn: () => fetchActivity(record!.projectActivityId),
    enabled: !!record?.projectActivityId,
  });

  const { data: project } = useQuery({
    queryKey: ['project', activity?.projectId],
    queryFn: () => fetchProjectDetail(activity!.projectId),
    enabled: !!activity?.projectId,
    staleTime: 300_000,
  });

  const {
    data: formDef,
    isLoading: schemaLoading,
    error: schemaError,
  } = useQuery({
    queryKey: ['formDef', record?.formDefinitionId],
    queryFn: () => fetchFormDefinitionById(record!.formDefinitionId),
    enabled: !!record?.formDefinitionId,
  });

  const { data: workflowState } = useQuery({
    queryKey: ['workflow', recordId],
    queryFn: () => fetchWorkflowState(recordId!),
    enabled: !!recordId,
    refetchOnWindowFocus: false,
  });

  // ── Section state ──────────────────────────────────────────────────────────

  const sectionCodes = formDef?.sectionCodes ?? [];
  const [activeSection, setActiveSection] = useState<string>('');
  const activeSectionResolved =
    sectionCodes.length > 0 ? activeSection || sectionCodes[0] : '';

  const hasSections = sectionCodes.length > 0;

  // Index section states by code for O(1) lookup
  const sectionStates: Record<string, SectionWorkflowState> = {};
  if (workflowState) {
    for (const inst of workflowState.instances) {
      if (inst.sectionCode) sectionStates[inst.sectionCode] = inst;
    }
  }

  const activeSectionState = activeSectionResolved
    ? sectionStates[activeSectionResolved]
    : (workflowState?.instances[0] ?? undefined);

  // ── Form data ──────────────────────────────────────────────────────────────

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

  // ── Autosave ───────────────────────────────────────────────────────────────

  const { status: autosaveStatus, savedAt, markDirty, saveNow } = useAutosave({
    saveFn: useCallback(async () => {
      await patchRecord(recordId!, formDataRef.current);
    }, [recordId]),
  });

  // ── RJSF onChange ─────────────────────────────────────────────────────────

  const handleFormChange = useCallback(
    (sectionData: Record<string, unknown>) => {
      const next =
        hasSections && activeSectionResolved
          ? { ...formDataRef.current, [activeSectionResolved]: sectionData }
          : sectionData;
      setFormData(next);
      formDataRef.current = next;
      markDirty();
    },
    [markDirty, activeSectionResolved, hasSections],
  );

  // ── Conflict reload ────────────────────────────────────────────────────────

  const handleReload = useCallback(async () => {
    const result = await refetchRecord();
    if (result.data) {
      const data = result.data.dataJson as Record<string, unknown>;
      setFormData(data);
      formDataRef.current = data;
    }
  }, [refetchRecord]);

  // ── Workflow actions ───────────────────────────────────────────────────────

  const workflowMutation = useMutation({
    mutationFn: ({
      action,
      comment,
    }: {
      action: WorkflowActionCode;
      comment?: string;
    }) =>
      performWorkflowAction(recordId!, action, {
        sectionCode: activeSectionResolved || null,
        comment: comment ?? null,
      }),
    onSuccess: () => {
      // Refresh workflow state so section icons + available actions update
      void queryClient.invalidateQueries({ queryKey: ['workflow', recordId] });
      // Also refresh the record (record_state cache may have changed)
      void queryClient.invalidateQueries({ queryKey: ['record', recordId] });
      // Refresh comments panel (send-back auto-creates a comment) and history tab
      void queryClient.invalidateQueries({ queryKey: ['comments', 'ACTIVITY_RECORD', recordId] });
      void queryClient.invalidateQueries({ queryKey: ['recordHistory', recordId] });
    },
  });

  const handleWorkflowAction = useCallback(
    (action: WorkflowActionCode, comment?: string) => {
      workflowMutation.mutate({ action, comment });
    },
    [workflowMutation],
  );

  // ── Section-filtered schema ────────────────────────────────────────────────

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

  // ── Utility Shifting: narrow schema to fields relevant to the selected type
  // utility_type is pre-populated in dataJson at record creation so it's
  // available from the first open. Falls back to record.recordSubtype.
  const effectiveSchema: RJSFSchema | undefined = useMemo(() => {
    if (!sectionSchema || formDef?.activityTypeCode !== 'UTILITY_SHIFTING') return sectionSchema;
    const utilityType     = (formData.utility_type     as string | undefined) ?? record?.recordSubtype ?? '';
    const executingAgency = (formData.executing_agency as string | undefined) ?? '';
    if (!utilityType) return sectionSchema;
    return filterUsSchema(sectionSchema, utilityType, executingAgency);
  }, [sectionSchema, formDef?.activityTypeCode, formData.utility_type, formData.executing_agency, record?.recordSubtype]);

  // ── Loading / error states ─────────────────────────────────────────────────

  if (recordLoading || schemaLoading) {
    return (
      <Flex justify="center" align="center" style={{ minHeight: 400 }}>
        <Spin size="large" tip={t('common:feedback.loading')} />
      </Flex>
    );
  }

  if (recordError || !record) {
    return (
      <Alert
        type="error"
        message={t('forms:record.error.loadFailed')}
        description={String(recordError)}
        action={
          <Button onClick={() => void refetchRecord()}>
            {t('common:actions.reload')}
          </Button>
        }
      />
    );
  }

  if (schemaError || !formDef || !(effectiveSchema ?? sectionSchema)) {
    return (
      <Alert
        type="error"
        message={t('forms:record.error.schemaLoadFailed')}
        description={String(schemaError)}
      />
    );
  }

  // ── Navigation helpers ─────────────────────────────────────────────────────

  const sectionIndex   = hasSections ? sectionCodes.indexOf(activeSectionResolved) : -1;
  const isFirstSection = !hasSections || sectionIndex <= 0;
  const isLastSection  = !hasSections || sectionIndex === sectionCodes.length - 1;

  const goBack = () => {
    if (!isFirstSection) setActiveSection(sectionCodes[sectionIndex - 1]);
  };
  const goNext = () => {
    if (!isLastSection) setActiveSection(sectionCodes[sectionIndex + 1]);
  };

  // ── Column spans ───────────────────────────────────────────────────────────

  const leftColSpan   = hasSections ? 5 : 0;
  const centreColSpan = hasSections ? 13 : 18;
  const rightColSpan  = 6;

  const sectionLabel = activeSectionResolved
    ? activeSectionResolved.replace(/_/g, ' ')
    : 'Record';

  // ── Bottom bar height (used for scroll padding) ──────────────────────────
  const BOTTOM_BAR_H = 56;

  return (
    // Outer shell: full viewport height, flex column so header + body + bar
    // stack without overflow.  No padding — each zone controls its own.
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>

      {/* ── Header (fixed height, never scrolls) ── */}
      <div style={{ flexShrink: 0, padding: '12px 24px 0', borderBottom: '1px solid var(--colorBorder)', background: 'var(--colorBgContainer)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <Button
            size="small"
            icon={<LeftOutlined />}
            onClick={() => navigate(returnPath)}
          >
            {returnPath === '/inbox' ? 'Inbox' : 'Projects'}
          </Button>
        </div>
        <Breadcrumb
          items={[
            {
              title: (
                <a onClick={() => navigate('/projects')}>
                  {project?.name ?? t('forms:record.breadcrumb.project')}
                </a>
              ),
            },
            {
              title: (
                <a onClick={() => navigate(returnPath)}>
                  {activity?.name ?? t('forms:record.breadcrumb.activity')}
                </a>
              ),
            },
            { title: record.recordSubtype ?? t('forms:record.breadcrumb.record') },
          ]}
        />
        <Flex justify="space-between" align="center" style={{ margin: '6px 0 10px' }}>
          <Title level={1} style={{ margin: 0, fontSize: 16, fontWeight: 600, lineHeight: '1.5' }}>
            {activity?.name ?? '—'}
          </Title>
          <RecordStateBadge state={record.recordState} />
        </Flex>

        {/* Alerts live here so they push content down rather than overlapping */}
        {autosaveStatus === 'conflict' && (
          <Alert
            type="warning"
            showIcon
            message={t('forms:record.error.conflict')}
            description={t('forms:record.error.conflictDetail')}
            action={
              <Button icon={<ReloadOutlined />} onClick={() => void handleReload()}>
                {t('common:actions.reload')}
              </Button>
            }
            style={{ marginBottom: 8 }}
          />
        )}
        {workflowMutation.isError && (
          <Alert
            type="error"
            showIcon
            closable
            message="Workflow action failed"
            description={String(workflowMutation.error)}
            style={{ marginBottom: 8 }}
          />
        )}
      </div>

      {/* ── Scrollable body ── */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>
        <Row gutter={0} style={{ flex: 1, overflow: 'hidden', margin: 0, width: '100%' }}>

          {/* Left: section progress steps — scrolls independently */}
          {hasSections && (
            <Col
              span={leftColSpan}
              style={{
                height: '100%',
                overflowY: 'auto',
                borderRight: '1px solid var(--colorBorder)',
              }}
            >
              <SectionSteps
                sectionCodes={sectionCodes}
                activeSection={activeSectionResolved}
                onSelect={setActiveSection}
                sectionStates={sectionStates}
                formData={formData}
              />
            </Col>
          )}

          {/* Centre: form — scrolls independently */}
          <Col
            span={centreColSpan}
            style={{ height: '100%', overflowY: 'auto', padding: '16px 20px' }}
          >
            <RjsfForm
              ref={formRef}
              schema={(effectiveSchema ?? sectionSchema) as RJSFSchema}
              uiSchema={sectionUiSchema}
              formData={
                hasSections && activeSectionResolved
                  ? ((formData[activeSectionResolved] ?? {}) as Record<string, unknown>)
                  : formData
              }
              onChange={handleFormChange}
              formContext={{ entityType: 'ACTIVITY_RECORD', entityId: recordId ?? '' }}
              disabled={
                autosaveStatus === 'conflict' ||
                activeSectionState?.isTerminal === true
              }
            />
          </Col>

          {/* Right: comments / history / workflow — scrolls independently */}
          <Col
            span={rightColSpan}
            style={{
              height: '100%',
              overflowY: 'auto',
              borderLeft: '1px solid var(--colorBorder)',
              padding: '8px 12px',
            }}
          >
            <RightPanel activeSectionState={activeSectionState} recordId={recordId!} />
          </Col>
        </Row>
      </div>

      {/* ── Bottom action bar (always visible, never overlaps content) ── */}
      <div
        style={{
          flexShrink: 0,
          height: BOTTOM_BAR_H,
          padding: '0 24px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          background: 'var(--colorBgContainer)',
          borderTop: '1px solid var(--colorBorder)',
        }}
      >
        {/* Back — hidden on first section */}
        {hasSections && !isFirstSection && (
          <Button icon={<LeftOutlined />} onClick={goBack}>
            {t('common:actions.back')}
          </Button>
        )}

        {/* Save draft — always present */}
        <Button
          onClick={() => void saveNow()}
          disabled={autosaveStatus === 'saving' || autosaveStatus === 'conflict'}
          loading={autosaveStatus === 'saving'}
        >
          {t('forms:record.actions.saveDraft')}
        </Button>

        {/* Next — all sections except last */}
        {hasSections && !isLastSection && (
          <Button type="primary" icon={<RightOutlined />} iconPosition="end" onClick={goNext}>
            {t('common:actions.next')}
          </Button>
        )}

        {/* Workflow actions — last section only (or when no sections) */}
        {(!hasSections || isLastSection) && (
          <WorkflowActions
            sectionState={activeSectionState}
            sectionLabel={sectionLabel}
            onAction={handleWorkflowAction}
            loading={workflowMutation.isPending}
          />
        )}

        <div style={{ marginLeft: 'auto' }}>
          <AutosaveIndicator status={autosaveStatus} savedAt={savedAt} />
        </div>
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Extract the sub-schema for a single section from the full record schema.
 *
 * The full schema has top-level header fields plus one nested object property
 * per section (e.g. "srp", "cala", "section_20a", …), often using a $ref to
 * a $defs sub-schema.  This returns the section's object schema as a
 * self-contained schema (with parent $defs carried along for nested $refs).
 */
function buildSectionSchema(schema: RJSFSchema, sectionCode: string): RJSFSchema {
  const props = (schema.properties ?? {}) as Record<string, RJSFSchema>;
  const defs  = (schema.$defs ?? {}) as Record<string, RJSFSchema>;

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
