/**
 * ProjectsPage — Tree Master-Detail archetype (docs/ui.md § 3, Archetype 2).
 *
 * Left side: Ant Design Tree.
 *   Root nodes  = projects  (loaded from GET /api/v1/projects)
 *   Child nodes = activities (lazy-loaded on expand via GET /api/v1/projects/{id}/activities)
 *
 * Right side: slide-in detail pane (40% tree / 60% pane) when a node is selected.
 *
 * URL is the source of truth for selection:
 *   /projects                            → tree root, no pane
 *   /projects/{projectCode}              → project selected
 *   /projects/{projectCode}/activities/{activityId} → activity selected
 *
 * "+ Add Project" button is ALWAYS VISIBLE; DISABLED with tooltip for users lacking
 * PROJECT.CREATE (decision PPP in docs/ui.md § 3).
 */

import React, { useEffect, useState } from 'react';
import dayjs from 'dayjs';
import { useNavigate, useMatch } from 'react-router-dom';
import type { ActivityRecordDetail } from '@api/activityRecords';
import { listRecords } from '@api/activityRecords';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Button,
  Empty,
  Input,
  Segmented,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  Tooltip,
  Tree,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { DataNode } from 'antd/es/tree';
import {
  AppstoreOutlined,
  ExportOutlined,
  PlusOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons';
import {
  IconFileDescription,
  IconFileInvoice,
  IconHomeCog,
  IconMapPinDollar,
  IconRoute,
  IconRuler2,
  IconTools,
  IconTrees,
} from '@tabler/icons-react';
import {
  fetchActivities,
  fetchProjects,
  fetchZones,
  type ActivityDetailResponse,
  type ProjectSummaryResponse,
} from '@api/projects';
import { useAuthStore } from '@stores/authStore';
import ProjectCreateWizard from './ProjectCreateWizard';
import { ProjectDetailPanel } from './ProjectDetailPanel';
import { ActivityDetailPanel } from './ActivityDetailPanel';
import { RecordDetailPanel } from './RecordDetailPanel';

const { Title, Text } = Typography;
const { Search } = Input;

// ── Query keys ─────────────────────────────────────────────────────────────────

export const PROJECTS_QUERY_KEY = ['projects'] as const;
export const ZONES_QUERY_KEY = ['zones'] as const;

// ── Lifecycle badge config ────────────────────────────────────────────────────

const LIFECYCLE_BADGE: Record<string, { color: string; label: string }> = {
  DRAFT:                   { color: 'default', label: 'Draft' },
  AWAITING_CAO_ALLOCATION: { color: 'orange',  label: 'Awaiting Allocation' },
  AWAITING_CEC_ASSIGNMENT: { color: 'blue',    label: 'Awaiting Assignment' },
  ACTIVE:                  { color: 'green',   label: 'Active' },
  CLOSED:                  { color: 'default', label: 'Closed' },
};

// ── Activity status colours + labels ─────────────────────────────────────────


// ── Activity type → icon / label ─────────────────────────────────────────────

const TABLER_SIZE = 15;

/** Wraps a Tabler icon so Ant Design Tree/Menu treats it like an anticon element. */
function treeIcon(icon: React.ReactNode) {
  return <span className="anticon">{icon}</span>;
}

// ── Project type abbreviation icon ───────────────────────────────────────────

const PROJECT_TYPE_ABBR: Record<string, string> = {
  NEW_LINE:         'NL',
  DOUBLING:         'D',
  GAUGE_CONVERSION: 'GC',
  ELECTRIFICATION:  'E',
  ROAD_OVER_BRIDGE: 'ROB',
  OTHER:            '?',
};

function ProjectTypeIcon({ projectType }: { projectType: string | null }) {
  const abbr = (projectType && PROJECT_TYPE_ABBR[projectType]) ?? '?';
  return (
    <span
      className="anticon"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 26,
        height: 26,
        borderRadius: 4,
        background: 'var(--ant-color-primary)',
        color: '#fff',
        fontSize: abbr.length > 2 ? 9 : abbr.length === 2 ? 10 : 13,
        fontWeight: 700,
        lineHeight: 1,
        letterSpacing: abbr.length > 2 ? -0.5 : 0,
        flexShrink: 0,
      }}
    >
      {abbr}
    </span>
  );
}

const ACTIVITY_TYPE_ICONS: Record<string, React.ReactNode> = {
  LAND_ACQUISITION:       treeIcon(<IconMapPinDollar size={TABLER_SIZE} />),
  FOREST_CLEARANCE:       treeIcon(<IconTrees size={TABLER_SIZE} />),
  UTILITY_SHIFTING:       treeIcon(<IconTools size={TABLER_SIZE} />),
  DRAWING_APPROVAL:       treeIcon(<IconRuler2 size={TABLER_SIZE} />),
  TENDER_PACKAGING:       treeIcon(<IconFileInvoice size={TABLER_SIZE} />),
  TEMPORARY_OFFICE_SPACE: treeIcon(<IconHomeCog size={TABLER_SIZE} />),
};

// ── Tree node key helpers ─────────────────────────────────────────────────────

function projectNodeKey(projectId: string) { return `project:${projectId}`; }
function activityNodeKey(activityId: string) { return `activity:${activityId}`; }
function recordNodeKey(recordId: string) { return `record:${recordId}`; }

function isProjectKey(key: string) { return key.startsWith('project:'); }
function isActivityKey(key: string) { return key.startsWith('activity:'); }
function isRecordKey(key: string) { return key.startsWith('record:'); }

function projectIdFromKey(key: string) { return key.replace('project:', ''); }
function activityIdFromKey(key: string) { return key.replace('activity:', ''); }
function recordIdFromKey(key: string) { return key.replace('record:', ''); }

/** Activity types whose records appear as children in the tree. */
const RECORD_TREE_TYPES = new Set([
  'LAND_ACQUISITION',
  'FOREST_CLEARANCE',
  'UTILITY_SHIFTING',
  'TEMPORARY_OFFICE_SPACE',
  'TENDER_PACKAGING',
  'DRAWING_APPROVAL',
]);

/** Human-readable label for a record node. */
function recordDisplayName(record: ActivityRecordDetail, index: number): string {
  if (record.name) return record.name;
  if (record.recordSubtype) return record.recordSubtype.replace(/_/g, ' ');
  return `Record ${index + 1}`;
}

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
  VERIFIED:                     'Pending Auth',
  AUTHENTICATED:                'Authenticated',
  SENT_BACK_TO_DYCE:            'Sent Back',
  SENT_BACK_TO_NODAL:           'Sent Back',
};

// ── Project node title ────────────────────────────────────────────────────────

function ProjectNodeTitle({
  project,
  zoneShortName,
}: {
  project: ProjectSummaryResponse;
  zoneShortName: string;
}) {
  const badge = LIFECYCLE_BADGE[project.lifecycleState] ?? { color: 'default', label: project.lifecycleState };

  // Build subtitle parts: chainage range + length + zone
  const subtitleParts: string[] = [];
  if (project.chainageFromKm !== null && project.chainageToKm !== null) {
    subtitleParts.push(`Km ${project.chainageFromKm}–${project.chainageToKm}`);
  }
  if (project.lengthKm !== null) {
    subtitleParts.push(`${project.lengthKm} km`);
  }
  if (zoneShortName) subtitleParts.push(zoneShortName);
  subtitleParts.push(dayjs(project.createdAt).format('D MMM YYYY'));
  const subtitle = subtitleParts.join(' · ');

  return (
    <div
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: 8, minWidth: 0 }}
    >
      <ProjectTypeIcon projectType={project.projectType} />
      {/* Left: name + subtitle */}
      <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
        <div style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: '20px' }}>
          {project.name}
        </div>
        {subtitle && (
          <div style={{ fontSize: 11, color: 'var(--ant-color-text-tertiary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: '16px' }}>
            {subtitle}
          </div>
        )}
      </div>

      {/* Right: target year + days elapsed + lifecycle badge + more */}
      <Space size={6} style={{ flexShrink: 0, alignItems: 'center' }} onClick={(e) => e.stopPropagation()}>
        {project.targetCompletionYear && (
          <Text type="secondary" style={{ fontSize: 11, fontVariantNumeric: 'tabular-nums' }}>
            {project.targetCompletionYear}
          </Text>
        )}
        <Text type="secondary" style={{ fontSize: 11, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
          {dayjs().diff(dayjs(project.createdAt), 'day')}d
        </Text>
        <Tag color={badge.color} style={{ margin: 0, fontSize: 11, lineHeight: '18px', padding: '0 6px' }}>
          {badge.label}
        </Tag>
      </Space>
    </div>
  );
}

// ── Activity node title ───────────────────────────────────────────────────────

function ActivityNodeTitle({ activity }: { activity: ActivityDetailResponse }) {
  const daysElapsed = dayjs().diff(dayjs(activity.createdAt), 'day');

  return (
    <div
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: 8, minWidth: 0 }}
    >
      {/* Left: name (icon comes from tree node's `icon` prop) */}
      <Text
        strong
        style={{ fontSize: 13, flex: 1, minWidth: 0, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}
      >
        {activity.name || activity.activityTypeCode.replace(/_/g, ' ')}
      </Text>

      {/* Right: days elapsed + more */}
      <Text type="secondary" style={{ fontSize: 11, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', flexShrink: 0 }}>
        {daysElapsed}d
      </Text>
    </div>
  );
}

// ── Record node title ─────────────────────────────────────────────────────────

function RecordNodeTitle({ record, index }: { record: ActivityRecordDetail; index: number }) {
  const stateColor = RECORD_STATE_COLORS[record.recordState] ?? 'default';
  const stateLabel = RECORD_STATE_LABELS[record.recordState] ?? record.recordState.replace(/_/g, ' ');
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: 8, minWidth: 0 }}>
      <Text style={{ fontSize: 12, flex: 1, minWidth: 0, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
        {recordDisplayName(record, index)}
      </Text>
      <Tag color={stateColor} style={{ margin: 0, fontSize: 11, lineHeight: '16px', padding: '0 5px', flexShrink: 0 }}>
        {stateLabel}
      </Tag>
    </div>
  );
}

// ProjectDetailPanel, ActivityDetailPanel, RecordDetailPanel are imported from their own files.

// ── Table view ────────────────────────────────────────────────────────────────

interface FlatRow {
  key: string;
  projectId: string;
  projectName: string;
  projectCode: string | null;
  zoneId: string;
  projectCreatedAt: string;
  lifecycleState: string;
  activityId?: string;
  activityName?: string;
  activityTypeCode?: string;
  recordId?: string;
  recordName?: string | null;
  recordState?: string;
  recordCreatedAt?: string;
}

const RECORD_STATE_COLOR: Record<string, string> = {
  DRAFT:                       'default',
  SUBMITTED_FOR_VERIFICATION:  'blue',
  VERIFIED:                    'cyan',
  AUTHENTICATED:               'green',
  SENT_BACK_TO_DYCE:           'orange',
  SENT_BACK_TO_NODAL:          'gold',
};

const RECORD_STATE_LABEL: Record<string, string> = {
  DRAFT:                       'Draft',
  SUBMITTED_FOR_VERIFICATION:  'Submitted',
  VERIFIED:                    'Verified',
  AUTHENTICATED:               'Authenticated',
  SENT_BACK_TO_DYCE:           'Sent back',
  SENT_BACK_TO_NODAL:          'Sent back',
};

function ProjectsTable({
  projects,
  zoneMap,
  activityMap,
  recordMap,
  loading,
  onSelectProject,
  onSelectRecord,
}: {
  projects: ProjectSummaryResponse[];
  zoneMap: Record<string, string>;
  activityMap: Record<string, ActivityDetailResponse[]>;
  recordMap: Record<string, ActivityRecordDetail[]>;
  loading: boolean;
  onSelectProject: (project: ProjectSummaryResponse) => void;
  onSelectRecord: (projectCode: string, activityId: string, recordId: string) => void;
}) {
  // Flatten projects → activities → records into one row per record (min 1 row per project)
  const rows: FlatRow[] = [];
  for (const project of projects) {
    const activities = activityMap[project.id];
    if (!activities || activities.length === 0) {
      rows.push({
        key: `proj-${project.id}`,
        projectId: project.id,
        projectName: project.name,
        projectCode: project.projectCode,
        zoneId: project.zoneId,
        projectCreatedAt: project.createdAt,
        lifecycleState: project.lifecycleState,
      });
      continue;
    }
    for (const activity of activities) {
      const records = recordMap[activity.id];
      if (!records || records.length === 0) {
        rows.push({
          key: `act-${activity.id}`,
          projectId: project.id,
          projectName: project.name,
          projectCode: project.projectCode,
          zoneId: project.zoneId,
          projectCreatedAt: project.createdAt,
          lifecycleState: project.lifecycleState,
          activityId: activity.id,
          activityName: activity.name,
          activityTypeCode: activity.activityTypeCode,
        });
        continue;
      }
      for (const record of records) {
        rows.push({
          key: `rec-${record.id}`,
          projectId: project.id,
          projectName: project.name,
          projectCode: project.projectCode,
          zoneId: project.zoneId,
          projectCreatedAt: project.createdAt,
          lifecycleState: project.lifecycleState,
          activityId: activity.id,
          activityName: activity.name,
          activityTypeCode: activity.activityTypeCode,
          recordId: record.id,
          recordName: record.name,
          recordState: record.recordState,
          recordCreatedAt: record.createdAt,
        });
      }
    }
  }

  const columns: ColumnsType<FlatRow> = [
    {
      title: 'Project name',
      key: 'name',
      sorter: (a, b) => a.projectName.localeCompare(b.projectName),
      render: (_: unknown, row: FlatRow) => (
        <span
          style={{ fontWeight: 500, cursor: 'pointer', color: 'var(--ant-color-primary)' }}
          onClick={() => {
            const proj = projects.find(p => p.id === row.projectId);
            if (proj) onSelectProject(proj);
          }}
        >
          {row.projectName}
        </span>
      ),
    },
    {
      title: 'Zone',
      key: 'zone',
      width: 80,
      render: (_: unknown, row: FlatRow) => (
        <Text type="secondary" style={{ fontSize: 12 }}>{zoneMap[row.zoneId] ?? row.zoneId}</Text>
      ),
      filters: [...new Set(projects.map(p => p.zoneId))].map(id => ({ text: zoneMap[id] ?? id, value: id })),
      onFilter: (value, row) => row.zoneId === value,
    },
    {
      title: 'Activity',
      key: 'activity',
      render: (_: unknown, row: FlatRow) => row.activityName
        ? <Text style={{ fontSize: 12 }}>{row.activityName}</Text>
        : <Text type="secondary" style={{ fontSize: 12 }}>—</Text>,
      sorter: (a, b) => (a.activityName ?? '').localeCompare(b.activityName ?? ''),
    },
    {
      title: 'Record',
      key: 'record',
      render: (_: unknown, row: FlatRow) => {
        if (!row.recordId) return <Text type="secondary" style={{ fontSize: 12 }}>—</Text>;
        const label = row.recordName ?? row.recordId.slice(0, 8);
        return (
          <span
            style={{ cursor: 'pointer', color: 'var(--ant-color-primary)', fontSize: 12 }}
            onClick={(e) => {
              e.stopPropagation();
              if (row.projectCode && row.activityId && row.recordId)
                onSelectRecord(row.projectCode, row.activityId, row.recordId);
            }}
          >
            {label}
          </span>
        );
      },
    },
    {
      title: 'Status',
      key: 'status',
      width: 120,
      render: (_: unknown, row: FlatRow) => {
        if (!row.recordState) return <Text type="secondary" style={{ fontSize: 12 }}>—</Text>;
        const color = RECORD_STATE_COLOR[row.recordState] ?? 'default';
        const label = RECORD_STATE_LABEL[row.recordState] ?? row.recordState;
        return <Tag color={color} style={{ margin: 0, fontSize: 11 }}>{label}</Tag>;
      },
      filters: Object.entries(RECORD_STATE_LABEL).map(([v, t]) => ({ text: t, value: v })),
      onFilter: (value, row) => row.recordState === value,
    },
    {
      title: 'Created',
      key: 'created',
      width: 110,
      render: (_: unknown, row: FlatRow) => (
        <Text type="secondary" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
          {dayjs(row.recordCreatedAt ?? row.projectCreatedAt).format('D MMM YYYY')}
        </Text>
      ),
      sorter: (a, b) =>
        dayjs(a.recordCreatedAt ?? a.projectCreatedAt).unix() -
        dayjs(b.recordCreatedAt ?? b.projectCreatedAt).unix(),
      defaultSortOrder: 'descend',
    },
  ];

  return (
    <Table<FlatRow>
      size="small"
      rowKey="key"
      columns={columns}
      dataSource={rows}
      loading={loading}
      pagination={{ pageSize: 25, hideOnSinglePage: true, showTotal: (n) => `${n} rows` }}
      locale={{ emptyText: 'No projects yet.' }}
    />
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ProjectsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const currentUser = useAuthStore((s) => s.currentUser);

  // URL params
  const matchProject  = useMatch('/projects/:projectCode');
  const matchActivity = useMatch('/projects/:projectCode/activities/:activityId');
  const matchRecord   = useMatch('/projects/:projectCode/activities/:activityId/records/:recordId');
  const urlProjectCode = matchRecord?.params.projectCode ?? matchActivity?.params.projectCode ?? matchProject?.params.projectCode;
  const urlActivityId  = matchRecord?.params.activityId  ?? matchActivity?.params.activityId;
  const urlRecordId    = matchRecord?.params.recordId;

  // Local state
  const [wizardOpen, setWizardOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'tree' | 'table'>('tree');
  const [searchText, setSearchText] = useState('');
  const [zoneFilter, setZoneFilter] = useState<string | undefined>(undefined);

  // Selection state derived from URL
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [expandedKeys, setExpandedKeys] = useState<string[]>([]);

  // Lazy-loaded activities per project
  const [activityMap, setActivityMap] = useState<Record<string, ActivityDetailResponse[]>>({});
  // Lazy-loaded records per activity
  const [recordMap, setRecordMap] = useState<Record<string, ActivityRecordDetail[]>>({});
  const [tableLoading, setTableLoading] = useState(false);

  const canCreate = currentUser?.permissions.includes('PROJECT.CREATE') ?? false;

  // ── Queries ─────────────────────────────────────────────────────────────────

  const projectsQuery = useQuery({
    queryKey: PROJECTS_QUERY_KEY,
    queryFn: fetchProjects,
    enabled: currentUser !== null,
  });

  const zonesQuery = useQuery({
    queryKey: ZONES_QUERY_KEY,
    queryFn: fetchZones,
    staleTime: 10 * 60 * 1000,
  });

  const zoneMap: Record<string, string> = {};
  const zoneShortMap: Record<string, string> = {};
  zonesQuery.data?.forEach((z) => {
    zoneMap[z.id] = `${z.shortName} — ${z.name}`;
    zoneShortMap[z.id] = z.shortName;
  });

  // ── Sync URL → selection ─────────────────────────────────────────────────────

  useEffect(() => {
    if (!projectsQuery.data) return;

    if (urlRecordId) {
      setSelectedKey(recordNodeKey(urlRecordId));
      // Expand project + group + activity nodes so the record is visible in the tree
      if (urlActivityId && urlProjectCode) {
        const proj = projectsQuery.data.find(
          (p) => p.id === urlProjectCode || p.projectCode === urlProjectCode,
        );
        if (proj) {
          const keys = [projectNodeKey(proj.id), activityNodeKey(urlActivityId)];
          setExpandedKeys((prev) => [...new Set([...prev, ...keys])]);
        }
      }
    } else if (urlActivityId) {
      setSelectedKey(activityNodeKey(urlActivityId));
      // Find the project that owns this activity and expand it
      for (const [pId, acts] of Object.entries(activityMap)) {
        if (acts.some((a) => a.id === urlActivityId)) {
          const proj = projectsQuery.data.find((p) => p.id === pId);
          if (proj) {
            const nodeKey = projectNodeKey(pId);
            setExpandedKeys((prev) => prev.includes(nodeKey) ? prev : [...prev, nodeKey]);
          }
        }
      }
    } else if (urlProjectCode) {
      const proj = projectsQuery.data.find(
        (p) => p.id === urlProjectCode || p.projectCode === urlProjectCode,
      );
      if (proj) {
        setSelectedKey(projectNodeKey(proj.id));
      }
    } else {
      setSelectedKey(null);
    }
  }, [urlProjectCode, urlActivityId, urlRecordId, projectsQuery.data, activityMap]);

  // Load all activities + records for every project when switching to table view
  useEffect(() => {
    if (viewMode !== 'table' || !projectsQuery.data) return;
    const projects = projectsQuery.data;
    setTableLoading(true);
    Promise.all(
      projects.map(async (p) => {
        if (activityMap[p.id]) return; // already loaded
        const acts = await fetchActivities(p.id);
        setActivityMap((prev) => ({ ...prev, [p.id]: acts }));
        await Promise.all(
          acts.map(async (a) => {
            if (recordMap[a.id]) return;
            const recs = await listRecords(a.id);
            setRecordMap((prev) => ({ ...prev, [a.id]: recs }));
          }),
        );
      }),
    ).finally(() => setTableLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, projectsQuery.data]);

  // ── Tree data ─────────────────────────────────────────────────────────────────

  const filteredProjects = (projectsQuery.data ?? []).filter((p) => {
    const matchesSearch =
      !searchText ||
      p.name.toLowerCase().includes(searchText.toLowerCase());
    const matchesZone = !zoneFilter || p.zoneId === zoneFilter;
    return matchesSearch && matchesZone;
  });

  const treeData: DataNode[] = filteredProjects.map((project) => {
    // undefined  → not yet loaded  (show expand arrow, trigger load on click)
    // []         → loaded, no activities (leaf)
    // [...]      → loaded with activities (show groups)
    const activities = activityMap[project.id];
    const loaded = activities !== undefined;

    // Sort activities by type code alphabetically, then build flat children list
    const sortedActivities = [...(activities ?? [])].sort((a, b) =>
      a.activityTypeCode.localeCompare(b.activityTypeCode),
    );

    const groupChildren: DataNode[] = sortedActivities.map((activity) => {
      const hasRecords = RECORD_TREE_TYPES.has(activity.activityTypeCode);
      const loadedRecs = recordMap[activity.id];
      const recChildren: DataNode[] = (loadedRecs ?? []).map((r, idx) => ({
        key:    recordNodeKey(r.id),
        icon:   treeIcon(<IconFileDescription size={12} />),
        title:  <RecordNodeTitle record={r} index={idx} />,
        isLeaf: true,
      }));
      return {
        key:      activityNodeKey(activity.id),
        icon:     ACTIVITY_TYPE_ICONS[activity.activityTypeCode] ?? treeIcon(<IconRoute size={TABLER_SIZE} />),
        title:    <ActivityNodeTitle activity={activity} />,
        isLeaf:   !hasRecords,
        children: hasRecords && loadedRecs !== undefined ? recChildren : undefined,
      };
    });

    return {
      key: projectNodeKey(project.id),
      icon: null,
      className: 'pia-project-node',
      title: (
        <ProjectNodeTitle
          project={project}
          zoneShortName={zoneShortMap[project.zoneId] ?? ''}
        />
      ),
      // leaf only when we know there are zero activities
      isLeaf: loaded && (activities ?? []).length === 0,
      // provide children only when loaded; undefined keeps the expand arrow visible
      children: loaded && groupChildren.length > 0 ? groupChildren : undefined,
    };
  });

  // ── Tree handlers ─────────────────────────────────────────────────────────────

  // loadData is required so that unloaded project nodes show an expand arrow.
  // Without it, rc-tree treats children:undefined nodes as leaves regardless of
  // isLeaf:false (see rc-tree TreeNode.js: `!context.loadData && !hasChildren`).
  //
  // Non-project nodes (group / activity) return immediately so rc-tree marks
  // them as loaded without doing anything — their children come from treeData.
  const loadActivityData = async (node: DataNode): Promise<void> => {
    const key = String(node.key);

    // Activity node: lazy-load its records
    if (isActivityKey(key)) {
      const activityId = activityIdFromKey(key);
      if (recordMap[activityId] !== undefined) return; // already loaded
      // Find the activity to check its type
      let typeCode = '';
      for (const acts of Object.values(activityMap)) {
        const act = acts.find((a) => a.id === activityId);
        if (act) { typeCode = act.activityTypeCode; break; }
      }
      if (!RECORD_TREE_TYPES.has(typeCode)) {
        setRecordMap((prev) => ({ ...prev, [activityId]: [] }));
        return;
      }
      try {
        const records = await listRecords(activityId);
        setRecordMap((prev) => ({ ...prev, [activityId]: records }));
      } catch {
        setRecordMap((prev) => ({ ...prev, [activityId]: [] }));
      }
      return;
    }

    if (!isProjectKey(key)) return; // group nodes: instant resolve
    const projectId = projectIdFromKey(key);
    if (activityMap[projectId] !== undefined) return; // already loaded
    try {
      const activities = await fetchActivities(projectId);
      setActivityMap((prev) => ({ ...prev, [projectId]: activities }));
    } catch {
      setActivityMap((prev) => ({ ...prev, [projectId]: [] }));
    }
  };

  const handleTreeSelect = (keys: React.Key[]) => {
    const key = String(keys[0] ?? '');
    if (!key) return;

    if (isProjectKey(key)) {
      const projectId = projectIdFromKey(key);
      const proj = projectsQuery.data?.find((p) => p.id === projectId);
      if (proj) {
        setSelectedKey(key);
        const codeOrId = proj.projectCode ?? proj.id;
        navigate(`/projects/${codeOrId}`);
      }
    } else if (isActivityKey(key)) {
      const activityId = activityIdFromKey(key);
      setSelectedKey(key);
      let parentCode: string | undefined;
      for (const [pId, acts] of Object.entries(activityMap)) {
        if (acts.some((a) => a.id === activityId)) {
          const proj = projectsQuery.data?.find((p) => p.id === pId);
          parentCode = proj?.projectCode ?? pId;
          break;
        }
      }
      if (parentCode) {
        navigate(`/projects/${parentCode}/activities/${activityId}`);
      }
    } else if (isRecordKey(key)) {
      const recordId = recordIdFromKey(key);
      setSelectedKey(key);
      // Find parent activity + project
      outer: for (const [pId, acts] of Object.entries(activityMap)) {
        for (const act of acts) {
          if (recordMap[act.id]?.some((r) => r.id === recordId)) {
            const proj = projectsQuery.data?.find((p) => p.id === pId);
            const projectCode = proj?.projectCode ?? pId;
            navigate(`/projects/${projectCode}/activities/${act.id}/records/${recordId}`);
            break outer;
          }
        }
      }
    }
  };

  const handleTreeExpand = (keys: React.Key[]) => {
    setExpandedKeys(keys.map(String));
  };

  const handleClosePane = () => {
    setSelectedKey(null);
    navigate('/projects');
  };

  const handleTableSelect = (project: ProjectSummaryResponse) => {
    setViewMode('tree');
    setSelectedKey(projectNodeKey(project.id));
    const codeOrId = project.projectCode ?? project.id;
    navigate(`/projects/${codeOrId}`);
  };

  // ── Detail pane content ───────────────────────────────────────────────────────

  const detailPaneContent = selectedKey ? (
    isProjectKey(selectedKey) ? (
      <ProjectDetailPanel
        projectId={projectIdFromKey(selectedKey)}
        currentUser={currentUser!}
        onClose={handleClosePane}
        onActivityCreated={() => {
          const projectId = projectIdFromKey(selectedKey);
          void fetchActivities(projectId).then((activities) => {
            setActivityMap((prev) => ({ ...prev, [projectId]: activities }));
            setExpandedKeys((prev) => [...new Set([...prev, projectNodeKey(projectId)])]);
          });
        }}
      />
    ) : isActivityKey(selectedKey) ? (() => {
      const activityId = activityIdFromKey(selectedKey);
      // Find project code for record URL navigation
      let parentProjectCode = '';
      for (const [pId, acts] of Object.entries(activityMap)) {
        if (acts.some((a) => a.id === activityId)) {
          const proj = projectsQuery.data?.find((p) => p.id === pId);
          parentProjectCode = proj?.projectCode ?? pId;
          break;
        }
      }
      return (
        <ActivityDetailPanel
          activityId={activityId}
          canEdit={currentUser?.permissions.includes('ACTIVITY.UPDATE.OWN') ?? false}
          onClose={handleClosePane}
          onRecordCreated={(record) => {
            // Add to recordMap so tree shows it immediately
            setRecordMap((prev) => ({
              ...prev,
              [activityId]: [...(prev[activityId] ?? []), record],
            }));
            // Ensure activity node is expanded
            setExpandedKeys((prev) => [...new Set([...prev, activityNodeKey(activityId)])]);
            // Navigate to the new record's detail pane
            if (parentProjectCode) {
              navigate(`/projects/${parentProjectCode}/activities/${activityId}/records/${record.id}`);
            }
          }}
        />
      );
    })()
    : isRecordKey(selectedKey) ? (() => {
      const recordId = recordIdFromKey(selectedKey);
      // Find activityTypeCode for the record
      let activityTypeCode = '';
      for (const acts of Object.values(activityMap)) {
        for (const act of acts) {
          if (recordMap[act.id]?.some((r) => r.id === recordId)) {
            activityTypeCode = act.activityTypeCode;
            break;
          }
        }
        if (activityTypeCode) break;
      }
      return (
        <RecordDetailPanel
          recordId={recordId}
          activityTypeCode={activityTypeCode}
          canEdit={currentUser?.permissions.includes('ACTIVITY_RECORD.UPDATE.OWN') ?? false}
          onClose={handleClosePane}
        />
      );
    })()
    : null
  ) : null;

  const paneOpen = detailPaneContent !== null;

  // ── Render ────────────────────────────────────────────────────────────────────

  if (!currentUser) {
    return (
      <Alert
        type="warning"
        message={t('common.notAuthenticated', 'Please select a user to continue.')}
        showIcon
      />
    );
  }

  return (
    <>
      {/* Outer: flex column filling the Content area height */}
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 10 }}>

        {/* ── Fixed top strip (shrinks to content) ─────────────────────────── */}
        <div style={{ flexShrink: 0, padding: '16px 24px 0' }}>
          {/* Title row */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
            <div>
              <Title level={4} style={{ margin: 0 }}>
                {t('projects.title', 'Projects')}
              </Title>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {projectsQuery.data
                  ? t('projects.count', '{{count}} projects', { count: projectsQuery.data.length })
                  : '…'}
              </Text>
            </div>

            <Space>
              <Button icon={<ExportOutlined />} disabled>
                {t('projects.export', 'Export')}
              </Button>
              <Tooltip
                title={
                  canCreate
                    ? undefined
                    : t('projects.createDisabledTooltip', 'Only EDGS/C-I can create projects')
                }
              >
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  disabled={!canCreate}
                  onClick={() => setWizardOpen(true)}
                >
                  {t('projects.newButton', 'Add Project')}
                </Button>
              </Tooltip>
            </Space>
          </div>

          {/* Filter bar */}
          <Space wrap style={{ marginBottom: 8 }}>
            <Search
              placeholder={t('projects.search', 'Search projects, activities, villages…')}
              allowClear
              style={{ width: 300 }}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
            />
            <Select
              placeholder={t('projects.filterZone', 'Zone')}
              allowClear
              style={{ width: 180 }}
              loading={zonesQuery.isLoading}
              value={zoneFilter}
              onChange={setZoneFilter}
              options={zonesQuery.data?.map((z) => ({
                value: z.id,
                label: `${z.shortName} — ${z.name}`,
              }))}
            />
            <Segmented
              value={viewMode}
              onChange={(v) => setViewMode(v as 'tree' | 'table')}
              options={[
                { value: 'tree', icon: <AppstoreOutlined />, label: t('projects.viewTree', 'Tree') },
                { value: 'table', icon: <UnorderedListOutlined />, label: t('projects.viewTable', 'Table') },
              ]}
            />
          </Space>

          {/* Error banner */}
          {projectsQuery.isError && (
            <Alert
              type="error"
              message={t('projects.loadError', 'Failed to load projects')}
              description={
                projectsQuery.error instanceof Error ? projectsQuery.error.message : undefined
              }
              showIcon
              style={{ marginBottom: 8 }}
            />
          )}
        </div>

        {/* ── Expanding main section — fills all remaining viewport height ───── */}
        {/* min-height:0 is required for flex children to shrink below content size */}
        <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: 12, padding: '0 24px 16px' }}>

          {/* Tree / Table pane — independent vertical scroll */}
          <div style={{
            width: paneOpen ? '40%' : '100%',
            transition: 'width 0.25s',
            overflowY: 'auto',
            overflowX: 'hidden',
          }}>
            {projectsQuery.isLoading ? (
              <Spin style={{ display: 'block', margin: '40px auto' }} />
            ) : viewMode === 'tree' ? (
              filteredProjects.length === 0 ? (
                <Empty description={t('projects.empty', 'No projects yet.')} />
              ) : (
                <Tree
                  showIcon
                  blockNode
                  loadData={loadActivityData}
                  treeData={treeData}
                  selectedKeys={selectedKey ? [selectedKey] : []}
                  expandedKeys={expandedKeys}
                  onSelect={handleTreeSelect}
                  onExpand={handleTreeExpand}
                  style={{ background: 'transparent' }}
                  // Allow two-line project rows to render fully
                  className="pia-project-tree"
                />
              )
            ) : (
              <ProjectsTable
                projects={filteredProjects}
                zoneMap={zoneShortMap}
                activityMap={activityMap}
                recordMap={recordMap}
                loading={tableLoading}
                onSelectProject={handleTableSelect}
                onSelectRecord={(projectCode, activityId, recordId) => {
                  navigate(`/projects/${projectCode}/activities/${activityId}/records/${recordId}`);
                }}
              />
            )}
          </div>

          {/* Detail pane — independent vertical scroll, fills remaining width */}
          {paneOpen && (
            <div style={{
              flex: 1,
              minWidth: 0,
              border: '1px solid var(--ant-color-border)',
              borderRadius: 8,
              background: 'var(--ant-color-bg-container)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
            }}>
              {detailPaneContent}
            </div>
          )}
        </div>
      </div>

      {/* Create wizard */}
      <ProjectCreateWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onCreated={() => {
          queryClient.invalidateQueries({ queryKey: PROJECTS_QUERY_KEY });
        }}
      />
    </>
  );
}
