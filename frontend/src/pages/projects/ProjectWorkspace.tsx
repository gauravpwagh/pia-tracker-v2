/**
 * ProjectWorkspace — full-screen, single-project workspace.
 *
 * Layout: shared TopBar → project bar (full-width Back · name · status) →
 *   [project sidebar (Overview/Records/History/Map) | main area].
 *
 * Records view = activity tabs (icon · name · count) + record filters +
 * master-detail (record list on the left, detail/add/scope on the right).
 * The detail area reuses the full <RecordDetailPanel/> for a selected record.
 *
 * Design mirrors docs/mockups/workspace-preview.html.
 */

import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useLocation, useSearchParams } from 'react-router-dom';
import { Layout, Button, Input, InputNumber, Select, Spin, Empty, Alert, Tag, Tooltip, Typography, DatePicker, Modal, Form, Space } from 'antd';
import { PlusOutlined, ArrowLeftOutlined, EditOutlined, CloseOutlined, UserAddOutlined, UsergroupAddOutlined, StarOutlined } from '@ant-design/icons';
import { useQuery, useQueries, useMutation, useQueryClient } from '@tanstack/react-query';
import { AttachmentPanel, ACCEPT_GEOGRAPHIC, ACCEPT_VIDEO, ACCEPT_DOCUMENTS } from '@components/attachments/AttachmentPanel';
import { fetchAttachments } from '@api/attachments';
import dayjs from 'dayjs';

import { TopBar } from '@components/shell/TopBar';
import { useAuthStore } from '@stores/authStore';
import {
  fetchProjects,
  fetchActivities,
  fetchProjectAssignments,
  updateActivity,
  createActivity,
  allocateProject,
  assignDyceUsers,
  designateNodalUser,
  designatePrimaryCe,
  fetchProjectHistory,
  fetchZones,
  updateProjectDetails,
  type ActivityDetailResponse,
  type ProjectAssignmentItem,
} from '@api/projects';
import { fetchUsers, fetchUsersByDesignationAndZone, type UserSummary } from '@api/auth';
import {
  listRecords,
  createRecord,
  patchRecord,
  type ActivityRecordDetail,
} from '@api/activityRecords';
import { RecordDetailPanel } from './RecordDetailPanel';
import { RecordEditor } from '@pages/records/RecordEditPage';
import { TalukaDetailsPanel } from './TalukaDetailsPanel';

// Lazy — MapLibre + JSZip are heavy and only needed on the Map tab.
const MapView = lazy(() => import('./MapView').then((m) => ({ default: m.MapView })));

const { Header, Sider, Content } = Layout;
const { Text } = Typography;

const SIDE = '#1047ae';
const SIDE_SEL = '#2a63d6';
const LINE_STRONG = '#94a3b8';
const SIDE_W = 180;
const LIST_W = 300;
const TABBAR_BG = '#eaf1fb';

// ── Labels & icons ────────────────────────────────────────────────────────────

const LIFECYCLE_BADGE: Record<string, { color: string; label: string }> = {
  DRAFT: { color: 'default', label: 'Draft' },
  AWAITING_CAO_ALLOCATION: { color: 'orange', label: 'Awaiting Allocation' },
  AWAITING_CEC_ASSIGNMENT: { color: 'blue', label: 'Awaiting Assignment' },
  ACTIVE: { color: 'green', label: 'Active' },
  ON_HOLD: { color: 'orange', label: 'On Hold' },
  COMPLETED: { color: 'cyan', label: 'Completed' },
  DROPPED: { color: 'default', label: 'Dropped' },
  REMOVED: { color: 'red', label: 'Removed' },
  CLOSED: { color: 'default', label: 'Closed' },
};

// Plan Head number for each project type — matches ProjectsPage's mapping.
const PLAN_HEAD_BY_PROJECT_TYPE: Record<string, string> = {
  NEW_LINE: '11', GAUGE_CONVERSION: '14', DOUBLING: '15', ROAD_OVER_BRIDGE: '30', ELECTRIFICATION: '35',
};

const ACTIVITY_TYPE_LABEL: Record<string, string> = {
  LAND_ACQUISITION: 'Land Acquisition',
  FOREST_CLEARANCE: 'Forest Clearance',
  UTILITY_SHIFTING: 'Utility Shifting',
  DRAWING_APPROVAL: 'Drawing Approval',
  TENDER_PACKAGING: 'Tender Packaging',
  TEMPORARY_OFFICE_SPACE: 'Office Space',
};
// Matches DashboardPage's ACTIVITIES accentColor mapping, for visual consistency.
const ACTIVITY_TYPE_ACCENT: Record<string, string> = {
  LAND_ACQUISITION: '#52c41a', UTILITY_SHIFTING: '#1677ff', FOREST_CLEARANCE: '#389e0d',
  DRAWING_APPROVAL: '#9254de', TENDER_PACKAGING: '#fa8c16', TEMPORARY_OFFICE_SPACE: '#08979c',
};
const ACTIVITY_TYPE_ICON: Record<string, string> = {
  LAND_ACQUISITION: '📍', FOREST_CLEARANCE: '🌳', UTILITY_SHIFTING: '🔧',
  DRAWING_APPROVAL: '📐', TENDER_PACKAGING: '🧾', TEMPORARY_OFFICE_SPACE: '🏢',
};
// The six fixed activity types — always shown as tabs (image reference).
const ACTIVITY_TYPE_ORDER = [
  'LAND_ACQUISITION', 'UTILITY_SHIFTING', 'FOREST_CLEARANCE',
  'DRAWING_APPROVAL', 'TENDER_PACKAGING', 'TEMPORARY_OFFICE_SPACE',
];

const RECORD_STATE_COLOR: Record<string, string> = {
  DRAFT: 'default', SUBMITTED_FOR_VERIFICATION: 'blue', VERIFIED: 'cyan',
  AUTHENTICATED: 'green', SENT_BACK_TO_DYCE: 'orange', SENT_BACK_TO_NODAL: 'gold',
};
const RECORD_STATE_LABEL: Record<string, string> = {
  DRAFT: 'Draft', SUBMITTED_FOR_VERIFICATION: 'Submitted', VERIFIED: 'Verified',
  AUTHENTICATED: 'Authenticated', SENT_BACK_TO_DYCE: 'Sent Back', SENT_BACK_TO_NODAL: 'Sent Back',
};

// ── Project History: turn raw audit action codes into readable descriptions ─────
// Workflow transitions are logged as "WORKFLOW.<toStateCode>"; everything else is
// a fixed verb code (see AuditLogWriter call sites).
const WORKFLOW_ACTION_LABEL: Record<string, string> = {
  DRAFT: 'Moved back to Draft',
  SUBMITTED_FOR_VERIFICATION: 'Submitted for verification',
  PENDING_NODAL_VERIFICATION: 'Submitted for verification',
  VERIFIED: 'Verified & submitted for authentication',
  PENDING_CE_C_AUTHENTICATION: 'Verified & submitted for authentication',
  AUTHENTICATED: 'Authenticated',
  SENT_BACK_TO_DYCE: 'Sent back to Dy CE/C',
  SENT_BACK_TO_NODAL: 'Sent back to Nodal Dy CE/C',
};
const HISTORY_ACTION_LABEL: Record<string, string> = {
  'PROJECT.CREATE': 'Project created',
  'PROJECT.ALLOCATE': 'CE/C assigned',
  'PROJECT.ASSIGN_DYCE': 'Dy CE/C assigned',
  'PROJECT.DESIGNATE_NODAL': 'Nodal Dy CE/C designated',
  'PROJECT.DESIGNATE_PRIMARY_CE': 'Primary CE/C designated',
  'PROJECT.REMOVE': 'Project removed',
  'ACTIVITY.CREATE': 'Activity created',
  'ACTIVITY.UPDATE': 'Activity scope updated',
  'ACTIVITY_RECORD.CREATE': 'Record created',
  'ACTIVITY_RECORD.DELETE': 'Record deleted',
  'DRAWING.ADD_APPROVER': 'Drawing approver added',
  'DRAWING.REMOVE_APPROVER': 'Drawing approver removed',
};
function describeHistoryAction(action: string): string {
  if (action.startsWith('WORKFLOW.')) {
    const state = action.slice('WORKFLOW.'.length);
    return WORKFLOW_ACTION_LABEL[state] ?? `Moved to ${state.replace(/_/g, ' ').toLowerCase()}`;
  }
  return HISTORY_ACTION_LABEL[action] ?? action.replace(/[._]/g, ' ');
}
const HISTORY_ENTITY_LABEL: Record<string, string> = {
  PROJECT: 'Project', ACTIVITY: 'Activity', PROJECT_ACTIVITY: 'Activity', ACTIVITY_RECORD: 'Record',
};
type StatusFilter = 'all' | 'draft' | 'verified' | 'authenticated';
// Coarse buckets behind the 4 record filters (All / Draft / Verified / Authenticated):
//   draft       → DRAFT + SENT_BACK_TO_DYCE            (with the Dy CE/C, still editable)
//   verified    → SUBMITTED_FOR_VERIFICATION + VERIFIED + SENT_BACK_TO_NODAL (in the verification pipeline)
//   authenticated → AUTHENTICATED
function stateBucket(s: string): Exclude<StatusFilter, 'all'> {
  if (s === 'DRAFT' || s === 'SENT_BACK_TO_DYCE') return 'draft';
  if (s === 'AUTHENTICATED') return 'authenticated';
  return 'verified';
}

const RECORD_CREATABLE = new Set([
  'LAND_ACQUISITION', 'FOREST_CLEARANCE', 'UTILITY_SHIFTING',
  'TEMPORARY_OFFICE_SPACE', 'TENDER_PACKAGING', 'DRAWING_APPROVAL',
]);

const UTILITY_TYPE_OPTIONS = [
  { value: 'LT', label: 'LT' }, { value: 'HT', label: 'HT' }, { value: 'EHV', label: 'EHV' },
  { value: 'PIPELINE_WATER', label: 'Pipeline (Water)' },
  { value: 'PIPELINE_INFLAMMABLE', label: 'Pipeline (Inflammable Material)' },
  { value: 'PIPELINE_OTHER', label: 'Pipeline (Other)' },
  { value: 'SNT_SIGNAL_TELECOM', label: 'SNT Signal and Telecom Cable' },
  { value: 'SNT_LOCATION_BOX', label: 'SNT Location Box' },
  { value: 'SNT_SIGNAL_MAST', label: 'SNT Signal Mast' }, { value: 'SNT_IBH', label: 'SNT IBH' },
  { value: 'QUARTER', label: 'Quarter' }, { value: 'STATION_BUILDING', label: 'Station Building' },
  { value: 'AQUEDUCT_CANAL', label: 'Aqueduct / Canal' }, { value: 'ROAD', label: 'Road' },
  { value: 'TSS', label: 'TSS' }, { value: 'SS', label: 'SS' }, { value: 'OHE_MAST', label: 'OHE Mast' },
];
const DRAWING_TYPE_OPTIONS = [
  { value: 'ESP', label: 'ESP — Earth Slope Profile' }, { value: 'SIP', label: 'SIP — Section Improvement Plan' },
  { value: 'ST_LT_TOC', label: 'ST / LT / TOC' }, { value: 'SWR', label: 'SWR — Site Working Report' },
  { value: 'SWRD', label: 'SWRD' }, { value: 'FAT', label: 'FAT — Final Alignment Transect' },
  { value: 'SAT', label: 'SAT — Site Assessment Template' }, { value: 'RSP', label: 'RSP — Route Survey Plan' },
  { value: 'CABLE_ROUTE_PLAN', label: 'Cable Route Plan' }, { value: 'LOP', label: 'LOP — Layout of Project' },
  { value: 'PROJECT_SHEET', label: 'Project Sheet' }, { value: 'GAD_MEGA', label: 'GAD — Mega Bridge' },
  { value: 'GAD_MAJOR', label: 'GAD — Major Bridge' }, { value: 'GAD_MINOR', label: 'GAD — Minor Bridge' },
  { value: 'LWR_PLAN', label: 'LWR Plan' }, { value: 'CURVE_DETAILS', label: 'Curve Details' },
  { value: 'GRADE_CONDONATION', label: 'Grade Condonation' }, { value: 'BRIDGE_MINOR_SANCTION', label: 'Bridge Minor Sanction' },
  { value: 'YARD_DISPENSATION', label: 'Yard Dispensation' }, { value: 'YARD_MINOR_SANCTION', label: 'Yard Minor Sanction' },
  { value: 'STATION_BUILDING_GAD', label: 'Station Building GAD' }, { value: 'FOB_GAD_TAD', label: 'FOB GAD / TAD' },
  { value: 'TUNNEL_DESIGN', label: 'Tunnel Design' },
];

// Land Acquisition scope Checklist — documents uploaded at the activity level
// (entityType `PROJECT_ACTIVITY__<key>`, entityId = activity id). KMZ/SRP/CALA are
// mandatory before records can be added; Drone footage is optional (#11).
const LA_SCOPE_DOC_FIELDS: { key: string; label: string; mandatory: boolean; accept: string }[] = [
  // Browsers report an empty/unknown MIME for .kmz/.kml, so the accept list must include the
  // file extensions (the upload validator matches these against the filename).
  { key: 'kmz_file',         label: 'KMZ File',                     mandatory: true,  accept: `${ACCEPT_GEOGRAPHIC},.kmz,.kml,.gpx` },
  { key: 'drone_footage',    label: "Drone Footage of L' Section",  mandatory: false, accept: ACCEPT_VIDEO },
  { key: 'srp_notification', label: 'Notification of SRP',          mandatory: true,  accept: ACCEPT_DOCUMENTS },
  { key: 'cala_nomination',  label: 'CALA Nomination',              mandatory: true,  accept: ACCEPT_DOCUMENTS },
];
const LA_SCOPE_MANDATORY = LA_SCOPE_DOC_FIELDS.filter((f) => f.mandatory);

const ASSIGNMENT_ROLE_LABEL: Record<string, string> = {
  CE_C: 'CE / C', PRIMARY_CE_C: 'CE / C (Primary)', DY_CE_C: 'Dy.CE / C',
  NODAL_DY_CE_C: 'Dy.CE / C (Nodal)', CAO_C: 'CAO / C',
};

function recordDisplayName(r: ActivityRecordDetail, i: number): string {
  if (r.name) return r.name;
  if (r.recordSubtype) return r.recordSubtype.replace(/_/g, ' ');
  return `Record ${i + 1}`;
}
// ── Activity pane: filters + master-detail ─────────────────────────────────────

type DetailMode = { kind: 'empty' } | { kind: 'record'; id: string } | { kind: 'add' } | { kind: 'scope' } | { kind: 'taluka' };

function ActivityPane({ activity, activityType, projectId, canEdit, initialRecordId }: {
  activity: ActivityDetailResponse | null;
  activityType: string;
  projectId: string;
  canEdit: boolean;
  /** When set (e.g. arriving from the inbox), open this record on mount. */
  initialRecordId?: string;
}) {
  const queryClient = useQueryClient();
  const activityId = activity?.id;
  const typeCode = activityType;
  const isUs = typeCode === 'UTILITY_SHIFTING';
  const isDrawing = typeCode === 'DRAWING_APPROVAL';
  const isLa = typeCode === 'LAND_ACQUISITION';
  const needsSubtype = isUs || isDrawing;

  const currentUser = useAuthStore((s) => s.currentUser);
  const canUploadDocs = currentUser?.permissions.includes('ATTACHMENT.UPLOAD.OWN_RECORDS') ?? false;

  const [mode, setMode] = useState<DetailMode>(initialRecordId ? { kind: 'record', id: initialRecordId } : { kind: 'empty' });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingReadOnly, setEditingReadOnly] = useState(false);
  const [search, setSearch] = useState('');
  const [statusF, setStatusF] = useState<StatusFilter>('all');
  // Subtype filter — Utility Type (Utility Shifting) / Drawing Type (Drawing Approval).
  const [subtypeF, setSubtypeF] = useState<string | undefined>(undefined);
  // add-record inline form
  const [newName, setNewName] = useState('');
  const [newSubtype, setNewSubtype] = useState<string | undefined>(undefined);
  // scope editor
  const [scNotes, setScNotes] = useState(activity?.scopeNotes ?? '');
  const [scTarget, setScTarget] = useState<dayjs.Dayjs | null>(activity?.targetCompletionDate ? dayjs(activity.targetCompletionDate) : null);
  const [scTotal, setScTotal] = useState<number | null>((activity?.metadataJson?.total_count as number | undefined) ?? null);
  // Land Acquisition only — overall hectares planned for the whole activity (distinct from
  // each record's own per-village area_hectares_total). Reuses the existing area_hectares_total
  // column on land_acquisition_details (already read/written by upsertDetails/readDetails).
  const [scTotalHa, setScTotalHa] = useState<number | null>((activity?.metadataJson?.area_hectares_total as number | undefined) ?? null);

  // Scope values as currently persisted on the activity (drive the KPI + Add-Record gate).
  const totalCount = (activity?.metadataJson?.total_count as number | undefined) ?? null;
  const totalHa = (activity?.metadataJson?.area_hectares_total as number | undefined) ?? null;

  // Load the current scope values into the editor fields (used by the Scope button + auto-open).
  const openScope = () => {
    setScNotes(activity?.scopeNotes ?? '');
    setScTarget(activity?.targetCompletionDate ? dayjs(activity.targetCompletionDate) : null);
    setScTotal((activity?.metadataJson?.total_count as number | undefined) ?? null);
    setScTotalHa((activity?.metadataJson?.area_hectares_total as number | undefined) ?? null);
    setMode({ kind: 'scope' });
  };

  const recordsQuery = useQuery({
    queryKey: ['records', activityId],
    queryFn: () => listRecords(activityId!),
    enabled: !!activityId,
  });
  const records = useMemo(
    () => [...(recordsQuery.data ?? [])].sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? '')),
    [recordsQuery.data],
  );

  const kpi = useMemo(() => {
    let draft = 0, verified = 0, auth = 0;
    for (const r of records) {
      const b = stateBucket(r.recordState);
      if (b === 'draft') draft++; else if (b === 'authenticated') auth++; else verified++;
    }
    return { total: records.length, draft, verified, auth };
  }, [records]);

  // Land Acquisition only — sum of each record's own Total Area (ha), for the
  // "Land Details (ha)" KPI (acquired-so-far / Total Land Acquisition (ha) from scope).
  const acquiredHa = useMemo(() => {
    if (!isLa) return 0;
    return records.reduce((sum, r) => {
      const ad = (r.dataJson as Record<string, unknown> | undefined)?.acquisition_details as Record<string, unknown> | undefined;
      const v = ad?.area_hectares_total;
      return sum + (typeof v === 'number' ? v : 0);
    }, 0);
  }, [records, isLa]);

  const filtered = records.filter((r, i) => {
    if (search && !recordDisplayName(r, i).toLowerCase().includes(search.toLowerCase())) return false;
    if (statusF !== 'all' && stateBucket(r.recordState) !== statusF) return false;
    if (subtypeF && r.recordSubtype !== subtypeF) return false;
    return true;
  });

  // Resolve (or lazily create) the activity for this type WITHOUT ever creating a
  // second one. A stale activities cache could otherwise let two quick actions each
  // create their own "Land Acquisition" / "Utility Shifting" row. We defend against
  // that here: re-fetch the live list first and reuse any existing activity of this
  // type, and if a create still loses a race (another tab/click, or the backend's
  // unique guard fires) we re-fetch and reuse instead of surfacing an error.
  const ensureActivityId = async (): Promise<string> => {
    if (activityId) return activityId;
    const findExisting = (list: ActivityDetailResponse[]) =>
      list.find((a) => a.activityTypeCode === activityType)?.id;
    const fresh = await queryClient.fetchQuery({
      queryKey: ['activities', projectId],
      queryFn: () => fetchActivities(projectId),
    });
    const existing = findExisting(fresh);
    if (existing) return existing;
    try {
      const created = await createActivity(projectId, {
        activityTypeCode: activityType,
        name: ACTIVITY_TYPE_LABEL[activityType] ?? activityType.replace(/_/g, ' '),
      });
      return created.id;
    } catch (err) {
      const after = await queryClient.fetchQuery({
        queryKey: ['activities', projectId],
        queryFn: () => fetchActivities(projectId),
      });
      const reuse = findExisting(after);
      if (reuse) return reuse;
      throw err;
    }
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      // Create the activity on demand the first time a record is added for this type.
      const actId = await ensureActivityId();
      const rec = await createRecord(actId, needsSubtype ? newSubtype : undefined, newName || undefined);
      if (isUs && newSubtype) await patchRecord(rec.id, { utility_type: newSubtype });
      return rec;
    },
    onSuccess: (rec) => {
      void queryClient.invalidateQueries({ queryKey: ['activities'] });
      void queryClient.invalidateQueries({ queryKey: ['records', activityId] });
      setNewName(''); setNewSubtype(undefined);
      setMode({ kind: 'record', id: rec.id }); // new draft joins list (top) and opens
    },
  });

  const scopeMutation = useMutation({
    mutationFn: async () => {
      // Create the activity on first Save scope (it may not exist yet — six tabs are always
      // shown, but the DB row is created lazily). Records can't be added until this is saved.
      const name = activity?.name ?? (ACTIVITY_TYPE_LABEL[activityType] ?? activityType.replace(/_/g, ' '));
      const metadataJson = {
        ...(activity?.metadataJson ?? {}),
        total_count: scTotal,
        ...(isLa ? { area_hectares_total: scTotalHa } : {}),
      };
      const payload = {
        name,
        scopeNotes: scNotes || undefined,
        targetCompletionDate: scTarget ? scTarget.format('YYYY-MM-DD') : undefined,
        metadataJson,
      };
      // Resolve-or-create through the same dedupe-safe path as record creation, then
      // write the scope onto whichever activity that resolved to (never a second row).
      const id = await ensureActivityId();
      return updateActivity(id, payload);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['activities'] });
      // Keep the scope panel open for Land Acquisition so the mandatory docs can be uploaded
      // right after the activity is created; other activities have nothing more to fill.
      if (!isLa) setMode({ kind: 'empty' });
    },
  });

  const canCreateType = RECORD_CREATABLE.has(typeCode) && canEdit;
  // Records can't be added until the activity scope is saved with the mandatory fields
  // (total count + target completion). Land Acquisition additionally requires the mandatory
  // checklist docs — added in `addRecordEnabled` below (#11).
  const scopeSaved = !!activity && totalCount != null && totalCount >= 1 && !!activity.targetCompletionDate;

  // Land Acquisition also requires the mandatory scope docs (KMZ, SRP, CALA) before records
  // can be added (#11). Query the same keys AttachmentPanel uses so uploads refresh this gate.
  const laDocQueries = useQueries({
    queries: (isLa && activityId ? LA_SCOPE_MANDATORY : []).map((f) => ({
      queryKey: ['attachments', `PROJECT_ACTIVITY__${f.key}`, activityId],
      queryFn: () => fetchAttachments(`PROJECT_ACTIVITY__${f.key}`, activityId!),
    })),
  });
  const laMandatoryReady =
    !isLa ||
    (!!activityId &&
      laDocQueries.length === LA_SCOPE_MANDATORY.length &&
      laDocQueries.every((q) => (q.data?.length ?? 0) > 0));
  const addRecordEnabled = scopeSaved && laMandatoryReady;

  // #12/#2 — open the Scope panel by default whenever records can't yet be added
  // (scope incomplete → Add Record disabled). Fires once per pane mount so the user can
  // still close it; revisiting an incomplete activity re-opens it. Suppressed when arriving
  // from the inbox to open a specific record.
  const scopeAutoTriedRef = useRef(false);
  const laDocsLoading = isLa && !!activityId && laDocQueries.some((q) => q.isLoading);
  useEffect(() => {
    if (scopeAutoTriedRef.current) return;
    if (!canEdit || initialRecordId) { scopeAutoTriedRef.current = true; return; }
    if (laDocsLoading) return; // wait until LA doc presence is known before deciding
    if (!addRecordEnabled) openScope();
    scopeAutoTriedRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canEdit, initialRecordId, addRecordEnabled, laDocsLoading]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Pane header: Activity name [Scope] | KPIs | Add Record — separator below */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '6px 20px', flexShrink: 0, borderBottom: '1px solid var(--ant-color-border)' }}>
        <h3 style={{ margin: 0, fontSize: 15 }}>{ACTIVITY_TYPE_LABEL[typeCode] ?? typeCode.replace(/_/g, ' ')}</h3>
        {canEdit && (
          <Button
            size="small"
            icon={<EditOutlined />}
            style={{ background: '#ffe7ba', borderColor: '#ffd591', color: 'rgba(0,0,0,0.85)' }}
            onClick={() => { if (mode.kind === 'scope') setMode({ kind: 'empty' }); else openScope(); }}>
            Scope
          </Button>
        )}
        {isLa && (
          <Button
            size="small"
            style={{ background: '#d9f7be', borderColor: '#b7eb8f', color: 'rgba(0,0,0,0.85)' }}
            onClick={() => setMode(mode.kind === 'taluka' ? { kind: 'empty' } : { kind: 'taluka' })}>
            Sub division/taluka
          </Button>
        )}
        <div style={{ display: 'flex', gap: 8, flex: 1, justifyContent: 'center' }}>
          <Kpi label="Records" value={`${kpi.total} / ${totalCount ?? '—'}`} color="var(--ant-color-text)" />
          <Kpi label="Draft" value={kpi.draft} color="#6b7280" />
          <Kpi label="Verified" value={kpi.verified} color="#1d4ed8" />
          <Kpi label="Authenticated" value={kpi.auth} color="#166534" />
          {isLa && (
            <Kpi label="Land Details (ha)" value={`${acquiredHa.toFixed(2)} / ${totalHa != null ? totalHa.toFixed(2) : '—'}`} color="#7c3aed" />
          )}
        </div>
        {canCreateType && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            {!addRecordEnabled && (
              <Text type="secondary" style={{ fontSize: 12, fontStyle: 'italic' }}>Add scope to enable</Text>
            )}
            <Tooltip title={addRecordEnabled ? '' : (!scopeSaved
              ? 'Save the activity scope (total count + target completion) to add records'
              : 'Upload the mandatory scope documents (KMZ, SRP, CALA) to add records')}>
              <Button type="primary" icon={<PlusOutlined />} disabled={!addRecordEnabled}
                style={addRecordEnabled ? { background: '#1565c0', borderColor: '#1565c0' } : undefined}
                onClick={() => { setNewName(''); setNewSubtype(undefined); setMode({ kind: 'add' }); }}>
                Add Record
              </Button>
            </Tooltip>
          </span>
        )}
      </div>

      {/* Activity scope editor — full-width panel, shown above the filters/list */}
      {mode.kind === 'scope' && (
        <div style={{ margin: '10px 20px 0', padding: '10px 14px', border: '1px solid var(--ant-color-border)', borderRadius: 10, background: 'var(--ant-color-bg-container)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ fontWeight: 600, flex: 1 }}>Activity scope — {ACTIVITY_TYPE_LABEL[typeCode] ?? typeCode}</div>
            <Button type="text" size="small" icon={<CloseOutlined />} onClick={() => setMode({ kind: 'empty' })} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
              <div style={{ flex: '0 1 240px' }}>
                <Field label={`Total count of ${ACTIVITY_TYPE_LABEL[typeCode] ?? typeCode.replace(/_/g, ' ')}`}>
                  <InputNumber style={{ width: '100%' }} min={1} value={scTotal} onChange={(v) => setScTotal(v)} placeholder="e.g. 12" />
                </Field>
              </div>
              {isLa && (
                <div style={{ flex: '0 1 200px' }}>
                  <Field label="Total Land Acquisition (ha)">
                    <InputNumber style={{ width: '100%' }} min={0} step={0.01} value={scTotalHa} onChange={(v) => setScTotalHa(v)} placeholder="e.g. 25.5" />
                  </Field>
                </div>
              )}
              <div style={{ flex: '0 1 220px' }}>
                <Field label="Target completion"><DatePicker style={{ width: '100%' }} value={scTarget} onChange={setScTarget} /></Field>
              </div>
              <div style={{ flex: '2 1 360px' }}>
                <Field label="Scope notes (optional)"><Input.TextArea rows={1} autoSize={{ minRows: 1, maxRows: 3 }} value={scNotes} onChange={(e) => setScNotes(e.target.value)} /></Field>
              </div>
            </div>

            {/* #11 — Land Acquisition scope checklist (docs on the activity). */}
            {isLa && (
              <div style={{ borderTop: '1px solid var(--ant-color-border)', paddingTop: 10, marginTop: 2 }}>
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>
                  Checklist{' '}
                  <Text type="secondary" style={{ fontWeight: 400, fontSize: 12 }}>
                    — KMZ File, Notification of SRP and CALA Nomination are mandatory before records can be added
                  </Text>
                </div>
                {!activityId ? (
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    Save the scope first (total count + target completion) to enable document uploads.
                  </Text>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 28px' }}>
                    {LA_SCOPE_DOC_FIELDS.map((f) => (
                      <div key={f.key}>
                        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                          {f.label}{' '}
                          {f.mandatory
                            ? <span style={{ color: 'var(--ant-color-error)' }}>*</span>
                            : <Text type="secondary" style={{ fontWeight: 400 }}>(optional)</Text>}
                        </div>
                        <AttachmentPanel
                          entityType={`PROJECT_ACTIVITY__${f.key}`}
                          entityId={activityId}
                          canUpload={canUploadDocs}
                          currentUserId={currentUser?.userId}
                          accept={f.accept}
                          uploadLabel="Upload"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            {scopeMutation.isError && (
              <Alert type="error" showIcon message={scopeMutation.error instanceof Error ? scopeMutation.error.message : 'Failed to save scope'} />
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center' }}>
              <Text type="secondary" style={{ fontSize: 12, marginRight: 'auto' }}>
                {isLa && activityId && !laMandatoryReady
                  ? 'Upload the mandatory checklist documents (KMZ, SRP, CALA) to save further scope changes.'
                  : 'Total count and target completion are required before records can be added.'}
              </Text>
              <Button onClick={() => setMode({ kind: 'empty' })}>Cancel</Button>
              <Button type="primary" loading={scopeMutation.isPending}
                disabled={!scTotal || scTotal < 1 || !scTarget || (isLa && !!activityId && !laMandatoryReady)}
                onClick={() => scopeMutation.mutate()}>Save scope</Button>
            </div>
          </div>
        </div>
      )}

      {mode.kind === 'taluka' && activityId ? (
        <TalukaDetailsPanel activityId={activityId} canEdit={canEdit} />
      ) : (
      <>
      {/* Record filters — labels left, separated */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '12px 20px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ant-color-text-secondary)' }}>Search</label>
          <Input size="small" allowClear placeholder="Search records…" style={{ width: 200, fontSize: 12, padding: '1px 7px' }}
            value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div style={{ width: 1, alignSelf: 'stretch', background: 'var(--ant-color-border)', margin: '2px 0' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ant-color-text-secondary)' }}>Status</label>
          <Select size="small" style={{ width: 200, fontSize: 12 }} value={statusF} onChange={setStatusF}
            options={[
              { value: 'all', label: 'All' }, { value: 'draft', label: 'Draft' },
              { value: 'verified', label: 'Verified' }, { value: 'authenticated', label: 'Authenticated' },
            ]} />
        </div>
        {needsSubtype && (
          <>
            <div style={{ width: 1, alignSelf: 'stretch', background: 'var(--ant-color-border)', margin: '2px 0' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ant-color-text-secondary)' }}>
                {isUs ? 'Utility Type' : 'Drawing Type'}
              </label>
              <Select size="small" style={{ width: 220, fontSize: 12 }} value={subtypeF ?? ''} onChange={(v) => setSubtypeF(v || undefined)}
                showSearch optionFilterProp="label"
                options={[{ value: '', label: 'All' }, ...(isUs ? UTILITY_TYPE_OPTIONS : DRAWING_TYPE_OPTIONS)]} />
            </div>
          </>
        )}
      </div>

      {/* Master-detail split */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: 14, padding: '0 20px 18px' }}>
        {/* list */}
        <div style={{ width: LIST_W, flexShrink: 0, overflowY: 'auto' }}>
          {recordsQuery.isLoading ? (
            <Spin style={{ display: 'block', margin: '32px auto' }} />
          ) : records.length === 0 ? (
            <Empty description="No records yet." style={{ marginTop: 32 }} />
          ) : filtered.length === 0 ? (
            <Empty description="No records match the filters." style={{ marginTop: 32 }} />
          ) : (
            filtered.map((r, i) => {
              const sel = mode.kind === 'record' && mode.id === r.id;
              return (
                <div key={r.id} onClick={() => { setEditingId(null); setMode({ kind: 'record', id: r.id }); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', marginBottom: 6,
                    borderRadius: 8, cursor: 'pointer', background: sel ? '#e3effd' : 'var(--ant-color-bg-container)',
                    border: `1px solid ${sel ? 'var(--ant-color-primary)' : 'var(--ant-color-border)'}`,
                    borderLeft: sel ? '5px solid var(--ant-color-primary)' : '1px solid var(--ant-color-border)',
                  }}>
                  <span style={{ width: 26, height: 26, borderRadius: 6, background: 'var(--ant-color-primary-bg)', color: 'var(--ant-color-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, flexShrink: 0 }}>📄</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, lineHeight: '17px', color: sel ? 'var(--ant-color-primary)' : undefined, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {recordDisplayName(r, i)}
                    </div>
                    {r.recordSubtype && <div style={{ fontSize: 11, color: 'var(--ant-color-text-tertiary)' }}>{r.recordSubtype.replace(/_/g, ' ')}</div>}
                  </div>
                  <Tag color={RECORD_STATE_COLOR[r.recordState] ?? 'default'} style={{ margin: 0, fontSize: 12, lineHeight: '22px', padding: '0 11px', borderRadius: 20, fontWeight: 600 }}>
                    {RECORD_STATE_LABEL[r.recordState] ?? r.recordState.replace(/_/g, ' ')}
                  </Tag>
                </div>
              );
            })
          )}
        </div>

        {/* detail */}
        <div style={{ flex: 1, minWidth: 0, border: '1px solid var(--ant-color-border)', borderRadius: 10, background: 'var(--ant-color-bg-container)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {mode.kind === 'record' ? (
            editingId === mode.id ? (
              <RecordEditor
                recordId={mode.id}
                layout="inline"
                readOnly={editingReadOnly}
                onBack={() => { setEditingId(null); void queryClient.invalidateQueries({ queryKey: ['records', activityId] }); }}
              />
            ) : (
              <div style={{ flex: 1, overflow: 'auto' }}>
                <RecordDetailPanel
                  recordId={mode.id}
                  activityTypeCode={typeCode}
                  canEdit={canEdit}
                  onEdit={() => { setEditingReadOnly(false); setEditingId(mode.id); }}
                  onViewData={() => { setEditingReadOnly(true); setEditingId(mode.id); }}
                  onClose={() => setMode({ kind: 'empty' })}
                />
              </div>
            )
          ) : mode.kind === 'add' ? (
            <div style={{ padding: 18, flex: 1, overflow: 'auto' }}>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: 14 }}>
                <div style={{ fontWeight: 600, flex: 1 }}>New {ACTIVITY_TYPE_LABEL[typeCode] ?? 'record'}</div>
                <Button type="text" icon={<CloseOutlined />} onClick={() => setMode({ kind: 'empty' })} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {needsSubtype && (
                  <Field label={isUs ? 'Infringement / Utility Type' : 'Drawing Type'}>
                    <OptionList value={newSubtype} onChange={setNewSubtype} options={isUs ? UTILITY_TYPE_OPTIONS : DRAWING_TYPE_OPTIONS} />
                  </Field>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 480 }}>
                  <Field label="Record name">
                    <Input placeholder="e.g. Sakri Village, Section 3…" value={newName} onChange={(e) => setNewName(e.target.value)}
                      onPressEnter={() => { if (!createMutation.isPending && newName.trim() && !(needsSubtype && !newSubtype)) createMutation.mutate(); }} />
                  </Field>
                  {createMutation.isError && (
                    <Alert type="error" showIcon message={createMutation.error instanceof Error ? createMutation.error.message : 'Failed to create record'} />
                  )}
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <Button onClick={() => setMode({ kind: 'empty' })}>Cancel</Button>
                    <Button type="primary" loading={createMutation.isPending} disabled={!newName.trim() || (needsSubtype && !newSubtype)} onClick={() => createMutation.mutate()}>
                      Create record
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--ant-color-text-tertiary)', gap: 6, textAlign: 'center', padding: 24 }}>
              <div style={{ fontSize: 30 }}>🗂️</div>
              <div>Select a record to view its details,<br />or click <b>Add Record</b> to create one.</div>
            </div>
          )}
        </div>
      </div>
      </>
      )}
    </div>
  );
}

function Kpi({ label, value, color }: { label: string; value: React.ReactNode; color: string }) {
  return (
    <div style={{ border: '1px solid var(--ant-color-border)', borderRadius: 8, padding: '6px 12px', background: 'var(--ant-color-bg-container)', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
      <span style={{ color: 'var(--ant-color-text-secondary)' }}>{label} :</span>
      <span style={{ fontWeight: 700, fontSize: 15, color }}>{value}</span>
    </div>
  );
}
/** All options shown at once (no dropdown), single-select — for Utility/Drawing type pickers. */
function OptionList({ value, onChange, options }: { value: string | undefined; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, border: '1px solid var(--ant-color-border)', borderRadius: 8, padding: 10 }}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            style={{
              minWidth: 120, padding: '6px 12px', fontSize: 12, borderRadius: 16, cursor: 'pointer',
              border: `1px solid ${selected ? 'var(--ant-color-primary)' : 'var(--ant-color-border)'}`,
              background: selected ? 'var(--ant-color-primary)' : 'var(--ant-color-bg-container)',
              color: selected ? '#fff' : 'var(--ant-color-text)',
              fontWeight: selected ? 600 : 400,
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <label style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>{label}</label>
      {children}
    </div>
  );
}

// ── Assignment modals ────────────────────────────────────────────────────────

type AssignModalKind = 'allocate' | 'primaryCe' | 'assignDyce' | null;

function AllocateModal({
  projectId, zoneId, open, onClose, onSuccess,
}: { projectId: string; zoneId: string; open: boolean; onClose: () => void; onSuccess: () => void }) {
  const [form] = Form.useForm<{ ceUserIds: string[]; primaryCeUserId?: string }>();
  const ceUserIds = Form.useWatch('ceUserIds', form) ?? [];
  const cecQuery = useQuery({
    queryKey: ['users', 'CE_C', zoneId],
    queryFn: () => fetchUsersByDesignationAndZone('CE_C', zoneId),
    staleTime: 5 * 60_000,
    enabled: open,
  });
  const assignmentsQuery = useQuery({
    queryKey: ['assignments', projectId], queryFn: () => fetchProjectAssignments(projectId),
    staleTime: 0, enabled: open,
  });
  const mutation = useMutation({
    mutationFn: ({ ceUserIds: ids, primaryCeUserId }: { ceUserIds: string[]; primaryCeUserId?: string }) =>
      allocateProject(projectId, ids, primaryCeUserId),
    onSuccess: () => { form.resetFields(); onSuccess(); onClose(); },
  });
  const options = cecQuery.data?.map((u: UserSummary) => ({ value: u.id, label: u.name })) ?? [];

  // Pre-populate with whoever's already assigned, so re-opening this modal lets
  // the CAO/C remove someone (deselect) rather than only ever adding people.
  useEffect(() => {
    if (!open || !assignmentsQuery.data) return;
    const active = assignmentsQuery.data.filter((a) => a.isActive);
    const currentCes = active.filter((a) => a.assignmentRole === 'CE_C').map((a) => a.userId);
    const currentPrimary = active.find((a) => a.assignmentRole === 'PRIMARY_CE_C')?.userId;
    if (currentCes.length > 0) {
      form.setFieldsValue({ ceUserIds: currentCes, primaryCeUserId: currentPrimary ?? currentCes[0] });
    }
  }, [open, assignmentsQuery.data, form]);

  return (
    <Modal
      title={<Space><UserAddOutlined />Assign CE/C(s)</Space>}
      open={open}
      onOk={() => form.validateFields().then((v) => mutation.mutate(v))}
      onCancel={() => { if (!mutation.isPending) { form.resetFields(); onClose(); } }}
      okText="Assign"
      confirmLoading={mutation.isPending}
      destroyOnClose
    >
      <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
        Select one or more Chief Engineers (Construction) to oversee this project, and nominate one as primary.
      </Text>
      {mutation.isError && (
        <Alert type="error" message="Assignment failed"
          description={mutation.error instanceof Error ? mutation.error.message : undefined}
          style={{ marginBottom: 12 }} showIcon />
      )}
      <Form form={form} layout="vertical">
        <Form.Item name="ceUserIds" label="CE/C(s)"
          rules={[{ required: true, message: 'Select at least one CE/C' }]}>
          <Select mode="multiple" showSearch optionFilterProp="label" loading={cecQuery.isLoading}
            placeholder="Select CE/C(s)…" options={options}
            onChange={(v: string[]) => { if (!v.includes(form.getFieldValue('primaryCeUserId'))) form.setFieldValue('primaryCeUserId', v[0]); }} />
        </Form.Item>
        <Form.Item name="primaryCeUserId" label="Primary CE/C"
          tooltip="The primary CE/C is the main point of contact for this project.">
          <Select placeholder="Select primary…" disabled={ceUserIds.length === 0}
            options={options.filter((o) => ceUserIds.includes(o.value))} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

function PrimaryCeModal({
  projectId, open, onClose, onSuccess,
}: { projectId: string; open: boolean; onClose: () => void; onSuccess: () => void }) {
  const [form] = Form.useForm<{ primaryCeUserId: string }>();
  const assignmentsQuery = useQuery({
    queryKey: ['assignments', projectId], queryFn: () => fetchProjectAssignments(projectId),
    staleTime: 30_000, enabled: open,
  });
  const usersQuery = useQuery({ queryKey: ['users'], queryFn: fetchUsers, staleTime: 5 * 60_000, enabled: open });
  const assignedCes = (assignmentsQuery.data ?? []).filter((a) => a.isActive && a.assignmentRole === 'CE_C');
  const userName = (id: string) => usersQuery.data?.find((u) => u.id === id)?.name ?? id.slice(0, 8);
  const isLoading = assignmentsQuery.isLoading || usersQuery.isLoading;
  const mutation = useMutation({
    mutationFn: ({ primaryCeUserId }: { primaryCeUserId: string }) => designatePrimaryCe(projectId, primaryCeUserId),
    onSuccess: () => { form.resetFields(); onSuccess(); onClose(); },
  });
  return (
    <Modal
      title={<Space><StarOutlined />Designate Primary CE/C</Space>}
      open={open}
      onOk={() => form.validateFields().then((v) => mutation.mutate(v))}
      onCancel={() => { if (!mutation.isPending) { form.resetFields(); onClose(); } }}
      okText="Designate"
      confirmLoading={mutation.isPending}
      destroyOnClose
    >
      {mutation.isError && (
        <Alert type="error" message="Designation failed"
          description={mutation.error instanceof Error ? mutation.error.message : undefined}
          style={{ marginBottom: 12 }} showIcon />
      )}
      {assignedCes.length === 0 && !isLoading && (
        <Alert type="warning" message="No CE/C assigned to this project yet." style={{ marginBottom: 12 }} showIcon />
      )}
      <Form form={form} layout="vertical">
        <Form.Item name="primaryCeUserId" label="Primary CE/C"
          rules={[{ required: true, message: 'Please select a CE/C' }]}>
          <Select showSearch optionFilterProp="label" loading={isLoading} disabled={assignedCes.length === 0}
            placeholder="Select CE/C…"
            options={assignedCes.map((a) => ({ value: a.userId, label: userName(a.userId) }))} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

function AssignDyceModal({
  projectId, zoneId, open, onClose, onSuccess,
}: { projectId: string; zoneId: string; open: boolean; onClose: () => void; onSuccess: () => void }) {
  const [form] = Form.useForm<{ dyceUserIds: string[]; nodalUserId?: string }>();
  const dyceUserIds = Form.useWatch('dyceUserIds', form) ?? [];
  const dyceQuery = useQuery({
    queryKey: ['users', 'DY_CE_C', zoneId],
    queryFn: () => fetchUsersByDesignationAndZone('DY_CE_C', zoneId),
    staleTime: 5 * 60_000,
    enabled: open,
  });
  const assignmentsQuery = useQuery({
    queryKey: ['assignments', projectId], queryFn: () => fetchProjectAssignments(projectId),
    staleTime: 0, enabled: open,
  });
  const mutation = useMutation({
    mutationFn: async ({ dyceUserIds: ids, nodalUserId }: { dyceUserIds: string[]; nodalUserId?: string }) => {
      await assignDyceUsers(projectId, ids);
      if (nodalUserId) await designateNodalUser(projectId, nodalUserId);
    },
    onSuccess: () => { form.resetFields(); onSuccess(); onClose(); },
  });
  const options = dyceQuery.data?.map((u: UserSummary) => ({ value: u.id, label: u.name })) ?? [];

  // Pre-populate with whoever's already assigned, so re-opening this modal lets
  // the CE/C remove someone or change the nodal, rather than only ever adding.
  useEffect(() => {
    if (!open || !assignmentsQuery.data) return;
    const active = assignmentsQuery.data.filter((a) => a.isActive);
    const currentDyces = active.filter((a) => a.assignmentRole === 'DY_CE_C').map((a) => a.userId);
    const currentNodal = active.find((a) => a.assignmentRole === 'NODAL_DY_CE_C')?.userId;
    if (currentDyces.length > 0) {
      form.setFieldsValue({ dyceUserIds: currentDyces, nodalUserId: currentNodal ?? currentDyces[0] });
    }
  }, [open, assignmentsQuery.data, form]);

  return (
    <Modal
      title={<Space><UsergroupAddOutlined />Assign Dy CE/C(s)</Space>}
      open={open}
      onOk={() => form.validateFields().then((v) => mutation.mutate(v))}
      onCancel={() => { if (!mutation.isPending) { form.resetFields(); onClose(); } }}
      okText="Assign"
      confirmLoading={mutation.isPending}
      destroyOnClose
    >
      <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
        Select one or more Dy CE/Cs for this project, and nominate one as Nodal (the Nodal Dy CE/C can verify record
        details — only Verify, not Authenticate). The project becomes Active once assigned.
      </Text>
      {mutation.isError && (
        <Alert type="error" message="Assignment failed"
          description={mutation.error instanceof Error ? mutation.error.message : undefined}
          style={{ marginBottom: 12 }} showIcon />
      )}
      <Form form={form} layout="vertical">
        <Form.Item name="dyceUserIds" label="Dy CE/C(s)"
          rules={[{ required: true, message: 'Select at least one Dy CE/C' }]}>
          <Select mode="multiple" showSearch optionFilterProp="label" loading={dyceQuery.isLoading}
            placeholder="Select Dy CE/C(s)…" options={options}
            onChange={(v: string[]) => { if (!v.includes(form.getFieldValue('nodalUserId'))) form.setFieldValue('nodalUserId', v[0]); }} />
        </Form.Item>
        <Form.Item name="nodalUserId" label="Nodal Dy CE/C"
          tooltip="The Nodal Dy CE/C can verify record details for this project.">
          <Select placeholder="Select nodal…" disabled={dyceUserIds.length === 0}
            options={options.filter((o) => dyceUserIds.includes(o.value))} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

// ── Overview & History views ───────────────────────────────────────────────────

/**
 * One row per person — CAO first, then CEs (primary first), then Dy CE/Cs (nodal
 * first). A user who holds both a base role (CE_C/DY_CE_C) and its "designated"
 * counterpart (PRIMARY_CE_C/NODAL_DY_CE_C) gets ONE row combining both labels,
 * instead of two separate rows for the same name.
 */
function orderedOfficerRows(assignments: ProjectAssignmentItem[]): { userId: string; label: string; rank: number }[] {
  const active = assignments.filter((a) => a.isActive);
  const byUser = new Map<string, Set<string>>();
  for (const a of active) {
    if (!byUser.has(a.userId)) byUser.set(a.userId, new Set());
    byUser.get(a.userId)!.add(a.assignmentRole);
  }
  const RANK: Record<string, number> = { CAO_C: 0, PRIMARY_CE_C: 1, CE_C: 1, NODAL_DY_CE_C: 2, DY_CE_C: 2 };
  const rows = [...byUser.entries()].map(([userId, roles]) => {
    let label: string;
    let rank: number;
    if (roles.has('CAO_C')) { label = ASSIGNMENT_ROLE_LABEL.CAO_C; rank = 0; }
    else if (roles.has('PRIMARY_CE_C')) { label = ASSIGNMENT_ROLE_LABEL.PRIMARY_CE_C; rank = 1; }
    else if (roles.has('CE_C')) { label = ASSIGNMENT_ROLE_LABEL.CE_C; rank = 1.5; }
    else if (roles.has('NODAL_DY_CE_C')) { label = ASSIGNMENT_ROLE_LABEL.NODAL_DY_CE_C; rank = 2; }
    else { label = ASSIGNMENT_ROLE_LABEL.DY_CE_C; rank = 2.5; }
    return { userId, label, rank: RANK[label] ?? rank };
  });
  return rows.sort((a, b) => a.rank - b.rank);
}

function OverviewView({ projectId, zoneId, project, autoOpenAssign, onAutoOpenAssignConsumed }: {
  projectId: string; zoneId: string;
  project: { name: string; projectCode: string | null; projectType: string | null; lengthKm: number | null; stationsFrom: string | null; stationsTo: string | null; stationsInBetween: string | null; ipaDate: string | null; targetCompletionYear: number | null; lifecycleState: string };
  /** #19/#20 — open the Assign CE/C or Assign Dy CE/C modal immediately on mount. */
  autoOpenAssign?: 'ce' | 'dy' | null;
  onAutoOpenAssignConsumed?: () => void;
}) {
  const queryClient = useQueryClient();
  const currentUser = useAuthStore((s) => s.currentUser);
  const [modal, setModal] = useState<AssignModalKind>(null);

  // #19/#20 — auto-open the assign-officer modal once, when arriving from the
  // project-list "Assign" action or the project-bar "Assign officers" button.
  useEffect(() => {
    if (!autoOpenAssign) return;
    setModal(autoOpenAssign === 'ce' ? 'allocate' : 'assignDyce');
    onAutoOpenAssignConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpenAssign]);

  // ── Edit Details (#8) — Length + Stations (From/To/In Between), CE/C and Dy CE/C only ──
  const canEditDetails = currentUser?.permissions.includes('PROJECT.UPDATE.OWN') ?? false;
  const [editingDetails, setEditingDetails] = useState(false);
  const [edLengthKm, setEdLengthKm] = useState<number | null>(project.lengthKm);
  const [edStationsFrom, setEdStationsFrom] = useState(project.stationsFrom ?? '');
  const [edStationsTo, setEdStationsTo] = useState(project.stationsTo ?? '');
  const [edStationsInBetween, setEdStationsInBetween] = useState(project.stationsInBetween ?? '');
  const startEditingDetails = () => {
    setEdLengthKm(project.lengthKm);
    setEdStationsFrom(project.stationsFrom ?? '');
    setEdStationsTo(project.stationsTo ?? '');
    setEdStationsInBetween(project.stationsInBetween ?? '');
    setEditingDetails(true);
  };
  const detailsMutation = useMutation({
    mutationFn: () => updateProjectDetails(projectId, {
      lengthKm: edLengthKm ?? undefined,
      stationsFrom: edStationsFrom.trim() || undefined,
      stationsTo: edStationsTo.trim() || undefined,
      stationsInBetween: edStationsInBetween.trim() || undefined,
    }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['projects'] });
      setEditingDetails(false);
    },
  });
  const assignmentsQuery = useQuery({ queryKey: ['assignments', projectId], queryFn: () => fetchProjectAssignments(projectId) });
  const usersQuery = useQuery({ queryKey: ['users'], queryFn: fetchUsers, staleTime: 5 * 60_000 });
  const zonesQuery = useQuery({ queryKey: ['zones'], queryFn: fetchZones, staleTime: 10 * 60_000 });
  const zoneShort = zonesQuery.data?.find((z) => z.id === zoneId)?.shortName ?? '—';
  const activitiesQuery = useQuery({ queryKey: ['activities', projectId], queryFn: () => fetchActivities(projectId) });
  const activities = activitiesQuery.data ?? [];
  const recordCountQueries = useQueries({
    queries: activities.map((a) => ({ queryKey: ['records', a.id], queryFn: () => listRecords(a.id), staleTime: 30_000 })),
  });
  const badge = LIFECYCLE_BADGE[project.lifecycleState] ?? { color: 'default', label: project.lifecycleState };

  const canAllocate = currentUser?.permissions.includes('PROJECT.ALLOCATE') ?? false;
  const canAssignDyce = currentUser?.permissions.includes('PROJECT.ASSIGN_DYCE') ?? false;

  const userName = (id: string) => usersQuery.data?.find((u) => u.id === id)?.name ?? id.slice(0, 8);
  const refresh = () => { void queryClient.invalidateQueries({ queryKey: ['assignments', projectId] }); void queryClient.invalidateQueries({ queryKey: ['projects'] }); };

  // ── Stats + per-activity progress (records authenticated / total) ───────────
  // One card per activity INSTANCE, not per type — a project can have more than one
  // activity of the same type (e.g. two Land Acquisition activities), so the activity's
  // own name is shown alongside the type label to tell them apart.
  const activityProgress = activities.map((a, i) => {
    const records = recordCountQueries[i]?.data ?? [];
    const draft = records.filter((r) => stateBucket(r.recordState) === 'draft').length;
    const verified = records.filter((r) => stateBucket(r.recordState) === 'verified').length;
    const authenticated = records.filter((r) => stateBucket(r.recordState) === 'authenticated').length;
    return {
      id: a.id,
      name: a.name,
      typeLabel: ACTIVITY_TYPE_LABEL[a.activityTypeCode] ?? a.activityTypeCode.replace(/_/g, ' '),
      accentColor: ACTIVITY_TYPE_ACCENT[a.activityTypeCode] ?? '#1677ff',
      draft, verified, authenticated, total: records.length,
    };
  });
  const officerRows = orderedOfficerRows(assignmentsQuery.data ?? []);

  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Row 1 — activity progress: one compact card per activity instance (not
          per type), all fit on a single row — each card lists its 4 record
          counts vertically (Draft, In verification, Authenticated, Total). */}
      <div style={{ background: 'var(--ant-color-bg-container)', border: '1px solid var(--ant-color-border)', borderRadius: 10, padding: '16px 18px' }}>
        <h4 style={{ margin: '0 0 12px' }}>Activity progress</h4>
        {activityProgress.length === 0 ? (
          <Text type="secondary" style={{ fontSize: 13 }}>No activities yet.</Text>
        ) : (
          <div style={{ display: 'flex', gap: 12 }}>
            {activityProgress.map((ap) => (
              <div key={ap.id} style={{ flex: '1 1 0', minWidth: 0, border: '1px solid var(--ant-color-border)', borderLeft: `4px solid ${ap.accentColor}`, borderRadius: 8, padding: '10px 12px' }}>
                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: ap.accentColor }}>{ap.typeLabel}</div>
                  {ap.name && ap.name !== ap.typeLabel && (
                    <Text type="secondary" style={{ fontSize: 11 }}>{ap.name}</Text>
                  )}
                </div>
                {ap.total === 0 ? (
                  <Text type="secondary" style={{ fontSize: 12 }}>No records yet.</Text>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Text type="secondary" style={{ fontSize: 11 }}>Draft</Text>
                      <span style={{ fontSize: 14, fontWeight: 700 }}>{ap.draft}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Text type="secondary" style={{ fontSize: 11 }}>In verification</Text>
                      <span style={{ fontSize: 14, fontWeight: 700, color: '#1677ff' }}>{ap.verified}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Text type="secondary" style={{ fontSize: 11 }}>Authenticated</Text>
                      <span style={{ fontSize: 14, fontWeight: 700, color: '#52c41a' }}>{ap.authenticated}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Text type="secondary" style={{ fontSize: 11 }}>Total</Text>
                      <span style={{ fontSize: 14, fontWeight: 700 }}>{ap.total}</span>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Row 2 — project details (wider) + designated officers (narrower), side by side */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.8fr 1fr', gap: 16, alignItems: 'start' }}>
      <div style={{ background: 'var(--ant-color-bg-container)', border: '1px solid var(--ant-color-border)', borderRadius: 10, padding: '16px 18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
          <h4 style={{ margin: 0, flex: 1 }}>Project details</h4>
          {canEditDetails && !editingDetails && (
            <Button
              size="small"
              icon={<EditOutlined />}
              style={{ background: '#d9f7be', borderColor: '#b7eb8f', color: 'rgba(0,0,0,0.85)' }}
              onClick={startEditingDetails}
            >
              Edit Details
            </Button>
          )}
        </div>
        {editingDetails ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <div style={{ flex: '0 1 220px' }}>
                <Field label="Length (km)">
                  <InputNumber style={{ width: '100%' }} min={0} step={0.1} value={edLengthKm}
                    onChange={(v) => setEdLengthKm(v)} placeholder="e.g. 42.5" />
                </Field>
              </div>
              <div style={{ flex: '1 1 200px' }}>
                <Field label="Stations From">
                  <Input value={edStationsFrom} onChange={(e) => setEdStationsFrom(e.target.value)} placeholder="e.g. Daund" />
                </Field>
              </div>
              <div style={{ flex: '1 1 200px' }}>
                <Field label="Stations To">
                  <Input value={edStationsTo} onChange={(e) => setEdStationsTo(e.target.value)} placeholder="e.g. Solapur" />
                </Field>
              </div>
            </div>
            <div>
              <Field label="Stations In Between">
                <Input.TextArea rows={1} autoSize={{ minRows: 1, maxRows: 3 }} value={edStationsInBetween}
                  onChange={(e) => setEdStationsInBetween(e.target.value)}
                  placeholder="e.g. Baramati, Indapur (comma-separated)" />
              </Field>
            </div>
            {detailsMutation.isError && (
              <Alert type="error" showIcon message={detailsMutation.error instanceof Error ? detailsMutation.error.message : 'Failed to save'} />
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <Button onClick={() => setEditingDetails(false)}>Cancel</Button>
              <Button type="primary" loading={detailsMutation.isPending} onClick={() => detailsMutation.mutate()}>Save</Button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px 20px' }}>
            <Detail label="Zone" value={zoneShort} />
            <Detail label="Project ID" value={project.projectCode ?? '—'} />
            <Detail label="PH" value={project.projectType ? (PLAN_HEAD_BY_PROJECT_TYPE[project.projectType] ? `PH-${PLAN_HEAD_BY_PROJECT_TYPE[project.projectType]} : ${project.projectType.replace(/_/g, ' ')}` : project.projectType.replace(/_/g, ' ')) : '—'} />
            <Detail label="Length" value={project.lengthKm != null ? `${project.lengthKm} km` : '—'} />
            <Detail label="IPA date" value={project.ipaDate ? dayjs(project.ipaDate).format('D MMM YYYY') : '—'} />
            <Detail label="Status" value={badge.label} />
            <Detail label="Stations From" value={project.stationsFrom?.trim() || '—'} />
            <Detail label="Stations To" value={project.stationsTo?.trim() || '—'} />
            <div style={{ gridColumn: '1 / -1' }}>
              <Detail label="Stations In Between" value={project.stationsInBetween?.trim() || '—'} />
            </div>
          </div>
        )}
      </div>

      {/* Designated officers — narrower column beside Project details */}
      <div style={{ background: 'var(--ant-color-bg-container)', border: '1px solid var(--ant-color-border)', borderRadius: 10, padding: '16px 18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
          <h4 style={{ margin: 0, flex: 1 }}>Designated officers</h4>
          <Space wrap>
            {/* The Assign CE/C(s) modal also captures the Primary CE/C, so a
                separate "Primary CE/C" button is redundant and was removed. */}
            {canAllocate && <Button type="primary" size="small" style={{ background: '#1565c0', borderColor: '#1565c0' }} icon={<UserAddOutlined />} onClick={() => setModal('allocate')}>Assign CE/C(s)</Button>}
            {canAssignDyce && <Button type="primary" size="small" style={{ background: '#1565c0', borderColor: '#1565c0' }} icon={<UsergroupAddOutlined />} onClick={() => setModal('assignDyce')}>Assign Dy CE/C(s)</Button>}
          </Space>
        </div>
        {assignmentsQuery.isLoading ? <Spin /> : officerRows.length === 0 ? (
          <Text type="secondary" style={{ fontSize: 13 }}>No officers assigned yet.</Text>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr>
              <th style={{ textAlign: 'left', padding: '4px 8px', fontSize: 11, textTransform: 'uppercase', color: 'var(--ant-color-text-secondary)' }}>Role</th>
              <th style={{ textAlign: 'left', padding: '4px 8px', fontSize: 11, textTransform: 'uppercase', color: 'var(--ant-color-text-secondary)' }}>Officer</th>
            </tr></thead>
            <tbody>
              {officerRows.map((row) => (
                <tr key={row.userId}>
                  <td style={{ padding: '7px 8px', borderBottom: '1px solid var(--ant-color-border)', color: 'var(--ant-color-text-secondary)' }}>
                    {row.label}
                  </td>
                  <td style={{ padding: '7px 8px', borderBottom: '1px solid var(--ant-color-border)', fontWeight: 600 }}>{userName(row.userId)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      </div>

      <AllocateModal projectId={projectId} zoneId={zoneId} open={modal === 'allocate'} onClose={() => setModal(null)} onSuccess={refresh} />
      <PrimaryCeModal projectId={projectId} open={modal === 'primaryCe'} onClose={() => setModal(null)} onSuccess={refresh} />
      <AssignDyceModal projectId={projectId} zoneId={zoneId} open={modal === 'assignDyce'} onClose={() => setModal(null)} onSuccess={refresh} />
    </div>
  );
}
function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--ant-color-text-secondary)' }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 600, marginTop: 2 }}>{value}</div>
    </div>
  );
}

function HistoryView({ projectId }: { projectId: string }) {
  const th: React.CSSProperties = { textAlign: 'left', padding: '10px 14px', borderBottom: '1px solid var(--ant-color-border)', borderRight: '1px solid var(--ant-color-border)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.03em', color: 'var(--ant-color-text-secondary)', background: 'var(--ant-color-bg-layout)' };
  const td: React.CSSProperties = { padding: '8px 14px', borderBottom: '1px solid var(--ant-color-border)', borderRight: '1px solid var(--ant-color-border)', fontSize: 12 };
  const historyQuery = useQuery({ queryKey: ['project-history', projectId], queryFn: () => fetchProjectHistory(projectId) });

  return (
    <div style={{ padding: 20 }}>
      {historyQuery.isError && (
        <Alert type="error" showIcon style={{ marginBottom: 12 }} message="Failed to load history" />
      )}
      <div style={{ background: 'var(--ant-color-bg-container)', border: '1px solid var(--ant-color-border)', borderRadius: 10, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead><tr>
            <th style={th}>Date &amp; Time</th><th style={th}>Officer</th>
            <th style={th}>Entity</th><th style={{ ...th, borderRight: 'none' }}>Action</th>
          </tr></thead>
          <tbody>
            {historyQuery.isLoading ? (
              <tr><td colSpan={4} style={{ ...td, borderRight: 'none', textAlign: 'center' }}><Spin size="small" /></td></tr>
            ) : (historyQuery.data ?? []).length === 0 ? (
              <tr><td colSpan={4} style={{ ...td, borderRight: 'none', textAlign: 'center', color: 'var(--ant-color-text-tertiary)' }}>No history yet.</td></tr>
            ) : (
              historyQuery.data!.map((h, i) => (
                <tr key={i}>
                  <td style={td}>{dayjs(h.at).format('D MMM YYYY, HH:mm')}</td>
                  <td style={td}>{h.actorName ?? '—'}</td>
                  <td style={td}>{HISTORY_ENTITY_LABEL[h.entityType] ?? h.entityType.replace(/_/g, ' ')}</td>
                  <td style={{ ...td, borderRight: 'none' }}>
                    {describeHistoryAction(h.action)}
                    {h.details && (
                      <div style={{ fontSize: 11, color: 'var(--ant-color-text-tertiary)', marginTop: 2 }}>{h.details}</div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

type NavView = 'overview' | 'records' | 'history' | 'map';

export default function ProjectWorkspace() {
  const navigate = useNavigate();
  const location = useLocation();
  const { projectCode = '' } = useParams();
  const currentUser = useAuthStore((s) => s.currentUser);

  // When navigated from the inbox: { activityTypeCode, recordId } to auto-open.
  const autoOpen = useRef<{ activityTypeCode: string; recordId: string } | null>(
    (location.state as { openRecord?: { activityTypeCode: string; recordId: string } } | null)?.openRecord ?? null,
  ).current;

  // View + active activity tab are persisted in the URL (?view=&type=) so a page refresh
  // restores where the user was instead of resetting to Records → Land Acquisition (#6).
  const [searchParams, setSearchParams] = useSearchParams();
  const urlView = searchParams.get('view');
  const urlType = searchParams.get('type');
  const urlAssign = searchParams.get('assign');
  const validView = (['overview', 'records', 'history', 'map'] as NavView[]).includes(urlView as NavView);
  const validUrlAssign = urlAssign === 'ce' || urlAssign === 'dy' ? urlAssign : null;

  const [view, setView] = useState<NavView>(
    autoOpen ? 'records' : validUrlAssign ? 'overview' : validView ? (urlView as NavView) : 'records',
  );
  const [activeType, setActiveType] = useState<string>(
    autoOpen?.activityTypeCode ??
      (urlType && ACTIVITY_TYPE_ORDER.includes(urlType) ? urlType : ACTIVITY_TYPE_ORDER[0]),
  );
  // One-shot: cleared on the first manual tab switch so revisiting a tab doesn't reopen.
  const [autoOpenId, setAutoOpenId] = useState<string | null>(autoOpen?.recordId ?? null);
  // #19/#20 — auto-open the Assign CE/C or Assign Dy CE/C modal once: either seeded from
  // the URL (the project-list row action navigates here with ?assign=ce|dy) or set directly
  // by the "Assign officers" button below (same tab, no navigation).
  const [autoOpenAssign, setAutoOpenAssign] = useState<'ce' | 'dy' | null>(validUrlAssign);
  const clearAutoOpenAssign = () => {
    setAutoOpenAssign(null);
    setSearchParams((prev) => { const p = new URLSearchParams(prev); p.delete('assign'); return p; }, { replace: true });
  };

  // Mirror the current view + tab back into the URL (replace, no history spam).
  useEffect(() => {
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        p.set('view', view);
        p.set('type', activeType);
        return p;
      },
      { replace: true },
    );
  }, [view, activeType, setSearchParams]);

  const projectsQuery = useQuery({ queryKey: ['projects'], queryFn: fetchProjects, enabled: currentUser !== null });
  const project = projectsQuery.data?.find((p) => p.projectCode === projectCode || p.id === projectCode);

  const activitiesQuery = useQuery({
    queryKey: ['activities', project?.id],
    queryFn: () => fetchActivities(project!.id),
    enabled: !!project,
  });
  const activities = activitiesQuery.data ?? [];
  // First activity of each type (the tabs are the six fixed types).
  const activityByType = useMemo(() => {
    const m: Record<string, ActivityDetailResponse | undefined> = {};
    for (const a of activities) if (!m[a.activityTypeCode]) m[a.activityTypeCode] = a;
    return m;
  }, [activities]);
  const activeActivity = activityByType[activeType] ?? null;

  // Record counts per type for the tab badges (shares the ['records', id] cache).
  const countQueries = useQueries({
    queries: activities.map((a) => ({
      queryKey: ['records', a.id],
      queryFn: () => listRecords(a.id),
      staleTime: 30_000,
    })),
  });
  const countByActivityId: Record<string, number | undefined> = {};
  activities.forEach((a, i) => { countByActivityId[a.id] = countQueries[i]?.data?.length; });

  const canEdit = currentUser?.permissions.includes('ACTIVITY_RECORD.UPDATE.OWN') ?? false;
  // Assignment: CAO (PROJECT.ALLOCATE → assign CE) / CE (PROJECT.ASSIGN_DYCE → assign Dy).
  const canAllocateProject = currentUser?.permissions.includes('PROJECT.ALLOCATE') ?? false;
  const canAssignDyceProject = currentUser?.permissions.includes('PROJECT.ASSIGN_DYCE') ?? false;
  const canAssign = canAllocateProject || canAssignDyceProject;
  // Which modal "Assign officers" should open: match the project's current lifecycle state
  // first (AWAITING_CAO_ALLOCATION → assign CE, AWAITING_CEC_ASSIGNMENT → assign Dy); fall
  // back to whichever action the user actually holds permission for.
  const assignOfficersKind: 'ce' | 'dy' | null =
    project?.lifecycleState === 'AWAITING_CAO_ALLOCATION' && canAllocateProject ? 'ce'
    : project?.lifecycleState === 'AWAITING_CEC_ASSIGNMENT' && canAssignDyceProject ? 'dy'
    : canAllocateProject ? 'ce'
    : canAssignDyceProject ? 'dy'
    : null;

  const badge = project ? (LIFECYCLE_BADGE[project.lifecycleState] ?? { color: 'default', label: project.lifecycleState }) : null;

  const NAV: { key: NavView | 'map'; label: string; icon: string }[] = [
    { key: 'overview', label: 'Overview', icon: '▤' },
    { key: 'records', label: 'Records', icon: '📋' },
    { key: 'history', label: 'History', icon: '🕘' },
    { key: 'map', label: 'Map', icon: '🗺️' },
  ];

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header style={{ padding: 0, height: 56, lineHeight: '56px' }}><TopBar /></Header>

      {/* Project bar */}
      <div style={{ height: 48, display: 'flex', alignItems: 'center', background: 'var(--ant-color-bg-container)', borderBottom: `2px solid ${LINE_STRONG}`, boxShadow: '0 2px 4px rgba(15,23,42,.06)', flexShrink: 0 }}>
        <button onClick={() => navigate('/projects')}
          style={{ width: SIDE_W, height: '100%', flexShrink: 0, border: 'none', borderRight: '1px solid var(--ant-color-border)', background: '#f4f7fb', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: 'var(--ant-color-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <ArrowLeftOutlined /> Back to Project list
        </button>
        <Text strong style={{ fontSize: 16, marginLeft: 16 }}>{project?.name ?? projectCode}</Text>
        {project && (
          <Text type="secondary" style={{ fontSize: 12 }}>
            &nbsp;·&nbsp;{project.projectType ?? ''}{project.lengthKm != null ? ` · ${project.lengthKm} km` : ''}
          </Text>
        )}
        <div style={{ flex: 1 }} />
        {canAssign && (
          <Button
            type="primary"
            size="small"
            style={{ marginRight: 12, background: '#1565c0', borderColor: '#1565c0' }}
            onClick={() => { setView('overview'); if (assignOfficersKind) setAutoOpenAssign(assignOfficersKind); }}
          >
            Assign officers
          </Button>
        )}
        {badge && <Tag color={badge.color} style={{ marginRight: 16, fontSize: 13, padding: '2px 14px', borderRadius: 20, fontWeight: 600 }}>{badge.label}</Tag>}
      </div>

      <Layout style={{ height: 'calc(100vh - 106px)', overflow: 'hidden' }}>
        <Sider width={SIDE_W} style={{ background: SIDE }}>
          <div style={{ padding: '10px 0' }}>
            {NAV.map((n) => {
              const active = view === n.key;
              return (
                <div key={n.key}
                  onClick={() => setView(n.key as NavView)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '11px 16px', fontSize: 13, cursor: 'pointer',
                    color: active ? '#fff' : 'rgba(255,255,255,.85)', fontWeight: active ? 600 : 400,
                    background: active ? SIDE_SEL : 'transparent', borderLeft: active ? '3px solid #fff' : '3px solid transparent',
                  }}>
                  <span style={{ width: 16, textAlign: 'center' }}>{n.icon}</span>{n.label}
                </div>
              );
            })}
          </div>
        </Sider>

        <Content style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column', background: 'var(--ant-color-bg-layout)' }}>
          {projectsQuery.isLoading ? (
            <Spin style={{ display: 'block', margin: '48px auto' }} />
          ) : !project ? (
            <Alert style={{ margin: 24 }} type="error" showIcon message="Project not found" />
          ) : view === 'overview' ? (
            <div style={{ flex: 1, overflowY: 'auto' }}>
              <OverviewView projectId={project.id} zoneId={project.zoneId} project={project}
                autoOpenAssign={autoOpenAssign} onAutoOpenAssignConsumed={clearAutoOpenAssign} />
            </div>
          ) : view === 'history' ? (
            <div style={{ flex: 1, overflowY: 'auto' }}><HistoryView projectId={project.id} /></div>
          ) : view === 'map' ? (
            <div style={{ flex: 1, minHeight: 0 }}>
              <Suspense fallback={<Spin style={{ display: 'block', margin: '48px auto' }} />}>
                <MapView projectId={project.id} />
              </Suspense>
            </div>
          ) : (
            <>
              {/* activity tab bar — the six fixed activity types */}
              <div style={{ display: 'flex', alignItems: 'center', height: 46, background: TABBAR_BG, borderBottom: `3px solid ${LINE_STRONG}`, padding: '0 12px', flexShrink: 0, overflowX: 'auto', overflowY: 'hidden', boxShadow: '0 2px 4px rgba(15,23,42,.05)' }}>
                {ACTIVITY_TYPE_ORDER.map((type, idx) => {
                  const active = type === activeType;
                  const act = activityByType[type];
                  const count = act ? (countByActivityId[act.id] ?? 0) : 0;
                  return (
                    <div key={type} onClick={() => { setActiveType(type); setAutoOpenId(null); }}
                      style={{
                        padding: '11px 15px', fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap',
                        display: 'flex', alignItems: 'center', gap: 7,
                        color: active ? 'var(--ant-color-primary)' : 'var(--ant-color-text-secondary)',
                        fontWeight: active ? 600 : 400, background: active ? '#fff' : 'transparent',
                        borderBottom: active ? '4px solid var(--ant-color-primary)' : '4px solid transparent', marginBottom: -3,
                        borderLeft: idx > 0 ? '1px solid var(--ant-color-border)' : 'none',
                      }}>
                      <span>{ACTIVITY_TYPE_ICON[type] ?? '•'}</span>
                      {ACTIVITY_TYPE_LABEL[type] ?? type.replace(/_/g, ' ')}
                      <span style={{ background: active ? '#c7dbff' : '#dbe6fb', color: 'var(--ant-color-primary)', borderRadius: 10, fontSize: 11, padding: '0 7px' }}>
                        {count}
                      </span>
                    </div>
                  );
                })}
              </div>

              <div style={{ flex: 1, minHeight: 0 }}>
                {activitiesQuery.isLoading ? (
                  <Spin style={{ display: 'block', margin: '48px auto' }} />
                ) : (
                  <ActivityPane
                    key={activeType}
                    activityType={activeType}
                    activity={activeActivity}
                    projectId={project.id}
                    canEdit={canEdit}
                    initialRecordId={autoOpen && activeType === autoOpen.activityTypeCode ? (autoOpenId ?? undefined) : undefined}
                  />
                )}
              </div>
            </>
          )}
        </Content>
      </Layout>
    </Layout>
  );
}
