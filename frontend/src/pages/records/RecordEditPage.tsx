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
 *   Dy CE/C in DRAFT → "Submit Section"
 *   Nodal in SUBMITTED_FOR_VERIFICATION → "Verify" + "Send Back"
 *   CE/C in VERIFIED → "Authenticate" + "Send Back"
 *   SENT_BACK_TO_DYCE → "Resubmit"
 *   SENT_BACK_TO_NODAL → "Re-verify"
 * Send Back always opens a modal requiring a comment.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Badge,
  Breadcrumb,
  Button,
  Col,
  Flex,
  Row,
  Space,
  Spin,
  Tabs,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';

import { fetchRecord, fetchActivity, patchRecord } from '@api/activityRecords';
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

/** Dot colour for section tab labels. */
const SECTION_DOT_COLORS: Record<string, string> = {
  DRAFT: '#d9d9d9',
  SUBMITTED_FOR_VERIFICATION: '#1677ff',
  VERIFIED: '#52c41a',
  AUTHENTICATED: '#722ed1',
  SENT_BACK_TO_DYCE: '#fa8c16',
  SENT_BACK_TO_NODAL: '#fa8c16',
};

function RecordStateBadge({ state }: { state: string }) {
  const label = state
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
  const color = STATE_COLORS[state] ?? 'default';
  return <Tag color={color}>{label}</Tag>;
}

// ── Section tabs sidebar ──────────────────────────────────────────────────────

interface SectionTabsProps {
  sectionCodes: string[];
  activeSection: string;
  onSelect: (code: string) => void;
  sectionStates: Record<string, SectionWorkflowState>;
}

function SectionTabs({
  sectionCodes,
  activeSection,
  onSelect,
  sectionStates,
}: SectionTabsProps) {
  if (sectionCodes.length === 0) return null;
  return (
    <Tabs
      tabPosition="left"
      activeKey={activeSection}
      onChange={onSelect}
      style={{ height: '100%' }}
      items={sectionCodes.map((code) => {
        const inst = sectionStates[code];
        const dotColor = inst
          ? (SECTION_DOT_COLORS[inst.currentStateCode] ?? '#d9d9d9')
          : '#d9d9d9';
        return {
          key: code,
          label: (
            <Flex align="center" gap={6}>
              <Badge color={dotColor} />
              <span style={{ textTransform: 'uppercase', fontSize: 11, letterSpacing: '0.04em' }}>
                {code.replace(/_/g, ' ')}
              </span>
            </Flex>
          ),
        };
      })}
    />
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

  return (
    <Tabs
      defaultActiveKey="comments"
      items={[
        {
          key: 'comments',
          label: t('record.panel.comments'),
          children: (
            <CommentPanel
              entityType="ACTIVITY_RECORD"
              entityId={recordId}
              currentUserId={currentUser?.userId}
            />
          ),
        },
        {
          key: 'history',
          label: t('record.panel.history'),
          children: <HistoryPanel recordId={recordId} />,
        },
        {
          key: 'attachments',
          label: t('record.panel.attachments'),
          children: (
            <AttachmentPanel
              entityType="ACTIVITY_RECORD"
              entityId={recordId}
              canUpload={currentUser?.permissions.includes('ATTACHMENT.UPLOAD.OWN_RECORDS')}
              currentUserId={currentUser?.userId}
            />
          ),
        },
        {
          key: 'workflow',
          label: t('record.panel.workflow'),
          children: <WorkflowPanel activeSectionState={activeSectionState} />,
        },
      ]}
    />
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

// ── Main page ─────────────────────────────────────────────────────────────────

export default function RecordEditPage() {
  const { recordId } = useParams<{ recordId: string }>();
  const navigate = useNavigate();
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

  if (schemaError || !formDef || !sectionSchema) {
    return (
      <Alert
        type="error"
        message={t('forms:record.error.schemaLoadFailed')}
        description={String(schemaError)}
      />
    );
  }

  // ── Column spans ───────────────────────────────────────────────────────────

  const leftColSpan   = hasSections ? 4 : 0;
  const centreColSpan = hasSections ? 14 : 18;
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
        <Breadcrumb
          items={[
            {
              title: (
                <a onClick={() => navigate('/projects')}>
                  {t('forms:record.breadcrumb.project')}
                </a>
              ),
            },
            { title: activity?.name ?? t('forms:record.breadcrumb.activity') },
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

          {/* Left: section nav — scrolls independently */}
          {hasSections && (
            <Col
              span={leftColSpan}
              style={{
                height: '100%',
                overflowY: 'auto',
                borderRight: '1px solid var(--colorBorder)',
                padding: '8px 0',
              }}
            >
              <SectionTabs
                sectionCodes={sectionCodes}
                activeSection={activeSectionResolved}
                onSelect={setActiveSection}
                sectionStates={sectionStates}
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
              schema={sectionSchema}
              uiSchema={sectionUiSchema}
              formData={
                hasSections && activeSectionResolved
                  ? ((formData[activeSectionResolved] ?? {}) as Record<string, unknown>)
                  : formData
              }
              onChange={handleFormChange}
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
        <Button
          onClick={() => void saveNow()}
          disabled={autosaveStatus === 'saving' || autosaveStatus === 'conflict'}
          loading={autosaveStatus === 'saving'}
        >
          {t('forms:record.actions.saveDraft')}
        </Button>

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
