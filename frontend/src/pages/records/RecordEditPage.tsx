/**
 * RecordEditPage — Archetype 3 (docs/ui.md § 3).
 *
 * Path: `/records/:recordId/edit`
 *
 * ## Layout
 *
 * Three columns:
 *   1. Left  — Section nav (Ant Design Tabs tabPosition="left").
 *              Hidden when the form definition has no section_codes.
 *   2. Centre — RJSF form for the selected section (or full form).
 *   3. Right  — Collapsible panel: Comments | History | Workflow (stubs in 1.9).
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
 * ## Section tabs
 *
 * section_codes from the form definition drive the left tabs.  Empty
 * section_codes → no tab column, full schema rendered directly.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Alert,
  Breadcrumb,
  Button,
  Col,
  Flex,
  Layout,
  Row,
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
import { useAutosave } from '@hooks/useAutosave';
import { RjsfForm } from '@/forms/RjsfForm';
import type { RjsfFormHandle } from '@/forms/RjsfForm';
import type { RJSFSchema, UiSchema } from '@rjsf/utils';

const { Content } = Layout;
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
}

function SectionTabs({ sectionCodes, activeSection, onSelect }: SectionTabsProps) {
  if (sectionCodes.length === 0) return null;
  return (
    <Tabs
      tabPosition="left"
      activeKey={activeSection}
      onChange={onSelect}
      style={{ height: '100%' }}
      items={sectionCodes.map((code) => ({
        key: code,
        label: code.replace(/_/g, ' '),
      }))}
    />
  );
}

// ── Right panel (stubs for Phase 1.9) ────────────────────────────────────────

function RightPanel() {
  const { t } = useTranslation('forms');
  return (
    <Tabs
      defaultActiveKey="comments"
      items={[
        {
          key: 'comments',
          label: t('record.panel.comments'),
          children: (
            <Text type="secondary" style={{ padding: 16, display: 'block' }}>
              Comments — Phase 1.12
            </Text>
          ),
        },
        {
          key: 'history',
          label: t('record.panel.history'),
          children: (
            <Text type="secondary" style={{ padding: 16, display: 'block' }}>
              History — Phase 1.12
            </Text>
          ),
        },
        {
          key: 'workflow',
          label: t('record.panel.workflow'),
          children: (
            <Text type="secondary" style={{ padding: 16, display: 'block' }}>
              Workflow actions — Phase 1.11
            </Text>
          ),
        },
      ]}
    />
  );
}

// ── Autosave status indicator ─────────────────────────────────────────────────

interface AutosaveIndicatorProps {
  status: string;
  savedAt: Date | null;
}

function AutosaveIndicator({ status, savedAt }: AutosaveIndicatorProps) {
  const { t } = useTranslation('forms');

  if (status === 'saving') {
    return <Text type="secondary">{t('record.autosave.saving')}</Text>;
  }
  if (status === 'saved' && savedAt) {
    return (
      <Text type="secondary">
        {t('record.autosave.saved', { time: dayjs(savedAt).format('HH:mm') })}
      </Text>
    );
  }
  if (status === 'error') {
    return <Text type="danger">{t('record.autosave.saveFailed')}</Text>;
  }
  return null;
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function RecordEditPage() {
  const { recordId } = useParams<{ recordId: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation(['forms', 'common']);

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

  // ── Section state ──────────────────────────────────────────────────────────

  const sectionCodes = formDef?.sectionCodes ?? [];
  const [activeSection, setActiveSection] = useState<string>('');
  const activeSectionResolved =
    sectionCodes.length > 0 ? activeSection || sectionCodes[0] : '';

  // ── Form data ──────────────────────────────────────────────────────────────

  const [formData, setFormData] = useState<Record<string, unknown>>({});
  // Keep a ref for the autosave closure; updated in sync with state.
  const formDataRef = useRef<Record<string, unknown>>({});
  const formRef = useRef<RjsfFormHandle>(null);

  // Seed formData once when the record first loads.
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
    (data: Record<string, unknown>) => {
      setFormData(data);
      formDataRef.current = data;
      markDirty();
    },
    [markDirty],
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

  // ── Section-filtered schema ────────────────────────────────────────────────

  const sectionSchema: RJSFSchema | undefined = formDef
    ? activeSectionResolved
      ? buildSectionSchema(formDef.schemaJson as RJSFSchema, activeSectionResolved)
      : (formDef.schemaJson as RJSFSchema)
    : undefined;

  const sectionUiSchema: UiSchema | undefined = formDef?.uiSchemaJson as UiSchema | undefined;

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

  const hasSections = sectionCodes.length > 0;
  const leftColSpan = hasSections ? 4 : 0;
  const centreColSpan = hasSections ? 14 : 18;
  const rightColSpan = 6;

  return (
    <Layout style={{ background: 'transparent', height: '100%' }}>
      <Content style={{ padding: '0 0 80px 0' }}>
        {/* ── Breadcrumb + header ── */}
        <div style={{ marginBottom: 16 }}>
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
          <Flex justify="space-between" align="center" style={{ marginTop: 8 }}>
            <Title level={4} style={{ margin: 0 }}>
              {activity?.name ?? '—'}
            </Title>
            <RecordStateBadge state={record.recordState} />
          </Flex>
        </div>

        {/* ── Conflict alert ── */}
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
            style={{ marginBottom: 16 }}
          />
        )}

        {/* ── Three-column body ── */}
        <Row gutter={16}>
          {hasSections && (
            <Col span={leftColSpan} style={{ borderRight: '1px solid var(--colorBorder)' }}>
              <SectionTabs
                sectionCodes={sectionCodes}
                activeSection={activeSectionResolved}
                onSelect={setActiveSection}
              />
            </Col>
          )}

          <Col span={centreColSpan}>
            <RjsfForm
              ref={formRef}
              schema={sectionSchema}
              uiSchema={sectionUiSchema}
              formData={formData}
              onChange={handleFormChange}
              disabled={autosaveStatus === 'conflict'}
            />
          </Col>

          <Col
            span={rightColSpan}
            style={{ borderLeft: '1px solid var(--colorBorder)', paddingLeft: 16 }}
          >
            <RightPanel />
          </Col>
        </Row>
      </Content>

      {/* ── Sticky bottom action bar ── */}
      <div
        style={{
          position: 'fixed',
          bottom: 0,
          left: 240, // matches App.tsx Sider width
          right: 0,
          padding: '12px 24px',
          background: 'var(--colorBgContainer)',
          borderTop: '1px solid var(--colorBorder)',
          zIndex: 100,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <Button
          onClick={() => void saveNow()}
          disabled={autosaveStatus === 'saving' || autosaveStatus === 'conflict'}
          loading={autosaveStatus === 'saving'}
        >
          {t('forms:record.actions.saveDraft')}
        </Button>

        {/* Workflow primary actions wired in Phase 1.11 */}
        <Tooltip title="Available when record is ready to submit">
          <Button type="primary" disabled>
            {t('forms:record.actions.submitRecord')}
          </Button>
        </Tooltip>

        <div style={{ marginLeft: 'auto' }}>
          <AutosaveIndicator status={autosaveStatus} savedAt={savedAt} />
        </div>
      </div>
    </Layout>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Extract properties belonging to a single section from the full schema.
 *
 * Phase 1.9: the LAND_ACQUISITION_V1 stub has no section_codes, so this
 * function is never called in Phase 1.9. Returns the full schema unchanged
 * as a placeholder; Phase 1.10 implements proper section-based filtering.
 */
function buildSectionSchema(schema: RJSFSchema, _sectionCode: string): RJSFSchema {
  // TODO Phase 1.10: filter schema.properties to those belonging to _sectionCode.
  return schema;
}
