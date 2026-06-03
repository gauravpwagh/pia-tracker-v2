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
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Button,
  Dropdown,
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
  AuditOutlined,
  BranchesOutlined,
  ClusterOutlined,
  ExportOutlined,
  FolderOutlined,
  HomeOutlined,
  MoreOutlined,
  PlusOutlined,
  ThunderboltOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons';
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

const ACTIVITY_STATUS_COLORS: Record<string, string> = {
  DRAFT:                       'default',
  SUBMITTED_FOR_VERIFICATION:  'blue',
  VERIFIED:                    'cyan',
  AUTHENTICATED:               'green',
  SENT_BACK_TO_DYCE:           'orange',
  SENT_BACK_TO_NODAL:          'gold',
};

const ACTIVITY_STATUS_LABELS: Record<string, string> = {
  DRAFT:                       'Draft',
  SUBMITTED_FOR_VERIFICATION:  'Submitted',
  VERIFIED:                    'Verified',
  AUTHENTICATED:               'Authenticated',
  SENT_BACK_TO_DYCE:           'Sent back to Dy CE/C',
  SENT_BACK_TO_NODAL:          'Sent back to Nodal',
  // legacy values still present in existing DB rows
  NOT_STARTED:                 'Draft',
  IN_PROGRESS:                 'Submitted',
  COMPLETED:                   'Authenticated',
  ON_HOLD:                     'Sent back to Dy CE/C',
  CANCELLED:                   'Sent back to Nodal',
};

// ── Activity type → icon / label ─────────────────────────────────────────────

const ACTIVITY_TYPE_ICONS: Record<string, React.ReactNode> = {
  LAND_ACQUISITION: <HomeOutlined />,
  FOREST_CLEARANCE: <ClusterOutlined />,
  UTILITY_SHIFTING: <ThunderboltOutlined />,
  DRAWING_APPROVAL: <AuditOutlined />,
};

const ACTIVITY_TYPE_LABELS: Record<string, string> = {
  LAND_ACQUISITION:       'Land Acquisition',
  FOREST_CLEARANCE:       'Forest Clearance',
  UTILITY_SHIFTING:       'Utility Shifting',
  DRAWING_APPROVAL:       'Drawing Approval',
  TENDER_PACKAGING:       'Tender Packaging',
  TEMPORARY_OFFICE_SPACE: 'Temporary Office Space',
};

// ── Tree node key helpers ─────────────────────────────────────────────────────

function projectNodeKey(projectId: string) { return `project:${projectId}`; }
function activityNodeKey(activityId: string) { return `activity:${activityId}`; }
function actGroupNodeKey(projectId: string, typeCode: string) { return `actgroup:${projectId}:${typeCode}`; }

function isProjectKey(key: string) { return key.startsWith('project:'); }
function isActivityKey(key: string) { return key.startsWith('activity:'); }
function isActGroupKey(key: string) { return key.startsWith('actgroup:'); }

function projectIdFromKey(key: string) { return key.replace('project:', ''); }
function activityIdFromKey(key: string) { return key.replace('activity:', ''); }

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
  const subtitle = subtitleParts.join(' · ');

  return (
    <div
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: 8, minWidth: 0 }}
    >
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
        <Dropdown
          trigger={['click']}
          menu={{ items: [] }}  // wired in a later phase
        >
          <Button
            type="text"
            size="small"
            icon={<MoreOutlined />}
            style={{ width: 20, height: 20, minWidth: 20, padding: 0, fontSize: 13 }}
          />
        </Dropdown>
      </Space>
    </div>
  );
}

// ── Activity node title ───────────────────────────────────────────────────────

function ActivityNodeTitle({ activity }: { activity: ActivityDetailResponse }) {
  const statusColor = ACTIVITY_STATUS_COLORS[activity.status] ?? 'default';
  const statusLabel = ACTIVITY_STATUS_LABELS[activity.status] ?? activity.status.replace(/_/g, ' ');
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

      {/* Right: days elapsed + status badge + more */}
      <Space size={6} style={{ flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
        <Text type="secondary" style={{ fontSize: 11, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
          {daysElapsed}d
        </Text>
        <Tag color={statusColor} style={{ margin: 0, fontSize: 11, lineHeight: '18px', padding: '0 6px' }}>
          {statusLabel}
        </Tag>
        <Dropdown trigger={['click']} menu={{ items: [] }}>
          <Button
            type="text"
            size="small"
            icon={<MoreOutlined />}
            style={{ width: 20, height: 20, minWidth: 20, padding: 0, fontSize: 13 }}
          />
        </Dropdown>
      </Space>
    </div>
  );
}

// ── Activity group node title ─────────────────────────────────────────────────

function ActivityGroupTitle({ typeCode, count }: { typeCode: string; count: number }) {
  const label = ACTIVITY_TYPE_LABELS[typeCode] ?? typeCode.replace(/_/g, ' ');
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: 8 }}>
      <Text style={{ fontSize: 12, fontWeight: 600 }}>{label}</Text>
      <Tag style={{ margin: 0, fontSize: 11, lineHeight: '16px', padding: '0 5px' }}>{count}</Tag>
    </div>
  );
}

// ProjectDetailPanel and ActivityDetailPanel are imported from their own files.

// ── Table view ────────────────────────────────────────────────────────────────

function ProjectsTable({
  projects,
  zoneMap,
  onSelect,
}: {
  projects: ProjectSummaryResponse[];
  zoneMap: Record<string, string>;
  onSelect: (project: ProjectSummaryResponse) => void;
}) {
  const { t } = useTranslation();
  const columns: ColumnsType<ProjectSummaryResponse> = [
    {
      title: t('projects.table.name', 'Project name'),
      dataIndex: 'name',
      key: 'name',
      sorter: (a, b) => a.name.localeCompare(b.name),
    },
    {
      title: t('projects.table.zone', 'Zone'),
      dataIndex: 'zoneId',
      key: 'zone',
      render: (zoneId: string) => zoneMap[zoneId] ?? zoneId,
      width: 200,
    },
  ];

  return (
    <Table<ProjectSummaryResponse>
      size="small"
      rowKey="id"
      columns={columns}
      dataSource={projects}
      pagination={{ pageSize: 20, hideOnSinglePage: true }}
      locale={{ emptyText: t('projects.empty', 'No projects yet.') }}
      onRow={(record) => ({
        onClick: () => onSelect(record),
        style: { cursor: 'pointer' },
      })}
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
  const matchProject = useMatch('/projects/:projectCode');
  const matchActivity = useMatch('/projects/:projectCode/activities/:activityId');
  const urlProjectCode = matchProject?.params.projectCode ?? matchActivity?.params.projectCode;
  const urlActivityId = matchActivity?.params.activityId;

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

    if (urlActivityId) {
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
  }, [urlProjectCode, urlActivityId, projectsQuery.data, activityMap]);

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

    // Group loaded activities by type code
    const byType: Record<string, ActivityDetailResponse[]> = {};
    for (const act of activities ?? []) {
      if (!byType[act.activityTypeCode]) byType[act.activityTypeCode] = [];
      byType[act.activityTypeCode].push(act);
    }

    const groupChildren: DataNode[] = Object.entries(byType).map(([typeCode, typeActivities]) => ({
      key: actGroupNodeKey(project.id, typeCode),
      icon: ACTIVITY_TYPE_ICONS[typeCode] ?? <BranchesOutlined />,
      title: <ActivityGroupTitle typeCode={typeCode} count={typeActivities.length} />,
      isLeaf: false,
      children: typeActivities.map((activity) => ({
        key: activityNodeKey(activity.id),
        icon: null,
        title: <ActivityNodeTitle activity={activity} />,
        isLeaf: true,
      })),
    }));

    return {
      key: projectNodeKey(project.id),
      icon: <FolderOutlined />,
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
    if (!isProjectKey(key)) return; // group/activity nodes: instant resolve
    const projectId = projectIdFromKey(key);
    if (activityMap[projectId] !== undefined) return; // already loaded
    try {
      const activities = await fetchActivities(projectId);
      const typeCodes = [...new Set(activities.map((a) => a.activityTypeCode))];
      const groupKeys = typeCodes.map((tc) => actGroupNodeKey(projectId, tc));
      // Batch both state writes so a single re-render shows groups expanded
      setActivityMap((prev) => ({ ...prev, [projectId]: activities }));
      if (groupKeys.length > 0) {
        setExpandedKeys((prev) => [...new Set([...prev, ...groupKeys])]);
      }
    } catch {
      setActivityMap((prev) => ({ ...prev, [projectId]: [] }));
    }
  };

  const handleTreeSelect = (keys: React.Key[]) => {
    const key = String(keys[0] ?? '');
    if (!key) return;

    // Group nodes are expand/collapse only — leave existing selection intact
    if (isActGroupKey(key)) return;

    if (isProjectKey(key)) {
      const projectId = projectIdFromKey(key);
      const proj = projectsQuery.data?.find((p) => p.id === projectId);
      if (proj) {
        setSelectedKey(key);
        // Use project code in URL if available, otherwise use id
        const codeOrId = proj.projectCode ?? proj.id;
        navigate(`/projects/${codeOrId}`);
      }
    } else if (isActivityKey(key)) {
      const activityId = activityIdFromKey(key);
      setSelectedKey(key);
      // Find parent project code
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
          // Re-fetch activities and expand the project + all type groups so
          // the new activity is immediately visible regardless of whether the
          // project was already expanded before the modal was opened.
          const projectId = projectIdFromKey(selectedKey);
          void fetchActivities(projectId).then((activities) => {
            setActivityMap((prev) => ({ ...prev, [projectId]: activities }));
            const typeCodes = [...new Set(activities.map((a) => a.activityTypeCode))];
            const groupKeys = typeCodes.map((tc) => actGroupNodeKey(projectId, tc));
            setExpandedKeys((prev) =>
              [...new Set([...prev, projectNodeKey(projectId), ...groupKeys])]
            );
          });
        }}
      />
    ) : isActivityKey(selectedKey) ? (
      <ActivityDetailPanel
        activityId={activityIdFromKey(selectedKey)}
        canEdit={currentUser?.permissions.includes('ACTIVITY.UPDATE.OWN') ?? false}
        onClose={handleClosePane}
        onStatusChanged={(id, newStatus) => {
          setActivityMap((prev) => {
            const next = { ...prev };
            for (const [pId, acts] of Object.entries(next)) {
              const idx = acts.findIndex((a) => a.id === id);
              if (idx !== -1) {
                next[pId] = acts.map((a) => a.id === id ? { ...a, status: newStatus } : a);
                break;
              }
            }
            return next;
          });
        }}
      />
    ) : null
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
        <div style={{ flexShrink: 0 }}>
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
        <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: 12 }}>

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
                onSelect={handleTableSelect}
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
