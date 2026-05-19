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
  //
  // The RJSF form is scoped to the current section (a nested object property).
  // When it reports a change we merge the section data back into the full
  // record data before persisting.  For non-section forms the section-scoped
  // data IS the full data.

  const handleFormChange = useCallback(
    (sectionData: Record<string, unknown>) => {
      const next = hasSections && activeSectionResolved
        ? { ...formDataRef.current, [activeSectionResolved]: sectionData }
        : sectionData;
      setFormData(next);
      formDataRef.current = next;
      markDirty();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
              formData={
                hasSections && activeSectionResolved
                  ? ((formData[activeSectionResolved] ?? {}) as Record<string, unknown>)
                  : formData
              }
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
 * Extract the sub-schema for a single section from the full record schema.
 *
 * ## Convention
 *
 * The full schema has top-level properties for the "header" fields (village_name,
 * chainages, etc.) plus one nested object property per section (e.g. "srp",
 * "cala", "section_20a", …).  Each section property uses a $ref to a $defs
 * sub-schema.
 *
 * This function returns a synthetic schema that contains only the section's
 * nested object as a flat form — i.e. the properties of the section object
 * become top-level properties.  This is what RJSF renders for the active tab.
 *
 * Top-level header fields (village_name, chainages, etc.) are shown in the
 * first section tab and hidden in subsequent ones by convention — the first
 * section tab includes them via a "header" property group.
 *
 * ## $ref resolution
 *
 * The section property likely uses `{ "$ref": "#/$defs/SrpSection" }`.  We
 * inline the $defs from the parent schema so the sub-schema is self-contained.
 */
function buildSectionSchema(schema: RJSFSchema, sectionCode: string): RJSFSchema {
  const props = (schema.properties ?? {}) as Record<string, RJSFSchema>;
  const defs = (schema.$defs ?? {}) as Record<string, RJSFSchema>;

  const sectionProp = props[sectionCode];
  if (!sectionProp) {
    // Section code not found in schema — return full schema as fallback
    return schema;
  }

  // Resolve $ref if present
  let sectionSchema: RJSFSchema = sectionProp;
  const ref = sectionProp.$ref as string | undefined;
  if (ref) {
    const defName = ref.replace('#/$defs/', '');
    sectionSchema = defs[defName] ?? sectionProp;
  }

  // Return the section's object schema, carrying the parent $defs for nested $refs
  return {
    ...sectionSchema,
    $defs: defs,
  };
}
