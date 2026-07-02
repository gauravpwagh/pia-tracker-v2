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

import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Layout, Button, Input, Select, Spin, Empty, Alert, Tag, Typography, DatePicker, Modal, Form, Space } from 'antd';
import { PlusOutlined, ArrowLeftOutlined, EditOutlined, CloseOutlined, UserAddOutlined, UsergroupAddOutlined, StarOutlined } from '@ant-design/icons';
import { useQuery, useQueries, useMutation, useQueryClient } from '@tanstack/react-query';
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
type StatusFilter = 'all' | 'draft' | 'submitted' | 'auth';
function stateBucket(s: string): Exclude<StatusFilter, 'all'> {
  if (s === 'DRAFT') return 'draft';
  if (s === 'AUTHENTICATED') return 'auth';
  return 'submitted';
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

type DetailMode = { kind: 'empty' } | { kind: 'record'; id: string } | { kind: 'add' } | { kind: 'scope' };

function ActivityPane({ activity, activityType, projectId, canEdit }: {
  activity: ActivityDetailResponse | null;
  activityType: string;
  projectId: string;
  canEdit: boolean;
}) {
  const queryClient = useQueryClient();
  const activityId = activity?.id;
  const typeCode = activityType;
  const isUs = typeCode === 'UTILITY_SHIFTING';
  const isDrawing = typeCode === 'DRAWING_APPROVAL';
  const needsSubtype = isUs || isDrawing;

  const [mode, setMode] = useState<DetailMode>({ kind: 'empty' });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingReadOnly, setEditingReadOnly] = useState(false);
  const [search, setSearch] = useState('');
  const [statusF, setStatusF] = useState<StatusFilter>('all');
  // add-record inline form
  const [newName, setNewName] = useState('');
  const [newSubtype, setNewSubtype] = useState<string | undefined>(undefined);
  // scope editor
  const [scName, setScName] = useState(activity?.name ?? '');
  const [scNotes, setScNotes] = useState(activity?.scopeNotes ?? '');
  const [scTarget, setScTarget] = useState<dayjs.Dayjs | null>(activity?.targetCompletionDate ? dayjs(activity.targetCompletionDate) : null);

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
    let draft = 0, submitted = 0, auth = 0;
    for (const r of records) {
      const b = stateBucket(r.recordState);
      if (b === 'draft') draft++; else if (b === 'auth') auth++; else submitted++;
    }
    return { total: records.length, draft, submitted, auth };
  }, [records]);

  const filtered = records.filter((r, i) => {
    if (search && !recordDisplayName(r, i).toLowerCase().includes(search.toLowerCase())) return false;
    if (statusF !== 'all' && stateBucket(r.recordState) !== statusF) return false;
    return true;
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      // Create the activity on demand the first time a record is added for this type.
      let actId = activityId;
      if (!actId) {
        const created = await createActivity(projectId, {
          activityTypeCode: activityType,
          name: ACTIVITY_TYPE_LABEL[activityType] ?? activityType.replace(/_/g, ' '),
        });
        actId = created.id;
      }
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
    mutationFn: () => updateActivity(activityId!, {
      name: scName,
      scopeNotes: scNotes || undefined,
      targetCompletionDate: scTarget ? scTarget.format('YYYY-MM-DD') : undefined,
    }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['activities'] });
      setMode({ kind: 'empty' });
    },
  });

  const canAdd = RECORD_CREATABLE.has(typeCode) && canEdit;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Pane header: Activity name [Scope] | KPIs | Add Record — separator below */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '6px 20px', flexShrink: 0, borderBottom: '1px solid var(--ant-color-border)' }}>
        <h3 style={{ margin: 0, fontSize: 15 }}>{ACTIVITY_TYPE_LABEL[typeCode] ?? typeCode.replace(/_/g, ' ')}</h3>
        {canEdit && activity && (
          <Button size="small" icon={<EditOutlined />}
            onClick={() => { setScName(activity.name ?? ''); setScNotes(activity.scopeNotes ?? ''); setScTarget(activity.targetCompletionDate ? dayjs(activity.targetCompletionDate) : null); setMode({ kind: 'scope' }); }}>
            Scope
          </Button>
        )}
        <div style={{ display: 'flex', gap: 8, flex: 1, justifyContent: 'center' }}>
          <Kpi label="Total" value={kpi.total} color="var(--ant-color-text)" />
          <Kpi label="Draft" value={kpi.draft} color="#6b7280" />
          <Kpi label="Submitted" value={kpi.submitted} color="#1d4ed8" />
          <Kpi label="Authenticated" value={kpi.auth} color="#166534" />
        </div>
        {canAdd && (
          <Button type="primary" icon={<PlusOutlined />}
            style={{ background: '#1565c0', borderColor: '#1565c0' }}
            onClick={() => { setNewName(''); setNewSubtype(undefined); setMode({ kind: 'add' }); }}>
            Add Record
          </Button>
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
              <div style={{ flex: '1 1 260px' }}>
                <Field label="Activity name"><Input value={scName} onChange={(e) => setScName(e.target.value)} /></Field>
              </div>
              <div style={{ flex: '0 1 220px' }}>
                <Field label="Target completion"><DatePicker style={{ width: '100%' }} value={scTarget} onChange={setScTarget} /></Field>
              </div>
              <div style={{ flex: '2 1 360px' }}>
                <Field label="Scope notes"><Input.TextArea rows={1} autoSize={{ minRows: 1, maxRows: 3 }} value={scNotes} onChange={(e) => setScNotes(e.target.value)} /></Field>
              </div>
            </div>
            {scopeMutation.isError && (
              <Alert type="error" showIcon message={scopeMutation.error instanceof Error ? scopeMutation.error.message : 'Failed to save scope'} />
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <Button onClick={() => setMode({ kind: 'empty' })}>Cancel</Button>
              <Button type="primary" loading={scopeMutation.isPending} onClick={() => scopeMutation.mutate()}>Save scope</Button>
            </div>
          </div>
        </div>
      )}

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
              { value: 'submitted', label: 'Submitted' }, { value: 'auth', label: 'Authenticated' },
            ]} />
        </div>
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
    </div>
  );
}

function Kpi({ label, value, color }: { label: string; value: number; color: string }) {
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

function OverviewView({ projectId, zoneId, project }: { projectId: string; zoneId: string; project: { name: string; projectCode: string | null; projectType: string | null; lengthKm: number | null; ipaDate: string | null; targetCompletionYear: number | null; lifecycleState: string } }) {
  const queryClient = useQueryClient();
  const currentUser = useAuthStore((s) => s.currentUser);
  const [modal, setModal] = useState<AssignModalKind>(null);
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
  const activityProgress = activities.map((a, i) => {
    const records = recordCountQueries[i]?.data ?? [];
    const authenticated = records.filter((r) => r.recordState === 'AUTHENTICATED').length;
    return { type: a.activityTypeCode, label: ACTIVITY_TYPE_LABEL[a.activityTypeCode] ?? a.activityTypeCode.replace(/_/g, ' '), authenticated, total: records.length };
  });
  const allRecords = recordCountQueries.flatMap((q) => q.data ?? []);
  const totalAuthenticated = allRecords.filter((r) => r.recordState === 'AUTHENTICATED').length;
  const overallProgress = allRecords.length > 0 ? Math.round((totalAuthenticated / allRecords.length) * 100) : 0;

  const officerRows = orderedOfficerRows(assignmentsQuery.data ?? []);

  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Row 1 — stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
        <StatCard label="Activities" value={activities.length} />
        <StatCard label="Total records" value={allRecords.length} />
        <StatCard label="Authenticated" value={totalAuthenticated} />
        <StatCard label="Overall progress" value={`${overallProgress}%`} />
      </div>

      {/* Row 2 — project details */}
      <div style={{ background: 'var(--ant-color-bg-container)', border: '1px solid var(--ant-color-border)', borderRadius: 10, padding: '16px 18px' }}>
        <h4 style={{ margin: '0 0 12px' }}>Project details</h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px 20px' }}>
          <Detail label="Zone" value={zoneShort} />
          <Detail label="Project ID" value={project.projectCode ?? '—'} />
          <Detail label="PH" value={project.projectType ? (PLAN_HEAD_BY_PROJECT_TYPE[project.projectType] ? `PH-${PLAN_HEAD_BY_PROJECT_TYPE[project.projectType]} : ${project.projectType.replace(/_/g, ' ')}` : project.projectType.replace(/_/g, ' ')) : '—'} />
          <Detail label="Length" value={project.lengthKm !== null ? `${project.lengthKm} km` : '—'} />
          <Detail label="IPA date" value={project.ipaDate ? dayjs(project.ipaDate).format('D MMM YYYY') : '—'} />
          <Detail label="Status" value={badge.label} />
        </div>
      </div>

      {/* Row 3 — designated officers (left) + activity progress (right) */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
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

        <div style={{ background: 'var(--ant-color-bg-container)', border: '1px solid var(--ant-color-border)', borderRadius: 10, padding: '16px 18px' }}>
          <h4 style={{ margin: '0 0 12px' }}>Activity progress</h4>
          {activityProgress.length === 0 ? (
            <Text type="secondary" style={{ fontSize: 13 }}>No activities yet.</Text>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {activityProgress.map((ap) => {
                const pct = ap.total > 0 ? Math.round((ap.authenticated / ap.total) * 100) : 0;
                return (
                  <div key={ap.type}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                      <span>{ap.label}</span>
                      <Text type="secondary">{ap.authenticated}/{ap.total}</Text>
                    </div>
                    <div style={{ height: 8, borderRadius: 4, background: 'var(--ant-color-bg-layout)', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: 'var(--ant-color-primary)', borderRadius: 4 }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <AllocateModal projectId={projectId} zoneId={zoneId} open={modal === 'allocate'} onClose={() => setModal(null)} onSuccess={refresh} />
      <PrimaryCeModal projectId={projectId} open={modal === 'primaryCe'} onClose={() => setModal(null)} onSuccess={refresh} />
      <AssignDyceModal projectId={projectId} zoneId={zoneId} open={modal === 'assignDyce'} onClose={() => setModal(null)} onSuccess={refresh} />
    </div>
  );
}
function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div style={{ background: 'var(--ant-color-bg-container)', border: '1px solid var(--ant-color-border)', borderRadius: 10, padding: '16px 18px' }}>
      <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--ant-color-primary)' }}>{value}</div>
      <div style={{ fontSize: 12, color: 'var(--ant-color-text-secondary)', marginTop: 2 }}>{label}</div>
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
                  <td style={td}>{h.entityType.replace(/_/g, ' ')}</td>
                  <td style={{ ...td, borderRight: 'none' }}>{h.action.replace(/_/g, ' ')}</td>
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

type NavView = 'overview' | 'records' | 'history';

export default function ProjectWorkspace() {
  const navigate = useNavigate();
  const { projectCode = '' } = useParams();
  const currentUser = useAuthStore((s) => s.currentUser);

  const [view, setView] = useState<NavView>('records');
  const [activeType, setActiveType] = useState<string>(ACTIVITY_TYPE_ORDER[0]);

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
  const canAssign =
    (currentUser?.permissions.includes('PROJECT.ALLOCATE') ?? false) ||
    (currentUser?.permissions.includes('PROJECT.ASSIGN_DYCE') ?? false);

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
            &nbsp;·&nbsp;{project.projectType ?? ''}{project.lengthKm !== null ? ` · ${project.lengthKm} km` : ''}
          </Text>
        )}
        <div style={{ flex: 1 }} />
        {canAssign && (
          <Button
            type="primary"
            size="small"
            style={{ marginRight: 12, background: '#1565c0', borderColor: '#1565c0' }}
            onClick={() => setView('overview')}
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
                  onClick={() => {
                    // Placeholder external link until an in-app map view exists.
                    if (n.key === 'map') { window.open('https://indianrailways.gov.in/index/index.html', '_blank', 'noopener,noreferrer'); return; }
                    setView(n.key as NavView);
                  }}
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
            <div style={{ flex: 1, overflowY: 'auto' }}><OverviewView projectId={project.id} zoneId={project.zoneId} project={project} /></div>
          ) : view === 'history' ? (
            <div style={{ flex: 1, overflowY: 'auto' }}><HistoryView projectId={project.id} /></div>
          ) : (
            <>
              {/* activity tab bar — the six fixed activity types */}
              <div style={{ display: 'flex', alignItems: 'center', height: 46, background: TABBAR_BG, borderBottom: `3px solid ${LINE_STRONG}`, padding: '0 12px', flexShrink: 0, overflowX: 'auto', overflowY: 'hidden', boxShadow: '0 2px 4px rgba(15,23,42,.05)' }}>
                {ACTIVITY_TYPE_ORDER.map((type, idx) => {
                  const active = type === activeType;
                  const act = activityByType[type];
                  const count = act ? (countByActivityId[act.id] ?? 0) : 0;
                  return (
                    <div key={type} onClick={() => setActiveType(type)}
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
