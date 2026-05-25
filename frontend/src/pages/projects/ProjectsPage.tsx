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

import { useEffect, useState } from 'react';
import { useNavigate, useMatch } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Button,
  Descriptions,
  Empty,
  Input,
  Layout,
  Segmented,
  Select,
  Skeleton,
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
  BranchesOutlined,
  CloseOutlined,
  ExportOutlined,
  FolderOutlined,
  PlusOutlined,
  ProjectOutlined,
  SearchOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons';
import {
  fetchActivities,
  fetchProjectDetail,
  fetchProjects,
  fetchZones,
  type ActivityDetailResponse,
  type ProjectDetailResponse,
  type ProjectSummaryResponse,
} from '@api/projects';
import { useAuthStore } from '@stores/authStore';
import ProjectCreateWizard from './ProjectCreateWizard';

const { Sider, Content } = Layout;
const { Title, Text } = Typography;
const { Search } = Input;

// ── Query keys ─────────────────────────────────────────────────────────────────

export const PROJECTS_QUERY_KEY = ['projects'] as const;
export const ZONES_QUERY_KEY = ['zones'] as const;

// ── State colour map ──────────────────────────────────────────────────────────

const LIFECYCLE_COLORS: Record<string, string> = {
  DRAFT: 'default',
  AWAITING_CAO_ALLOCATION: 'orange',
  AWAITING_CEC_ASSIGNMENT: 'gold',
  ACTIVE: 'green',
  CLOSED: 'default',
  CANCELLED: 'red',
};

const ACTIVITY_STATUS_COLORS: Record<string, string> = {
  NOT_STARTED: 'default',
  IN_PROGRESS: 'blue',
  COMPLETED: 'green',
  ON_HOLD: 'orange',
};

function lifecycleBadge(state: string) {
  const color = LIFECYCLE_COLORS[state] ?? 'default';
  const label = state.replace(/_/g, ' ');
  return <Tag color={color} style={{ marginInlineStart: 'auto', flexShrink: 0 }}>{label}</Tag>;
}

// ── Tree node key helpers ─────────────────────────────────────────────────────

function projectNodeKey(projectId: string) { return `project:${projectId}`; }
function activityNodeKey(activityId: string) { return `activity:${activityId}`; }

function isProjectKey(key: string) { return key.startsWith('project:'); }
function isActivityKey(key: string) { return key.startsWith('activity:'); }

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
  return (
    <Space size={4} style={{ width: '100%', justifyContent: 'space-between', flexWrap: 'nowrap' }}>
      <Space size={4} style={{ minWidth: 0, overflow: 'hidden' }}>
        <Text strong style={{ whiteSpace: 'nowrap' }}>
          {project.name}
        </Text>
      </Space>
      <Text type="secondary" style={{ whiteSpace: 'nowrap', fontSize: 12, flexShrink: 0 }}>
        {zoneShortName}
      </Text>
    </Space>
  );
}

// ── Activity node title ───────────────────────────────────────────────────────

function ActivityNodeTitle({ activity }: { activity: ActivityDetailResponse }) {
  const color = ACTIVITY_STATUS_COLORS[activity.status] ?? 'default';
  return (
    <Space size={4} style={{ width: '100%', justifyContent: 'space-between' }}>
      <Text>{activity.name || activity.activityTypeCode}</Text>
      <Tag color={color} style={{ fontSize: 11 }}>{activity.status.replace(/_/g, ' ')}</Tag>
    </Space>
  );
}

// ── Project Detail Panel ──────────────────────────────────────────────────────

function ProjectDetailPanel({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const { t } = useTranslation();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => fetchProjectDetail(projectId),
    staleTime: 60_000,
  });

  const zonesQuery = useQuery({
    queryKey: ZONES_QUERY_KEY,
    queryFn: fetchZones,
    staleTime: 10 * 60 * 1000,
  });

  const zoneMap: Record<string, string> = {};
  zonesQuery.data?.forEach((z) => { zoneMap[z.id] = `${z.shortName} — ${z.name}`; });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 16px',
        borderBottom: '1px solid var(--ant-color-border)',
      }}>
        <Space>
          <ProjectOutlined />
          <Text strong>{t('projects.detail.heading', 'Project')}</Text>
        </Space>
        <Button type="text" size="small" icon={<CloseOutlined />} onClick={onClose} />
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        {isLoading && <Skeleton active paragraph={{ rows: 6 }} />}
        {isError && (
          <Alert type="error" message={t('projects.detail.loadError', 'Failed to load project')} showIcon />
        )}
        {data && <ProjectDetailContent project={data} zoneMap={zoneMap} />}
      </div>
    </div>
  );
}

function ProjectDetailContent({
  project,
  zoneMap,
}: {
  project: ProjectDetailResponse;
  zoneMap: Record<string, string>;
}) {
  const { t } = useTranslation();
  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Space style={{ justifyContent: 'space-between', width: '100%' }}>
        <Title level={5} style={{ margin: 0 }}>{project.name}</Title>
        {lifecycleBadge(project.lifecycleState)}
      </Space>

      {project.projectCode && (
        <Text type="secondary" style={{ fontSize: 12 }}>
          {t('projects.detail.code', 'Code')}: <Text code>{project.projectCode}</Text>
        </Text>
      )}

      <Descriptions size="small" column={1} bordered>
        <Descriptions.Item label={t('projects.detail.zone', 'Zone')}>
          {zoneMap[project.zoneId] ?? project.zoneId}
        </Descriptions.Item>
        {project.projectType && (
          <Descriptions.Item label={t('projects.detail.type', 'Type')}>
            {project.projectType.replace(/_/g, ' ')}
          </Descriptions.Item>
        )}
        {project.targetCompletionYear && (
          <Descriptions.Item label={t('projects.detail.targetYear', 'Target year')}>
            {project.targetCompletionYear}
          </Descriptions.Item>
        )}
        {(project.chainageFromKm != null || project.chainageToKm != null) && (
          <Descriptions.Item label={t('projects.detail.chainage', 'Chainage')}>
            {project.chainageFromKm ?? '?'} – {project.chainageToKm ?? '?'} km
            {project.lengthKm != null && ` (${project.lengthKm} km)`}
          </Descriptions.Item>
        )}
        <Descriptions.Item label={t('projects.detail.state', 'State')}>
          {lifecycleBadge(project.lifecycleState)}
        </Descriptions.Item>
      </Descriptions>
    </Space>
  );
}

// ── Activity Detail Panel ─────────────────────────────────────────────────────

function ActivityDetailPanel({
  activityId,
  onClose,
}: {
  activityId: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { data, isLoading } = useQuery({
    queryKey: ['activity', activityId],
    queryFn: async () => {
      const res = await fetch(`/api/v1/activities/${activityId}`, { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json() as Promise<ActivityDetailResponse>;
    },
    staleTime: 60_000,
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 16px',
        borderBottom: '1px solid var(--ant-color-border)',
      }}>
        <Space>
          <BranchesOutlined />
          <Text strong>{t('activities.detail.heading', 'Activity')}</Text>
        </Space>
        <Button type="text" size="small" icon={<CloseOutlined />} onClick={onClose} />
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        {isLoading && <Skeleton active paragraph={{ rows: 4 }} />}
        {data && (
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <Space style={{ justifyContent: 'space-between', width: '100%' }}>
              <Title level={5} style={{ margin: 0 }}>{data.name || data.activityTypeCode}</Title>
              <Tag color={ACTIVITY_STATUS_COLORS[data.status] ?? 'default'}>
                {data.status.replace(/_/g, ' ')}
              </Tag>
            </Space>
            <Descriptions size="small" column={1} bordered>
              <Descriptions.Item label={t('activities.detail.type', 'Type')}>
                {data.activityTypeCode}
              </Descriptions.Item>
              {data.scopeNotes && (
                <Descriptions.Item label={t('activities.detail.scope', 'Scope notes')}>
                  {data.scopeNotes}
                </Descriptions.Item>
              )}
              {data.targetCompletionDate && (
                <Descriptions.Item label={t('activities.detail.targetDate', 'Target date')}>
                  {data.targetCompletionDate}
                </Descriptions.Item>
              )}
            </Descriptions>
          </Space>
        )}
      </div>
    </div>
  );
}

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
        (p) => p.id === urlProjectCode || (p as unknown as ProjectDetailResponse).projectCode === urlProjectCode,
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
    const activities = activityMap[project.id] ?? [];
    const isExpanded = expandedKeys.includes(projectNodeKey(project.id));
    return {
      key: projectNodeKey(project.id),
      icon: <FolderOutlined />,
      title: (
        <ProjectNodeTitle
          project={project}
          zoneShortName={zoneShortMap[project.zoneId] ?? ''}
        />
      ),
      isLeaf: isExpanded && activities.length === 0,
      children: isExpanded
        ? activities.map((activity) => ({
            key: activityNodeKey(activity.id),
            icon: <BranchesOutlined />,
            title: <ActivityNodeTitle activity={activity} />,
            isLeaf: true,
          }))
        : undefined,
    };
  });

  // ── Tree handlers ─────────────────────────────────────────────────────────────

  const loadActivityData = async (node: DataNode): Promise<void> => {
    const key = String(node.key);
    if (!isProjectKey(key)) return;
    const projectId = projectIdFromKey(key);
    if (activityMap[projectId]) return; // already loaded
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
        // Use project code in URL if available, otherwise use id
        const codeOrId = (proj as unknown as ProjectDetailResponse).projectCode ?? proj.id;
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
          parentCode = (proj as unknown as ProjectDetailResponse).projectCode ?? pId;
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
    const codeOrId = (project as unknown as ProjectDetailResponse).projectCode ?? project.id;
    navigate(`/projects/${codeOrId}`);
  };

  // ── Detail pane content ───────────────────────────────────────────────────────

  const detailPaneContent = selectedKey ? (
    isProjectKey(selectedKey) ? (
      <ProjectDetailPanel
        projectId={projectIdFromKey(selectedKey)}
        onClose={handleClosePane}
      />
    ) : isActivityKey(selectedKey) ? (
      <ActivityDetailPanel
        activityId={activityIdFromKey(selectedKey)}
        onClose={handleClosePane}
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
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        {/* ── Header ─────────────────────────────────────────────────────────── */}
        <Space style={{ width: '100%', justifyContent: 'space-between', flexWrap: 'nowrap' }}>
          <Space direction="vertical" size={0}>
            <Title level={4} style={{ margin: 0 }}>
              {t('projects.title', 'Projects')}
            </Title>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {projectsQuery.data
                ? t('projects.count', '{{count}} projects', { count: projectsQuery.data.length })
                : '…'}
            </Text>
          </Space>

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
                {t('projects.newButton', '+ Add Project')}
              </Button>
            </Tooltip>
          </Space>
        </Space>

        {/* ── Filter bar ─────────────────────────────────────────────────────── */}
        <Space wrap>
          <Search
            placeholder={t('projects.search', 'Search projects, activities, villages…')}
            allowClear
            style={{ width: 320 }}
            prefix={<SearchOutlined />}
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
        </Space>

        {/* ── View toggle ────────────────────────────────────────────────────── */}
        <Segmented
          value={viewMode}
          onChange={(v) => setViewMode(v as 'tree' | 'table')}
          options={[
            { value: 'tree', icon: <AppstoreOutlined />, label: t('projects.viewTree', 'Tree') },
            { value: 'table', icon: <UnorderedListOutlined />, label: t('projects.viewTable', 'Table') },
          ]}
        />

        {/* ── Error ──────────────────────────────────────────────────────────── */}
        {projectsQuery.isError && (
          <Alert
            type="error"
            message={t('projects.loadError', 'Failed to load projects')}
            description={
              projectsQuery.error instanceof Error ? projectsQuery.error.message : undefined
            }
            showIcon
          />
        )}

        {/* ── Main content (tree or table) with optional detail pane ─────────── */}
        <Layout
          style={{
            background: 'transparent',
            minHeight: 400,
            transition: 'all 0.25s',
          }}
        >
          {/* Tree or Table */}
          <Content
            style={{
              width: paneOpen ? '40%' : '100%',
              transition: 'width 0.25s',
              overflow: 'hidden',
            }}
          >
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
                />
              )
            ) : (
              <ProjectsTable
                projects={filteredProjects}
                zoneMap={zoneShortMap}
                onSelect={handleTableSelect}
              />
            )}
          </Content>

          {/* Detail pane */}
          {paneOpen && (
            <Sider
              width="60%"
              style={{
                background: 'var(--ant-color-bg-container)',
                border: '1px solid var(--ant-color-border)',
                borderRadius: 8,
                marginLeft: 16,
                overflow: 'hidden',
              }}
            >
              {detailPaneContent}
            </Sider>
          )}
        </Layout>
      </Space>

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
