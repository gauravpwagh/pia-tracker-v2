/* eslint-disable security/detect-object-injection */
// Bracket-notation accesses throughout this file use typed Record<string,…> keys that are
// derived from validated API responses, not user input — no injection risk here.

/**
 * RecordEditor — Archetype 3 (docs/ui.md § 3).
 *
 * The shared record-editing form. Embedded inline inside the project workspace
 * record pane (ProjectWorkspace → ActivityPane). The old standalone
 * `/records/:recordId/edit` full-page route was removed once the workspace UI
 * fully replaced it.
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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Breadcrumb,
  Button,
  Col,
  Divider,
  Flex,
  Popconfirm,
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
  FileTextOutlined,
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
import { DrawingApproversPanel } from '@/pages/projects/DrawingApproversPanel';
import { DrawingObservationsPanel } from '@/pages/projects/DrawingObservationsPanel';
import type { DrawingObservation } from '@/pages/projects/DrawingObservationsPanel';
import { ArbitrationHearingsPanel } from '@/pages/projects/ArbitrationHearingsPanel';
import type { ArbitrationHearing } from '@/pages/projects/ArbitrationHearingsPanel';
import { TalukaSrpCalaPanel } from './TalukaSrpCalaPanel';
import { fetchTalukas } from '@api/talukaDetails';

const { Title, Text } = Typography;

// ── Drawing-type seed map — used to pre-populate drawing_details.drawing_type ─

const FORM_CODE_TO_DRAWING_TYPE: Record<string, string> = {
  ESP_DRAWING_V1:                   'ESP',
  SIP_DRAWING_V1:                   'SIP',
  ST_LT_TOC_DRAWING_V1:             'ST_LT_TOC',
  SWRD_DRAWING_V1:                  'SWRD',
  SWR_DRAWING_V1:                   'SWR',
  FAT_DRAWING_V1:                   'FAT',
  SAT_DRAWING_V1:                   'SAT',
  RSP_DRAWING_V1:                   'RSP',
  CABLE_ROUTE_PLAN_DRAWING_V1:      'CABLE_ROUTE_PLAN',
  LOP_DRAWING_V1:                   'LOP',
  PROJECT_SHEET_DRAWING_V1:         'PROJECT_SHEET',
  GAD_MEGA_DRAWING_V1:              'GAD_MEGA',
  GAD_MAJOR_DRAWING_V1:             'GAD_MAJOR',
  GAD_MINOR_DRAWING_V1:             'GAD_MINOR',
  LWR_PLAN_DRAWING_V1:              'LWR_PLAN',
  GRADE_CONDONATION_DRAWING_V1:     'GRADE_CONDONATION',
  BRIDGE_MINOR_SANCTION_DRAWING_V1: 'BRIDGE_MINOR_SANCTION',
  YARD_DISPENSATION_DRAWING_V1:     'YARD_DISPENSATION',
  YARD_MINOR_SANCTION_DRAWING_V1:   'YARD_MINOR_SANCTION',
  STATION_BUILDING_GAD_DRAWING_V1:  'STATION_BUILDING_GAD',
  FOB_GAD_TAD_DRAWING_V1:           'FOB_GAD_TAD',
  CURVE_DETAILS_DRAWING_V1:         'CURVE_DETAILS',
  TUNNEL_DESIGN_DRAWING_V1:         'TUNNEL_DESIGN',
};

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
  VERIFIED:                     'Verified',
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
  /** Land Acquisition's srp/cala sections are read-only (fetched from the
   * selected taluka) rather than user-entered — their completeness is
   * determined by the taluka's data, not formData, so callers pass an
   * explicit override for those codes. */
  completeOverride?: boolean,
): boolean {
  if (completeOverride !== undefined) return completeOverride;
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
  completeOverride?: boolean,
): StepStatus {
  if (
    inst?.currentStateCode === 'SENT_BACK_TO_DYCE' ||
    inst?.currentStateCode === 'SENT_BACK_TO_NODAL'
  ) return 'error';
  if (isSectionComplete(code, formData, completeOverride)) return 'finish';
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
  /** Per-section-code override for the "finish" checkmark, bypassing the
   * formData-based check — used by Land Acquisition's read-only srp/cala
   * sections (see isSectionComplete). */
  completeOverrides?: Record<string, boolean>;
}

function SectionSteps({ sectionCodes, activeSection, onSelect, sectionStates, formData, completeOverrides }: SectionStepsProps) {
  if (sectionCodes.length === 0) return null;

  return (
    <div style={{ padding: '12px 16px' }}>
      {sectionCodes.map((code, idx) => {
        const inst   = sectionStates[code];
        const status = sectionStepStatus(code, activeSection, inst, formData, completeOverrides?.[code]);
        const colors = STEP_COLORS[status];
        const isLast = idx === sectionCodes.length - 1;

        return (
          <div key={code} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
            {/* Row: icon + label */}
            <div
              role="button"
              onClick={() => onSelect(code)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', width: '100%' }}
            >
              {/* Circle icon */}
              <div style={{
                width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                background: colors.bg,
                border: `2px solid ${colors.border}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {status === 'finish' && <CheckOutlined style={{ fontSize: 10, color: colors.color }} />}
                {status === 'error'  && <CloseOutlined style={{ fontSize: 10, color: colors.color }} />}
                {status === 'process' && (
                  <span style={{ fontSize: 10, fontWeight: 700, color: colors.color, lineHeight: 1 }}>
                    {idx + 1}
                  </span>
                )}
                {status === 'wait' && (
                  <span style={{ fontSize: 10, color: colors.color, lineHeight: 1 }}>
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
                height: 8,
                background: status === 'finish' ? '#52c41a' : '#f0f0f0',
                marginLeft: 9,
                marginTop: 1,
                marginBottom: 1,
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
          <Popconfirm
            title="Submit for verification?"
            description="Once submitted, this section is locked for verification."
            okText="Submit"
            cancelText="Cancel"
            onConfirm={() => onAction('submit')}
          >
            <Button type="primary" loading={loading}>
              {t('record.actions.submitSection')}
            </Button>
          </Popconfirm>
        )}
        {canResubmit && (
          <Button loading={loading} onClick={() => onAction('resubmit')}>
            {t('record.actions.resubmit')}
          </Button>
        )}
        {canVerify && (
          <Popconfirm
            title="Verify this section?"
            description="Confirm the data is correct before verifying."
            okText="Verify"
            cancelText="Cancel"
            onConfirm={() => onAction('verify')}
          >
            <Button type="primary" loading={loading}>
              {t('record.actions.verify')}
            </Button>
          </Popconfirm>
        )}
        {canReVerify && (
          <Button loading={loading} onClick={() => onAction('re-verify')}>
            {t('record.actions.reVerify')}
          </Button>
        )}
        {canAuth && (
          <Popconfirm
            title="Authenticate this section?"
            description="Authentication is final — confirm the data is correct."
            okText="Authenticate"
            cancelText="Cancel"
            onConfirm={() => onAction('authenticate')}
          >
            <Tooltip title={t('record.actions.authenticateTooltip')}>
              <Button type="primary" loading={loading}>
                {t('record.actions.authenticate')}
              </Button>
            </Tooltip>
          </Popconfirm>
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

// ── Record name / subtype lock ──────────────────────────────────────────────────
// The record name is fixed at creation ("Add Record") and can only be changed via
// the explicit "Rename" action — so the name field is read-only inside the edit
// form. Handles the flat (record_name / package_name) and nested
// (acquisition_details.record_name, drawing_details.record_name) shapes.
//
// The record subtype is likewise fixed at creation: Utility Shifting's `utility_type`
// (flat) and Drawing Approval's `drawing_details.drawing_type` are the record's subtype
// and must not be edited afterwards — lock them too.

function lockNameFields(ui: UiSchema | undefined): UiSchema {
  const lock = (node: UiSchema | undefined, key: string): UiSchema => ({
    ...(node ?? {}),
    [key]: { ...((node?.[key] as UiSchema) ?? {}), 'ui:readonly': true },
  });
  let out = lock(ui, 'record_name');
  out = lock(out, 'package_name');
  out = lock(out, 'utility_type');
  out.acquisition_details = lock(out.acquisition_details as UiSchema, 'record_name');
  out.drawing_details = lock(out.drawing_details as UiSchema, 'record_name');
  out.drawing_details = lock(out.drawing_details as UiSchema, 'drawing_type');
  return out;
}

// ── Utility Shifting: dynamic schema filter ───────────────────────────────────
// Narrows the flat RJSF schema to only the fields relevant to the current
// utility_type + executing_agency combination.

const US_COMMON = [
  'record_name', 'block_section_from', 'block_section_to',
  'utility_type', 'owner_agency',
  'chainage_from', 'chainage_to', 'length_affected_km',
  'executing_agency',
  'status_drawing_execution', 'target_removal_date',
  'consent_state_govt', 'remarks',
];

// Agency-conditional field groups
const US_AGENCY_FIELDS: Record<string, string[]> = {
  USER_DEPT:    ['estimate_position', 'fund_submission'],
  OPEN_LINE:    ['estimate_position', 'fund_submission'],
  CONSTRUCTION: ['material_available', 'agency_available'],
  RAILWAY:      [],
};

function filterUsSchema(
  schema: RJSFSchema,
  _utilityType: string,
  executingAgency: string,
): RJSFSchema {
  const agencyFields = US_AGENCY_FIELDS[executingAgency] ?? [];
  const allowed = new Set([...US_COMMON, ...agencyFields]);

  const props = schema.properties;
  const filteredProps = props
    ? Object.fromEntries(Object.entries(props).filter(([k]) => allowed.has(k)))
    : undefined;

  const baseRequired = (schema.required as string[] | undefined) ?? [];
  const required = baseRequired.filter((k) => allowed.has(k));

  const { allOf: _dropped, ...rest } = schema;
  return { ...rest, properties: filteredProps, required };
}

// ── Land Acquisition: JMR "Re-JMR" toggle ──────────────────────────────────────
// The original 4 fee/date fields (jmr_fee_demanded_on, jmr_fee_amount,
// jmr_fee_submitted_on, jmr_done_on) are always shown. Re-JMR adds a SECOND set
// of the same 4 fields (re_jmr_*) for the repeat round, declared in the schema
// but only shown once re_jmr is toggled on — same client-side filtering
// technique as filterUsSchema above.

const JMR_RE_JMR_ONLY_FIELDS = ['re_jmr_fee_demanded_on', 're_jmr_fee_amount', 're_jmr_fee_submitted_on', 're_jmr_done_on'];

function filterJmrSchema(schema: RJSFSchema, reJmr: boolean): RJSFSchema {
  if (reJmr) return schema;
  const props = schema.properties;
  const filteredProps = props
    ? Object.fromEntries(Object.entries(props).filter(([k]) => !JMR_RE_JMR_ONLY_FIELDS.includes(k)))
    : undefined;
  return { ...schema, properties: filteredProps };
}

// ── Land Acquisition: turn sub_division_taluka into a picker ──────────────────
// Patches the acquisition_details section schema to add an enum sourced from
// the activity's Sub division/taluka master list, so RJSF renders a select
// instead of a free-text input. Records with a value not (yet) in the master
// list (e.g. pre-migration data) still keep working — RJSF's enum widget
// falls back to showing the raw string as the selected value.

function injectTalukaEnum(schema: RJSFSchema, talukaNames: string[]): RJSFSchema {
  const props = schema.properties as Record<string, RJSFSchema> | undefined;
  const field = props?.sub_division_taluka;
  if (!field || talukaNames.length === 0) return schema;
  return {
    ...schema,
    properties: {
      ...props,
      sub_division_taluka: { ...field, enum: talukaNames },
    },
  };
}

// ── Editor ────────────────────────────────────────────────────────────────────

export interface RecordEditorProps {
  recordId: string;
  /** 'page' = full-viewport routed page; 'inline' = fits inside a pane. */
  layout?: 'page' | 'inline';
  /** Called by the Back button. */
  onBack?: () => void;
  /** Renders the form fields disabled and hides the Save-draft button — for
   * viewing a Verified/Authenticated record's data without editing it. Workflow
   * actions (e.g. Authenticate) stay visible, since that's exactly how a CE/C
   * reviews the fields before authenticating. */
  readOnly?: boolean;
}

export function RecordEditor({ recordId, layout = 'page', onBack, readOnly = false }: RecordEditorProps) {
  const inline = layout === 'inline';
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
    queryFn: () => fetchRecord(recordId),
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
    queryFn: () => fetchWorkflowState(recordId),
    enabled: !!recordId,
    refetchOnWindowFocus: false,
  });

  // Land Acquisition only: Sub Division/Taluka names, used to turn the free-text
  // acquisition_details.sub_division_taluka field into a picker.
  const isLandAcquisition = formDef?.activityTypeCode === 'LAND_ACQUISITION';
  const { data: talukas } = useQuery({
    queryKey: ['talukas', activity?.id],
    queryFn: () => fetchTalukas(activity!.id),
    enabled: isLandAcquisition && !!activity?.id,
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
      const typeCode = formDef?.activityTypeCode;
      let initialized = data;
      if ((typeCode === 'TEMPORARY_OFFICE_SPACE' || typeCode === 'UTILITY_SHIFTING') && data.record_name === undefined && record.name) {
        initialized = { ...data, record_name: record.name };
      } else if (typeCode === 'DRAWING_APPROVAL') {
        // record_name and drawing_type live inside the drawing_details section sub-object
        const dd = (data.drawing_details as Record<string, unknown> | undefined) ?? {};
        const drawingType = formDef?.code ? FORM_CODE_TO_DRAWING_TYPE[formDef.code] : undefined;
        const needsName = dd.record_name === undefined && record.name;
        const needsType = dd.drawing_type === undefined && drawingType;
        if (needsName || needsType) {
          initialized = {
            ...data,
            drawing_details: {
              ...dd,
              ...(needsName ? { record_name: record.name } : {}),
              ...(needsType ? { drawing_type: drawingType } : {}),
            },
          };
        }
      } else if (typeCode === 'FOREST_CLEARANCE') {
        const ad = (data.acquisition_details as Record<string, unknown> | undefined) ?? {};
        if (ad.record_name === undefined && record.name) {
          initialized = { ...data, acquisition_details: { ...ad, record_name: record.name } };
        }
      } else if (typeCode === 'LAND_ACQUISITION') {
        // Seed acquisition_details from activity metadataJson (activity-level fields)
        // and record.name / village_name for record_name.
        const ad = (data.acquisition_details as Record<string, unknown> | undefined) ?? {};
        const meta = activity?.metadataJson ?? {};
        const laName = record.name || (data.village_name as string | undefined);
        const seeded: Record<string, unknown> = { ...ad };
        if (seeded.record_name === undefined && laName) seeded.record_name = laName;
        // Note: area_hectares_* are deliberately NOT seeded here — those are this
        // record's own land area (Total = sum of its own Private/Govt/Forest, see
        // handleFormChange below), not the activity-level Scope total.
        const metaFields = ['block_section_from','block_section_to','chainage_from','chainage_to','district','sub_division_taluka',
          'est_villages'] as const;
        for (const f of metaFields) {
          if (seeded[f] === undefined && meta[f] !== undefined) seeded[f] = meta[f];
        }
        if (JSON.stringify(seeded) !== JSON.stringify(ad)) {
          initialized = { ...data, acquisition_details: seeded };
        }
      } else if (typeCode === 'TENDER_PACKAGING' && data.package_name === undefined && record.name) {
        initialized = { ...data, package_name: record.name };
      }
      setFormData(initialized);
      formDataRef.current = initialized;
    }
  }, [record?.id, formDef?.activityTypeCode, activity?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Autosave ───────────────────────────────────────────────────────────────

  const { status: autosaveStatus, savedAt, markDirty, saveNow } = useAutosave({
    saveFn: useCallback(async () => {
      const typeCode = formDef?.activityTypeCode;
      const recordName =
        typeCode === 'TENDER_PACKAGING'
          ? (formDataRef.current.package_name as string | undefined)
          : typeCode === 'DRAWING_APPROVAL'
          ? ((formDataRef.current.drawing_details as Record<string, unknown> | undefined)?.record_name as string | undefined)
          : (typeCode === 'LAND_ACQUISITION' || typeCode === 'FOREST_CLEARANCE')
          ? ((formDataRef.current.acquisition_details as Record<string, unknown> | undefined)?.record_name as string | undefined)
          : (formDataRef.current.record_name as string | undefined);
      await patchRecord(recordId, formDataRef.current, recordName || undefined);
      // Keep any other open view of this record (detail panel, records list — incl.
      // the record's name) in sync without requiring a page reload.
      void queryClient.invalidateQueries({ queryKey: ['record', recordId] });
      if (record?.projectActivityId) {
        void queryClient.invalidateQueries({ queryKey: ['records', record.projectActivityId] });
      }
    }, [recordId, formDef?.activityTypeCode, queryClient, record?.projectActivityId]),
  });

  // ── RJSF onChange ─────────────────────────────────────────────────────────

  const handleFormChange = useCallback(
    (sectionData: Record<string, unknown>) => {
      let effectiveSectionData = sectionData;

      // Land Acquisition's Acquisition Details: Total Area (ha) auto-fills as the
      // sum of Private/Govt/Forest whenever ANY of those three change, but stays
      // editable — if the user only touches Total Area itself (private/govt/forest
      // unchanged from the previous value), leave their entry alone.
      if (isLandAcquisition && activeSectionResolved === 'acquisition_details') {
        const prev = (formDataRef.current.acquisition_details as Record<string, unknown> | undefined) ?? {};
        const num = (v: unknown) => (typeof v === 'number' ? v : 0);
        const partsChanged =
          num(sectionData.area_hectares_private) !== num(prev.area_hectares_private) ||
          num(sectionData.area_hectares_govt) !== num(prev.area_hectares_govt) ||
          num(sectionData.area_hectares_forest) !== num(prev.area_hectares_forest);
        if (partsChanged) {
          effectiveSectionData = {
            ...sectionData,
            area_hectares_total: num(sectionData.area_hectares_private) + num(sectionData.area_hectares_govt) + num(sectionData.area_hectares_forest),
          };
        }
      }

      const next =
        hasSections && activeSectionResolved
          ? { ...formDataRef.current, [activeSectionResolved]: effectiveSectionData }
          : effectiveSectionData;
      setFormData(next);
      formDataRef.current = next;
      markDirty();
    },
    [markDirty, activeSectionResolved, hasSections, isLandAcquisition],
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
      performWorkflowAction(recordId, action, {
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
      // The record-list badge (activity pane's left list) and Overview stats
      // both read from these caches — invalidate so the state change shows
      // immediately instead of only after something else triggers a refetch.
      if (record) void queryClient.invalidateQueries({ queryKey: ['records', record.projectActivityId] });
      void queryClient.invalidateQueries({ queryKey: ['activities'] });
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

  // Land Acquisition: the srp/cala left-nav steps show "finish" (green tick)
  // based on the selected taluka's data, not formData — those sections are
  // read-only, fetched displays (see TalukaSrpCalaPanel), so formData.srp/cala
  // never reflects the taluka's actual SRP/CALA values.
  const sectionCompleteOverrides: Record<string, boolean> | undefined = useMemo(() => {
    if (!isLandAcquisition) return undefined;
    const talukaName = (formData.acquisition_details as Record<string, unknown> | undefined)?.sub_division_taluka as string | undefined;
    const matched = talukaName ? talukas?.find((t) => t.talukaName.toLowerCase() === talukaName.toLowerCase()) : undefined;
    return {
      srp: !!matched?.srpDeclaredInGazOn,
      cala: !!matched?.calaReceivedFromStateOn,
    };
  }, [isLandAcquisition, formData.acquisition_details, talukas]);

  const rawSectionUiSchema: UiSchema | undefined = formDef
    ? activeSectionResolved
      ? ((formDef.uiSchemaJson as UiSchema)?.[activeSectionResolved] as UiSchema | undefined)
      : (formDef.uiSchemaJson as UiSchema | undefined)
    : undefined;
  // Record name is fixed at creation — lock it in the form (rename via the
  // explicit "Rename" action instead).
  const sectionUiSchema = useMemo(() => lockNameFields(rawSectionUiSchema), [rawSectionUiSchema]);

  // ── Utility Shifting: narrow schema to fields relevant to the selected type
  // utility_type is pre-populated in dataJson at record creation so it's
  // available from the first open. Falls back to record.recordSubtype.
  const effectiveSchema: RJSFSchema | undefined = useMemo(() => {
    if (!sectionSchema) return sectionSchema;
    if (formDef?.activityTypeCode === 'UTILITY_SHIFTING') {
      const utilityType     = (formData.utility_type     as string | undefined) ?? '';
      const executingAgency = (formData.executing_agency as string | undefined) ?? '';
      return filterUsSchema(sectionSchema, utilityType, executingAgency);
    }
    if (isLandAcquisition && activeSectionResolved === 'acquisition_details' && talukas) {
      return injectTalukaEnum(sectionSchema, talukas.map((t) => t.talukaName));
    }
    if (isLandAcquisition && activeSectionResolved === 'jmr') {
      const reJmr = !!(formData.jmr as Record<string, unknown> | undefined)?.re_jmr;
      return filterJmrSchema(sectionSchema, reJmr);
    }
    return sectionSchema;
  }, [sectionSchema, formDef?.activityTypeCode, formData.utility_type, formData.executing_agency, isLandAcquisition, activeSectionResolved, talukas, formData.jmr]);

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

  // Once a section is submitted for verification it is out of the owner's hands —
  // lock the fields. Editing is only permitted in DRAFT or the sent-back states
  // (where the owner is expected to make corrections). Note the backend still
  // permits PATCH in SUBMITTED_FOR_VERIFICATION — it only blocks VERIFIED/AUTHENTICATED —
  // so this UI lock is the guard for the submitted state until that gap is closed.
  const LOCKED_EDIT_STATES = ['SUBMITTED_FOR_VERIFICATION', 'VERIFIED', 'AUTHENTICATED'];
  const stateLocked = LOCKED_EDIT_STATES.includes(activeSectionState?.currentStateCode ?? '');

  // Centre content — the RJSF form (or the drawing custom panels). Shared by both layouts.
  const centreContent =
    activeSectionResolved === 'approvals' ? (
      <DrawingApproversPanel
        recordId={recordId}
        canEdit={activeSectionState?.isTerminal !== true}
        recordCreatedAt={record?.createdAt}
      />
    ) : isLandAcquisition && activity?.id && (activeSectionResolved === 'srp' || activeSectionResolved === 'cala') ? (
      <TalukaSrpCalaPanel
        activityId={activity.id}
        talukaName={
          ((formData.acquisition_details as Record<string, unknown> | undefined)?.sub_division_taluka as string | undefined)
        }
        section={activeSectionResolved}
      />
    ) : activeSectionResolved === 'observations' ? (
      <DrawingObservationsPanel
        recordId={recordId}
        recordData={(record?.dataJson as Record<string, unknown> | undefined) ?? {}}
        observations={
          Array.isArray((record?.dataJson as Record<string, unknown> | undefined)?.observations)
            ? ((record.dataJson as Record<string, unknown>).observations as DrawingObservation[])
            : []
        }
        canEdit={activeSectionState?.isTerminal !== true}
      />
    ) : isLandAcquisition && activeSectionResolved === 'arbitration' ? (
      <ArbitrationHearingsPanel
        recordId={recordId}
        recordData={(record?.dataJson as Record<string, unknown> | undefined) ?? {}}
        hearings={
          Array.isArray((record?.dataJson as Record<string, unknown> | undefined)?.arbitration_hearings)
            ? ((record.dataJson as Record<string, unknown>).arbitration_hearings as ArbitrationHearing[])
            : []
        }
        canEdit={activeSectionState?.isTerminal !== true}
      />
    ) : (
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
        formContext={{ entityType: 'ACTIVITY_RECORD', entityId: recordId }}
        disabled={readOnly || autosaveStatus === 'conflict' || stateLocked}
      />
    );

  return (
    // Outer shell: page = full viewport; inline = fills the host pane.
    <div style={{ display: 'flex', flexDirection: 'column', height: inline ? '100%' : '100vh', overflow: 'hidden' }}>

      {/* ── Header (fixed height, never scrolls) ── */}
      <div style={{ flexShrink: 0, padding: inline ? '10px 16px 0' : '12px 24px 0', borderBottom: '1px solid var(--ant-color-border)', background: 'var(--ant-color-bg-container)' }}>
        {inline ? (
          <Flex justify="space-between" align="center" style={{ marginBottom: 10, gap: 8 }}>
            <Space size={8} align="center" style={{ minWidth: 0 }}>
              <Title level={1} style={{ margin: 0, fontSize: 15, fontWeight: 600, lineHeight: '1.4', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {record.name || activity?.name || record.recordSubtype || 'Record'}
              </Title>
            </Space>
            <Space size={8} align="center">
              <RecordStateBadge state={record.recordState} />
              {readOnly && <Tag>View only</Tag>}
              {onBack && (
                <Button
                  size="small"
                  type="primary"
                  icon={<FileTextOutlined />}
                  onClick={onBack}
                  style={{ background: '#1565c0', borderColor: '#1565c0' }}
                >
                  Details
                </Button>
              )}
            </Space>
          </Flex>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              {onBack && (
                <Button size="small" icon={<LeftOutlined />} onClick={onBack}>Back</Button>
              )}
            </div>
            <Breadcrumb
              items={[
                { title: project?.name ?? t('forms:record.breadcrumb.project') },
                { title: <a onClick={onBack}>{activity?.name ?? t('forms:record.breadcrumb.activity')}</a> },
                { title: record.recordSubtype ?? t('forms:record.breadcrumb.record') },
              ]}
            />
            <Flex justify="space-between" align="center" style={{ margin: '6px 0 10px' }}>
              <Title level={1} style={{ margin: 0, fontSize: 16, fontWeight: 600, lineHeight: '1.5' }}>
                {activity?.name ?? '—'}
              </Title>
              <RecordStateBadge state={record.recordState} />
            </Flex>
          </>
        )}

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
        {inline ? (
          /* Inline: sections as a vertical left nav (matches the standalone edit page), form fills the rest. */
          <div style={{ flex: 1, display: 'flex', minWidth: 0 }}>
            {hasSections && (
              <div style={{ width: 180, flexShrink: 0, height: '100%', overflowY: 'auto', borderRight: '1px solid var(--ant-color-border)' }}>
                <SectionSteps
                  sectionCodes={sectionCodes}
                  activeSection={activeSectionResolved}
                  onSelect={setActiveSection}
                  sectionStates={sectionStates}
                  formData={formData}
                  completeOverrides={sectionCompleteOverrides}
                />
              </div>
            )}
            <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: '14px 16px' }}>
              {centreContent}
            </div>
          </div>
        ) : (
          <Row gutter={0} style={{ flex: 1, overflow: 'hidden', margin: 0, width: '100%' }}>
            {/* Left: section progress steps — scrolls independently */}
            {hasSections && (
              <Col span={leftColSpan} style={{ height: '100%', overflowY: 'auto', borderRight: '1px solid var(--ant-color-border)' }}>
                <SectionSteps
                  sectionCodes={sectionCodes}
                  activeSection={activeSectionResolved}
                  onSelect={setActiveSection}
                  sectionStates={sectionStates}
                  formData={formData}
                  completeOverrides={sectionCompleteOverrides}
                />
              </Col>
            )}
            {/* Centre: form (or custom panel for non-RJSF sections) — scrolls independently */}
            <Col span={centreColSpan} style={{ height: '100%', overflowY: 'auto', padding: '16px 20px' }}>
              {centreContent}
            </Col>
            {/* Right: comments / history / workflow — scrolls independently */}
            <Col span={rightColSpan} style={{ height: '100%', overflowY: 'auto', borderLeft: '1px solid var(--ant-color-border)', padding: '8px 12px' }}>
              <RightPanel activeSectionState={activeSectionState} recordId={recordId} />
            </Col>
          </Row>
        )}
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
          background: 'var(--ant-color-bg-container)',
          borderTop: '1px solid var(--ant-color-border)',
        }}
      >
        {/* Back — hidden on first section */}
        {hasSections && !isFirstSection && (
          <Button icon={<LeftOutlined />} onClick={goBack}>
            {t('common:actions.back')}
          </Button>
        )}

        {/* Save draft — hidden in read-only (view data) mode and once the section is
            locked (submitted for verification onward). */}
        {!readOnly && !stateLocked && (
          <Button
            onClick={() => void saveNow()}
            disabled={autosaveStatus === 'saving' || autosaveStatus === 'conflict'}
            loading={autosaveStatus === 'saving'}
          >
            {t('forms:record.actions.saveDraft')}
          </Button>
        )}

        {/* Next — all sections except last */}
        {hasSections && !isLastSection && (
          <Button type="primary" icon={<RightOutlined />} iconPosition="end" onClick={goNext}>
            {t('common:actions.next')}
          </Button>
        )}

        {/* Workflow actions — last section only (or when no sections). Still shown in
            read-only ("View Data") mode: that's precisely how a CE/C reviews a
            Verified record's fields before Authenticating. */}
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
