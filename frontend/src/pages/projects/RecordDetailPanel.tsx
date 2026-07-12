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
  Tooltip,
  Typography,
} from 'antd';
import {
  CheckCircleOutlined,
  CloseOutlined,
  DeleteOutlined,
  DownloadOutlined,
  EditOutlined,
  FileTextOutlined,
  LockOutlined,
  MoreOutlined,
  RollbackOutlined,
  SafetyOutlined,
  SaveOutlined,
  SendOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';

import { deleteRecord, fetchRecord, patchRecord, type ActivityRecordDetail } from '@api/activityRecords';
import { fetchActivityById, updateActivity } from '@api/projects';
import { fetchFormDefinitionById } from '@api/formDefinitions';
import { fetchWorkflowState, performWorkflowAction, type SectionWorkflowState, type WorkflowActionCode } from '@api/workflow';
import { fetchAttachments, getAttachmentDownloadUrl } from '@api/attachments';
import { useAuthStore } from '@stores/authStore';
import { CommentPanel } from '@components/comments/CommentPanel';
import { HistoryPanel } from '@components/comments/HistoryPanel';
import {
  AttachmentPanel,
  ScanBadge,
  formatBytes,
  ACCEPT_DOCUMENTS,
  ACCEPT_GEOGRAPHIC,
  ACCEPT_IMAGES,
  ACCEPT_VIDEO,
  ACCEPT_ALL,
} from '@components/attachments/AttachmentPanel';
import { ActivityMetadataForm, ActivityMetadataView } from './ActivityMetadataForm';
import { DrawingApproversPanel } from './DrawingApproversPanel';
import { DrawingObservationsPanel, type DrawingObservation } from './DrawingObservationsPanel';

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
  VERIFIED:                   'Verified',
  AUTHENTICATED:              'Authenticated',
  SENT_BACK_TO_DYCE:          'Sent Back to Dy CE/C',
  SENT_BACK_TO_NODAL:         'Sent Back to Nodal',
};

function recordLabel(record: ActivityRecordDetail): string {
  if (record.name)          return record.name;
  if (record.recordSubtype) return record.recordSubtype.replace(/_/g, ' ');
  return 'Record';
}

/**
 * Best-effort check of whether every mandatory field is filled, before letting
 * the Nodal Dy CE/C verify a record.
 *
 * PIA Tracker's forms are sectioned (each top-level schema property is a
 * section, e.g. "srp", "cala", each with its own `required` array) — this
 * walks both that shape and a flat top-level `required` array. It does NOT
 * evaluate JSON Schema conditionals (allOf/if-then), so a field that's only
 * conditionally required won't be caught here — acceptable for a pre-verify
 * nudge, not a substitute for the RJSF form's own validation on submit.
 */
function missingRequiredFields(
  schemaJson: Record<string, unknown>,
  dataJson: Record<string, unknown>,
): string[] {
  const isEmpty = (v: unknown) => v === undefined || v === null || v === '';
  const missing: string[] = [];
  const properties = (schemaJson.properties ?? {}) as Record<string, { properties?: unknown; required?: string[] }>;

  for (const [sectionKey, sectionSchema] of Object.entries(properties)) {
    if (!sectionSchema || typeof sectionSchema !== 'object' || !sectionSchema.properties) continue;
    const required = sectionSchema.required ?? [];
    const sectionData = (dataJson[sectionKey] ?? {}) as Record<string, unknown>;
    for (const field of required) {
      if (isEmpty(sectionData[field])) missing.push(`${sectionKey}.${field}`);
    }
  }

  const topRequired = (schemaJson.required as string[] | undefined) ?? [];
  for (const field of topRequired) {
    if (properties[field]?.properties) continue; // already walked as a section above
    if (isEmpty(dataJson[field])) missing.push(field);
  }

  return missing;
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
  /** If provided, the Edit Data button calls this (inline editing) instead of navigating to the edit page. */
  onEdit?: () => void;
  /** If provided, the View Data button (shown once Verified/Authenticated) calls this
   * to open the same form read-only — otherwise falls back to onEdit. */
  onViewData?: () => void;
}

function AttachFileRow({ f, onDownload }: { f: import('@api/attachments').AttachmentDto; onDownload: (id: string) => void }) {
  return (
    <Space direction="vertical" size={1}>
      <Space size={6} wrap>
        <Text style={{ fontSize: 12 }}>{f.originalFilename}</Text>
        <Tag style={{ fontSize: 11 }}>{formatBytes(f.fileSizeBytes)}</Tag>
        <ScanBadge status={f.scanStatus} />
        <Button
          type="link" size="small" icon={<DownloadOutlined />}
          disabled={f.scanStatus === 'INFECTED'}
          onClick={() => onDownload(f.id)}
          style={{ padding: 0, height: 'auto' }}
        />
      </Space>
      <Text type="secondary" style={{ fontSize: 11 }}>{dayjs(f.createdAt).format('DD MMM YYYY HH:mm')}</Text>
    </Space>
  );
}

const CA_LAND_FIELDS: { key: string; label: string }[] = [
  { key: 'area_selection',    label: 'Area Selection' },
  { key: 'village_map',       label: 'Village Map' },
  { key: 'topo_sheet',        label: 'TOPO Sheet' },
  { key: 'kml_file',          label: 'KML File' },
  { key: 'geo_reference_map', label: 'Geo Reference Map' },
];

const CHECKLIST_FIELDS: { key: string; label: string }[] = [
  { key: 'project_report',        label: 'Project Report' },
  { key: 'forest_area_statement', label: 'Forest Area Statement' },
  { key: 'dgps_survey',           label: 'DGPS Survey of Forest Land' },
  { key: 'gis_overlay',           label: 'GIS Overlay with Forest Map' },
  { key: 'fra_compliance',        label: 'FRA Compliance' },
];

const BASE_ENTITY_TYPE = 'ACTIVITY_RECORD';

function FcCALandPanel({ recordId }: { recordId: string }) {
  return <FcAttachmentSectionPanel recordId={recordId} fields={CA_LAND_FIELDS} title="CA Land" />;
}

function FcAttachmentSectionPanel({ recordId, fields, title }: { recordId: string; fields: { key: string; label: string }[]; title: string }) {
  const entityTypes = fields.map(({ key }) => `${BASE_ENTITY_TYPE}__${key}`);
  const { data, isLoading } = useQuery({
    queryKey: ['attachments', 'section-panel', ...entityTypes, recordId],
    queryFn: () =>
      Promise.all(entityTypes.map((et) => fetchAttachments(et, recordId))),
    staleTime: 0,
  });

  const downloadMutation = useMutation({
    mutationFn: (id: string) => getAttachmentDownloadUrl(id),
    onSuccess: (res) => window.open(res.presignedUrl, '_blank', 'noopener,noreferrer'),
  });

  return (
    <>
      <Divider orientation="left" orientationMargin={0} style={{ fontSize: 12, margin: '12px 0 6px' }}>{title}</Divider>
      <Descriptions size="small" column={2} bordered={false} colon>
        {fields.map(({ key, label }, i) => {
          const files = data?.[i] ?? [];
          return (
            <Descriptions.Item key={key} label={label}>
              {isLoading ? (
                <Text type="secondary" style={{ fontSize: 12 }}>Loading…</Text>
              ) : files.length === 0 ? (
                <Text type="secondary" style={{ fontSize: 12 }}>—</Text>
              ) : (
                <Space direction="vertical" size={4}>
                  {files.map((f) => (
                    <AttachFileRow key={f.id} f={f} onDownload={(id) => downloadMutation.mutate(id)} />
                  ))}
                </Space>
              )}
            </Descriptions.Item>
          );
        })}
      </Descriptions>
    </>
  );
}

// ── LA section attachment field map ──────────────────────────────────────────
// Each entry: RJSF field suffix (after stripping root_) → display label, grouped by section key.

const LA_SECTION_ATTACH: Record<string, { key: string; label: string }[]> = {
  srp:           [{ key: 'srp_gazette_pdf_attachment_id',             label: 'Gazette PDF' }],
  cala:          [{ key: 'cala_publication_in_gaz_pdf_attachment_id', label: 'Gazette PDF' }],
  section_20a:   [{ key: 'gazette_pub_pdf_attachment_id',             label: 'Gazette PDF' },
                  { key: 'local_newspaper_pdf',                        label: 'Local Newspaper PDF' }],
  section_20d:   [{ key: 'objections_pdf',                            label: 'Objections PDF' }],
  section_20e:   [{ key: 'declaration_gazette_pdf_attachment_id',     label: 'Gazette PDF' }],
  section_20h_i: [{ key: 'possession_pdf',                            label: 'Possession PDF' }],
  mutation:      [{ key: 'mutation_certificate',                       label: 'Mutation Certificate' }],
};

const LA_ALL_ATTACH_FIELDS = Object.values(LA_SECTION_ATTACH).flat();

type FieldEntry = { label: string; value: string };

function flattenSection(
  sec: Record<string, unknown>,
  order: string[],
  labels: Record<string, string>,
): FieldEntry[] {
  const out: FieldEntry[] = [];
  for (const k of order) {
    const v = sec[k];
    if (v === undefined || v === null || v === '') continue;
    if (typeof v === 'object' && !Array.isArray(v)) {
      const obj = v as Record<string, unknown>;
      if ('gaz_number' in obj || 'published_on' in obj) {
        if (obj.published_on) out.push({ label: `${labels[k]} – Published On`, value: String(obj.published_on) });
        if (obj.gaz_number)   out.push({ label: `${labels[k]} – Gazette No.`, value: String(obj.gaz_number) });
      } else if ('km' in obj || 'm' in obj) {
        const parts = [];
        if (obj.km !== undefined && obj.km !== null) parts.push(`${obj.km} km`);
        if (obj.m  !== undefined && obj.m  !== null) parts.push(`${obj.m} m`);
        if (parts.length) out.push({ label: labels[k], value: parts.join(' ') });
      } else {
        out.push({ label: labels[k], value: JSON.stringify(v) });
      }
    } else if (typeof v === 'boolean') {
      out.push({ label: labels[k], value: v ? 'Yes' : 'No' });
    } else {
      out.push({ label: labels[k], value: String(v) });
    }
  }
  return out;
}

function LaSectionBlock({
  title,
  entries,
  attachFiles,
  downloadFn,
}: {
  title: string;
  entries: FieldEntry[];
  attachFiles?: { label: string; files: import('@api/attachments').AttachmentDto[] }[];
  downloadFn: (id: string) => void;
}) {
  const hasAttach = attachFiles?.some((a) => a.files.length > 0) ?? false;
  if (entries.length === 0 && !hasAttach) return null;
  return (
    <>
      <Divider orientation="left" orientationMargin={0} style={{ fontSize: 12, margin: '12px 0 6px' }}>{title}</Divider>
      <Descriptions size="small" column={2} bordered={false} colon>
        {entries.map((e, i) => (
          <Descriptions.Item key={i} label={e.label}>{e.value}</Descriptions.Item>
        ))}
        {attachFiles?.map(({ label, files }) =>
          files.length === 0 ? null : (
            <Descriptions.Item key={label} label={label}>
              <Space direction="vertical" size={4}>
                {files.map((f) => (
                  <AttachFileRow key={f.id} f={f} onDownload={downloadFn} />
                ))}
              </Space>
            </Descriptions.Item>
          )
        )}
      </Descriptions>
    </>
  );
}

function LaDetailPanel({ recordId, dataJson }: { recordId: string; dataJson: Record<string, unknown> }) {
  const { data: allFiles } = useQuery({
    queryKey: ['attachments', 'section-panel', 'la', recordId],
    queryFn: () =>
      Promise.all(LA_ALL_ATTACH_FIELDS.map(({ key }) => fetchAttachments(`${BASE_ENTITY_TYPE}__${key}`, recordId))),
    staleTime: 0,
  });

  const downloadMutation = useMutation({
    mutationFn: (id: string) => getAttachmentDownloadUrl(id),
    onSuccess: (res) => window.open(res.presignedUrl, '_blank', 'noopener,noreferrer'),
  });

  // Map field key → fetched files
  const fileMap = new Map<string, import('@api/attachments').AttachmentDto[]>();
  LA_ALL_ATTACH_FIELDS.forEach(({ key }, i) => {
    fileMap.set(key, allFiles?.[i] ?? []);
  });

  function attachFor(sectionKey: string) {
    return (LA_SECTION_ATTACH[sectionKey] ?? []).map(({ key, label }) => ({
      label,
      files: fileMap.get(key) ?? [],
    }));
  }

  const adEntries = flattenSection(
    (dataJson.acquisition_details as Record<string, unknown> | undefined) ?? {},
    ['record_name','block_section_from','block_section_to','chainage_from','chainage_to','district','sub_division_taluka',
     'area_hectares_total','area_hectares_private','area_hectares_govt','area_hectares_forest','est_villages'],
    { record_name:'Record Name', block_section_from:'From Station', block_section_to:'To Station', chainage_from:'Chainage From',
      chainage_to:'Chainage To', district:'District', sub_division_taluka:'Sub-Division / Taluka',
      area_hectares_total:'Total Area (ha)', area_hectares_private:'Private Land (ha)',
      area_hectares_govt:'Govt. Land (ha)', area_hectares_forest:'Forest Land (ha)',
      est_villages:'Est. No. of Villages' },
  );
  const srpEntries = flattenSection(
    (dataJson.srp as Record<string, unknown> | undefined) ?? {},
    ['srp_declared_in_gaz_on'],
    { srp_declared_in_gaz_on:'Declared in Gazette On' },
  );
  const calaEntries = flattenSection(
    (dataJson.cala as Record<string, unknown> | undefined) ?? {},
    ['cala_received_from_state_on'],
    { cala_received_from_state_on:'Received from State On' },
  );
  const s20aEntries = flattenSection(
    (dataJson.section_20a as Record<string, unknown> | undefined) ?? {},
    ['notification_date','local_newspaper_pub_date'],
    { notification_date:'Notification Date', local_newspaper_pub_date:'Newspaper Pub. Date' },
  );
  const jmrEntries = flattenSection(
    (dataJson.jmr as Record<string, unknown> | undefined) ?? {},
    ['jmr_fee_demanded_on','jmr_fee_amount','jmr_fee_submitted_on','jmr_done_on','revision_required','revision_reason'],
    { jmr_fee_demanded_on:'Fee Demanded On', jmr_fee_amount:'Fee Amount (₹)',
      jmr_fee_submitted_on:'Fee Submitted On', jmr_done_on:'JMR Done On',
      revision_required:'Revision Required', revision_reason:'Revision Reason' },
  );
  const s20dEntries = flattenSection(
    (dataJson.section_20d as Record<string, unknown> | undefined) ?? {},
    ['objections_received','objections_summary','hearing_date'],
    { objections_received:'Objections Received', objections_summary:'Objections Summary', hearing_date:'Hearing Date' },
  );
  const s20eEntries = flattenSection(
    (dataJson.section_20e as Record<string, unknown> | undefined) ?? {},
    ['local_newspaper_pub_date'],
    { local_newspaper_pub_date:'Newspaper Pub. Date' },
  );
  const s20fgEntries = flattenSection(
    (dataJson.section_20f_g as Record<string, unknown> | undefined) ?? {},
    ['competent_authority','compensation_determined_on','compensation_amount','market_value_basis'],
    { competent_authority:'Competent Authority', compensation_determined_on:'Compensation Determined On',
      compensation_amount:'Compensation Amount (₹)', market_value_basis:'Market Value Basis' },
  );
  const s20hiEntries = flattenSection(
    (dataJson.section_20h_i as Record<string, unknown> | undefined) ?? {},
    ['payment_made_to','payment_date','possession_given_on'],
    { payment_made_to:'Payment Made To', payment_date:'Payment Date', possession_given_on:'Possession Given On' },
  );
  const mutationEntries = flattenSection(
    (dataJson.mutation as Record<string, unknown> | undefined) ?? {},
    ['mutation_done_on','revenue_records_updated','land_plan_approved','arbitration_required','arbitration_notes'],
    { mutation_done_on:'Mutation Done On', revenue_records_updated:'Revenue Records Updated',
      land_plan_approved:'Land Plan Approved', arbitration_required:'Arbitration Required',
      arbitration_notes:'Arbitration Notes' },
  );

  const dl = (id: string) => downloadMutation.mutate(id);

  return (
    <>
      <LaSectionBlock title="Acquisition Details" entries={adEntries} downloadFn={dl} />
      <LaSectionBlock title="SRP" entries={srpEntries} attachFiles={attachFor('srp')} downloadFn={dl} />
      <LaSectionBlock title="CALA" entries={calaEntries} attachFiles={attachFor('cala')} downloadFn={dl} />
      <LaSectionBlock title="Section 20A" entries={s20aEntries} attachFiles={attachFor('section_20a')} downloadFn={dl} />
      <LaSectionBlock title="JMR" entries={jmrEntries} downloadFn={dl} />
      <LaSectionBlock title="Section 20D" entries={s20dEntries} attachFiles={attachFor('section_20d')} downloadFn={dl} />
      <LaSectionBlock title="Section 20E" entries={s20eEntries} attachFiles={attachFor('section_20e')} downloadFn={dl} />
      <LaSectionBlock title="Section 20F-G" entries={s20fgEntries} downloadFn={dl} />
      <LaSectionBlock title="Section 20H-I" entries={s20hiEntries} attachFiles={attachFor('section_20h_i')} downloadFn={dl} />
      {/* #16 — the LA document checklist (KMZ/Drone/SRP/CALA) moved to the Activity Scope. */}
      <LaSectionBlock title="Mutation" entries={mutationEntries} attachFiles={attachFor('mutation')} downloadFn={dl} />
    </>
  );
}

const FC_SECTION_ATTACH: Record<string, { key: string; label: string }[]> = {
  stage_i:  [{ key: 'inspection_report_pdf', label: 'Inspection Report PDF' }],
  stage_ii: [{ key: 'final_approval_pdf',    label: 'Final Approval PDF' }],
};

const FC_ALL_ATTACH_FIELDS = Object.values(FC_SECTION_ATTACH).flat();

function FcSectionBlock({
  title,
  entries,
  attachFiles,
  downloadFn,
}: {
  title: string;
  entries: { label: string; value: string }[];
  attachFiles?: { label: string; files: import('@api/attachments').AttachmentDto[] }[];
  downloadFn: (id: string) => void;
}) {
  const hasAttach = attachFiles?.some((a) => a.files.length > 0) ?? false;
  if (entries.length === 0 && !hasAttach) return null;
  return (
    <>
      <Divider orientation="left" orientationMargin={0} style={{ fontSize: 12, margin: '12px 0 6px' }}>{title}</Divider>
      <Descriptions size="small" column={2} bordered={false} colon>
        {entries.map((e, i) => (
          <Descriptions.Item key={i} label={e.label}>{e.value}</Descriptions.Item>
        ))}
        {attachFiles?.map(({ label, files }) =>
          files.length === 0 ? null : (
            <Descriptions.Item key={label} label={label}>
              <Space direction="vertical" size={4}>
                {files.map((f) => (
                  <AttachFileRow key={f.id} f={f} onDownload={downloadFn} />
                ))}
              </Space>
            </Descriptions.Item>
          )
        )}
      </Descriptions>
    </>
  );
}

function FcDetailPanel({ recordId, dataJson }: { recordId: string; dataJson: Record<string, unknown> }) {
  const { data: allFiles } = useQuery({
    queryKey: ['attachments', 'section-panel', 'fc', recordId],
    queryFn: () =>
      Promise.all(FC_ALL_ATTACH_FIELDS.map(({ key }) => fetchAttachments(`${BASE_ENTITY_TYPE}__${key}`, recordId))),
    staleTime: 0,
  });

  const downloadMutation = useMutation({
    mutationFn: (id: string) => getAttachmentDownloadUrl(id),
    onSuccess: (res) => window.open(res.presignedUrl, '_blank', 'noopener,noreferrer'),
  });

  const fileMap = new Map<string, import('@api/attachments').AttachmentDto[]>();
  FC_ALL_ATTACH_FIELDS.forEach(({ key }, i) => fileMap.set(key, allFiles?.[i] ?? []));

  function attachFor(sectionKey: string) {
    return (FC_SECTION_ATTACH[sectionKey] ?? []).map(({ key, label }) => ({
      label,
      files: fileMap.get(key) ?? [],
    }));
  }

  function fcFlatten(sec: Record<string, unknown>, order: string[], labels: Record<string, string>) {
    const out: { label: string; value: string }[] = [];
    for (const k of order) {
      const v = sec[k];
      if (v === undefined || v === null || v === '') continue;
      if (typeof v === 'boolean') {
        out.push({ label: labels[k], value: v ? 'Yes' : 'No' });
      } else if (Array.isArray(v)) {
        if (v.length > 0) out.push({ label: labels[k], value: `${v.length} ${v.length === 1 ? 'entry' : 'entries'}` });
      } else if (typeof v === 'object') {
        out.push({ label: labels[k], value: JSON.stringify(v) });
      } else {
        out.push({ label: labels[k], value: String(v) });
      }
    }
    return out;
  }

  const adEntries = fcFlatten(
    (dataJson.acquisition_details as Record<string, unknown> | undefined) ?? {},
    ['record_name','block_section_from','block_section_to','chainage_from','chainage_to','forest_division','forest_area'],
    { record_name:'Record Name', block_section_from:'From Station', block_section_to:'To Station', chainage_from:'Chainage From',
      chainage_to:'Chainage To', forest_division:'Forest Division', forest_area:'Forest Area (ha)' },
  );
  const stageIEntries = fcFlatten(
    (dataJson.stage_i as Record<string, unknown> | undefined) ?? {},
    ['proposal_submitted_on_parivesh','proposal_submitted_date','scrutiny_by_dfo','scrutiny_date',
     'site_inspection','site_inspection_date','in_principle_approval','in_principle_approval_date',
     'stipulated_conditions','queries'],
    { proposal_submitted_on_parivesh:'Proposal on PARIVESH?', proposal_submitted_date:'Proposal Submitted On',
      scrutiny_by_dfo:'DFO Scrutiny Done?', scrutiny_date:'Scrutiny Date',
      site_inspection:'Site Inspection Done?', site_inspection_date:'Site Inspection Date',
      in_principle_approval:'In-Principle Approval?', in_principle_approval_date:'In-Principle Approval Date',
      stipulated_conditions:'Stipulated Conditions', queries:'Queries' },
  );
  const stageIIEntries = fcFlatten(
    (dataJson.stage_ii as Record<string, unknown> | undefined) ?? {},
    ['compliance_submitted_on','state_recommendation_forwarded_on','final_approval_on','queries'],
    { compliance_submitted_on:'Compliance Submitted On',
      state_recommendation_forwarded_on:'State Recommendation Forwarded On',
      final_approval_on:'Final Approval On', queries:'Queries' },
  );
  const postApprovalEntries = fcFlatten(
    (dataJson.post_approval as Record<string, unknown> | undefined) ?? {},
    ['formal_order_issued_on','tree_felling_started_on','compensatory_afforestation_initiated_on','queries'],
    { formal_order_issued_on:'Formal Order Issued On',
      tree_felling_started_on:'Tree Felling Started On',
      compensatory_afforestation_initiated_on:'Compensatory Afforestation Initiated On',
      queries:'Queries' },
  );

  const dl = (id: string) => downloadMutation.mutate(id);

  return (
    <>
      <FcSectionBlock title="Acquisition Details" entries={adEntries} downloadFn={dl} />
      <FcSectionBlock title="Stage I" entries={stageIEntries} attachFiles={attachFor('stage_i')} downloadFn={dl} />
      <FcSectionBlock title="Stage II" entries={stageIIEntries} attachFiles={attachFor('stage_ii')} downloadFn={dl} />
      <FcCALandPanel recordId={recordId} />
      <FcAttachmentSectionPanel recordId={recordId} fields={CHECKLIST_FIELDS} title="Checklist" />
      <FcSectionBlock title="Post Approval" entries={postApprovalEntries} downloadFn={dl} />
    </>
  );
}

export function RecordDetailPanel({
  recordId,
  activityTypeCode,
  canEdit,
  onClose,
  onDelete,
  onEdit,
  onViewData,
}: RecordDetailPanelProps) {
  const { t } = useTranslation('forms');
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

  const formDefQuery = useQuery({
    queryKey: ['form-definition', record?.formDefinitionId],
    queryFn: () => fetchFormDefinitionById(record!.formDefinitionId),
    enabled: !!record?.formDefinitionId && (activeSectionState?.availableActions.includes('verify') ?? false),
    staleTime: 5 * 60_000,
  });
  const missingFields = formDefQuery.data
    ? missingRequiredFields(formDefQuery.data.schemaJson, (record?.dataJson ?? {}) as Record<string, unknown>)
    : [];

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
      // The record list (activity pane, left) reads from this cache — invalidate it
      // so a renamed record shows the new name immediately, not only after a refresh.
      void queryClient.invalidateQueries({ queryKey: ['records', record?.projectActivityId] });
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
      icon: null,
      transitionName: '',
      maskTransitionName: '',
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
      // The record-list badge (in the activity pane's left list) and the
      // project-level Overview stats both read from these caches — without
      // invalidating them the state change doesn't show until something else
      // happens to trigger a refetch.
      if (record) void queryClient.invalidateQueries({ queryKey: ['records', record.projectActivityId] });
      void queryClient.invalidateQueries({ queryKey: ['activities'] });
      notifApi.success({ message: 'Action completed', duration: 2 });
    },
    onError: (err: Error) => {
      notifApi.error({ message: 'Action failed', description: err.message, duration: 5 });
    },
  });

  const startEditing = () => {
    setEditName(record?.name ?? '');
    setEditMetadata({});
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
  // Once Verified or Authenticated, the record is locked — no further edits or deletion.
  const isImmutable = record?.recordState === 'VERIFIED' || record?.recordState === 'AUTHENTICATED';

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

        {/* Once verified (or authenticated), the record is locked — no editing or
            deleting, but the data must still be viewable (e.g. so a CE/C can review
            before Authenticating). */}
        {isImmutable && record && !editing && (
          <Space size={8}>
            <Tooltip title="Locked after verification">
              <LockOutlined style={{ color: 'var(--ant-color-text-tertiary)', fontSize: 14 }} />
            </Tooltip>
            <Button
              size="small"
              type="primary"
              icon={<EditOutlined />}
              onClick={() => { if (onViewData) onViewData(); else onEdit?.(); }}
            >
              View Data
            </Button>
          </Space>
        )}

        {/* Primary: Edit Data (opens RJSF form) + ⋯ overflow with Delete */}
        {canEdit && record && !editing && !isImmutable && (
          <Space size={4}>
            <Button
              size="small"
              type="primary"
              icon={<EditOutlined />}
              onClick={() => onEdit?.()}
            >
              Edit Data
            </Button>
            <Dropdown
              trigger={['click']}
              menu={{
                items: [
                  {
                    key: 'rename',
                    icon: <EditOutlined />,
                    label: 'Rename',
                    onClick: startEditing,
                  },
                  { type: 'divider' },
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

              <Descriptions size="small" column={2} bordered={false} colon>
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
                      'record_name', 'block_section_from', 'block_section_to',
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
                      block_section_from:       'From Station',
                      block_section_to:         'To Station',
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
                      <Descriptions size="small" column={2} bordered={false} colon>
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
                      <Descriptions size="small" column={2} bordered={false} colon>
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
                        {data.block_section_from !== undefined && data.block_section_from !== '' && (
                          <Descriptions.Item label="From Station">
                            {String(data.block_section_from)}
                          </Descriptions.Item>
                        )}
                        {data.block_section_to !== undefined && data.block_section_to !== '' && (
                          <Descriptions.Item label="To Station">
                            {String(data.block_section_to)}
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
                      <Descriptions size="small" column={2} bordered={false} colon>
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
                        {data.block_section_from !== undefined && data.block_section_from !== '' && (
                          <Descriptions.Item label="From Station">
                            {String(data.block_section_from)}
                          </Descriptions.Item>
                        )}
                        {data.block_section_to !== undefined && data.block_section_to !== '' && (
                          <Descriptions.Item label="To Station">
                            {String(data.block_section_to)}
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
                ) : activity.activityTypeCode === 'DRAWING_APPROVAL' ? (
                  (() => {
                    const data = (record.dataJson ?? {}) as Record<string, unknown>;
                    // After V064, fields live in nested section sub-objects
                    const dd = (data.drawing_details as Record<string, unknown> | undefined) ?? {};
                    const sa = (data.sanction       as Record<string, unknown> | undefined) ?? {};

                    const DRAWING_TYPE_LABELS: Record<string, string> = {
                      ESP:                    'ESP',
                      SIP:                    'SIP',
                      ST_LT_TOC:              'ST/LT (TOC)',
                      SWRD:                   'SWRD',
                      SWR:                    'SWR',
                      FAT:                    'FAT',
                      SAT:                    'SAT',
                      RSP:                    'Mini Diagram / RSP',
                      CABLE_ROUTE_PLAN:       'CRP Cable Route Plan',
                      LOP:                    'LOP',
                      PROJECT_SHEET:          'Project Sheet',
                      GAD_MEGA:               'GAD (Mega)',
                      GAD_MAJOR:              'GAD (Major)',
                      GAD_MINOR:              'GAD (Minor)',
                      LWR_PLAN:               'LWR Plan',
                      GRADE_CONDONATION:      'Grade Condonation',
                      BRIDGE_MINOR_SANCTION:  'Minor Sanction of Bridge',
                      YARD_DISPENSATION:      'Dispensation of Yard',
                      YARD_MINOR_SANCTION:    'Minor Sanction of Yard',
                      STATION_BUILDING_GAD:   'Station Building GAD',
                      FOB_GAD_TAD:            'FOB',
                      CURVE_DETAILS:          'Curve Details',
                      TUNNEL_DESIGN:          'Tunnel Design',
                    };
                    const DA_DETAILS_ORDER = [
                      'record_name', 'drawing_type', 'section', 'station',
                      'drawing_number', 'chainage_from', 'chainage_to',
                      'description', 'revision',
                      'concept_esp_difference', 'curve_details',
                      'initiation_date', 'other_details', 'remarks',
                    ];
                    const DA_LABELS: Record<string, string> = {
                      record_name:              'Record Name',
                      drawing_type:             'Drawing Type',
                      section:                  'Section',
                      station:                  'Station',
                      initiation_date:          'Initiation Date',
                      drawing_number:           'Drawing Number',
                      chainage_from:            'Chainage From',
                      chainage_to:              'Chainage To',
                      description:              'Drawing Description',
                      revision:                 'Revision Number',
                      concept_esp_difference:   'Concept Plan vs ESP Difference',
                      curve_details:            'Curve Details',
                      other_details:            'Other Details',
                      remarks:                  'Remarks',
                    };
                    const detailEntries = DA_DETAILS_ORDER
                      .filter((k) => dd[k] !== null && dd[k] !== undefined && dd[k] !== '')
                      .map((k) => {
                        const v = dd[k];
                        const display = k === 'drawing_type'
                          ? (DRAWING_TYPE_LABELS[String(v)] ?? String(v))
                          : String(v);
                        return [k, display] as [string, string];
                      });

                    const observations: DrawingObservation[] =
                      Array.isArray(data.observations)
                        ? (data.observations as DrawingObservation[])
                        : [];

                    const sanctionDate    = sa.sanction_received_date as string | undefined;

                    return (
                      <Space direction="vertical" size={16} style={{ width: '100%' }}>
                        {/* Section 1: Drawing Details */}
                        <div>
                          <Divider orientation="left" orientationMargin={0} style={{ ...DIVIDER_STYLE, margin: '0 0 8px' }}>
                            Drawing Details
                          </Divider>
                          {detailEntries.length > 0 ? (
                            <Descriptions size="small" column={2} bordered={false} colon>
                              {detailEntries.map(([k, display]) => (
                                <Descriptions.Item key={k} label={DA_LABELS[k] ?? k}>
                                  {display}
                                </Descriptions.Item>
                              ))}
                            </Descriptions>
                          ) : (
                            <Text type="secondary" style={{ fontSize: 12, fontStyle: 'italic' }}>
                              No drawing details yet. Click "Edit" to add them.
                            </Text>
                          )}
                        </div>

                        {/* Section 2: Approvals */}
                        <div>
                          <Divider orientation="left" orientationMargin={0} style={{ ...DIVIDER_STYLE, margin: '0 0 8px' }}>
                            Approvals
                          </Divider>
                          <DrawingApproversPanel
                            recordId={recordId}
                            canEdit={canEdit}
                            recordCreatedAt={record.createdAt}
                          />
                        </div>

                        {/* Sections 3 & 4: Observations + Sanction share one row
                            (two columns) to keep them on one page. Observations
                            takes the wider column; Sanction is a compact box. */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)', gap: 20, alignItems: 'start' }}>
                          {/* Observations — panel renders its own heading + Add button */}
                          <DrawingObservationsPanel
                            recordId={recordId}
                            observations={observations}
                            canEdit={canEdit}
                          />

                          {/* Sanction */}
                          <div>
                            <Divider orientation="left" orientationMargin={0} style={{ ...DIVIDER_STYLE, margin: '0 0 8px' }}>
                              Sanction
                            </Divider>
                            {sanctionDate ? (
                              <div style={{ fontSize: 12 }}>
                                <Text type="secondary" style={{ fontSize: 12 }}>Received: </Text>
                                <Text strong style={{ fontSize: 12 }}>{dayjs(sanctionDate).format('D MMM YYYY')}</Text>
                              </div>
                            ) : (
                              <Text type="secondary" style={{ fontSize: 12, fontStyle: 'italic' }}>
                                Sanction not yet received.
                              </Text>
                            )}
                          </div>
                        </div>
                      </Space>
                    );
                  })()
                ) : activity.activityTypeCode === 'LAND_ACQUISITION' ? (
                  <LaDetailPanel
                    recordId={recordId}
                    dataJson={(record.dataJson ?? {}) as Record<string, unknown>}
                  />
                ) : activity.activityTypeCode === 'FOREST_CLEARANCE' ? (
                  <FcDetailPanel
                    recordId={record.id}
                    dataJson={(record.dataJson ?? {}) as Record<string, unknown>}
                  />
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
                        No details recorded yet.
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
                    {/* "Submit for Verification" is hidden for now — not needed in the
                        current workflow. Restore the 'submit' block below if it's
                        needed again. */}
                    {activeSectionState.availableActions.includes('resubmit') && (
                      <Button icon={<SendOutlined />} block
                        loading={workflowMutation.isPending}
                        onClick={() => workflowMutation.mutate({ action: 'resubmit' })}>
                        Resubmit
                      </Button>
                    )}
                    {activeSectionState.availableActions.includes('verify') && (
                      <>
                        <Popconfirm
                          title="Verify this record?"
                          description="Confirm every mandatory field has been checked."
                          okText="Verify" cancelText="Cancel"
                          disabled={missingFields.length > 0}
                          onConfirm={() => workflowMutation.mutate({ action: 'verify' })}>
                          <Tooltip title={missingFields.length > 0 ? `${missingFields.length} mandatory field(s) still empty` : undefined}>
                            <Button type="primary" icon={<CheckCircleOutlined />} block
                              disabled={missingFields.length > 0}
                              loading={workflowMutation.isPending || formDefQuery.isLoading}>
                              Verify
                            </Button>
                          </Tooltip>
                        </Popconfirm>
                      </>
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
                canUpload={false}
                canDelete={false}
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
