/**
 * ProjectsPage — Project List (filters + list; tree/detail-pane removed).
 *
 * Filters: search, status (All / Initiated / Active / Done), zone, project type.
 * Clicking a project opens its full-screen workspace (Phase 4).
 *
 * "+ Add Project" is ALWAYS VISIBLE; DISABLED with tooltip for users lacking
 * PROJECT.CREATE.
 */

import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import {
  Alert,
  Button,
  Dropdown,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  DeleteOutlined,
  ExportOutlined,
  MoreOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import {
  fetchProjects,
  fetchZones,
  removeProject,
  type ProjectSummaryResponse,
} from '@api/projects';
import { useAuthStore } from '@stores/authStore';
import ProjectCreateWizard from './ProjectCreateWizard';

const { Title, Text } = Typography;
const { Search } = Input;

export const PROJECTS_QUERY_KEY = ['projects'] as const;
export const ZONES_QUERY_KEY = ['zones'] as const;

// ── Status buckets (map raw lifecycle states → the 4 filter chips) ──────────────

type StatusBucket = 'ALL' | 'INITIATED' | 'ACTIVE' | 'DONE';

const STATUS_BUCKET: Record<string, Exclude<StatusBucket, 'ALL'>> = {
  DRAFT:                    'INITIATED',
  AWAITING_CAO_ALLOCATION:  'INITIATED',
  AWAITING_CEC_ASSIGNMENT:  'INITIATED',
  ACTIVE:                   'ACTIVE',
  ON_HOLD:                  'ACTIVE',
  COMPLETED:                'DONE',
  CLOSED:                   'DONE',
  DROPPED:                  'DONE',
  REMOVED:                  'DONE',
};

const LIFECYCLE_BADGE: Record<string, { color: string; label: string }> = {
  DRAFT:                   { color: 'default', label: 'Draft' },
  AWAITING_CAO_ALLOCATION: { color: 'orange',  label: 'Awaiting Allocation' },
  AWAITING_CEC_ASSIGNMENT: { color: 'blue',    label: 'Awaiting Assignment' },
  ACTIVE:                  { color: 'green',   label: 'Active' },
  ON_HOLD:                 { color: 'orange',  label: 'On Hold' },
  COMPLETED:               { color: 'cyan',    label: 'Completed' },
  DROPPED:                 { color: 'default', label: 'Dropped' },
  REMOVED:                 { color: 'red',     label: 'Removed' },
  CLOSED:                  { color: 'default', label: 'Closed' },
};

const PROJECT_TYPE_LABEL: Record<string, string> = {
  NEW_LINE:         'New Line',
  DOUBLING:         'Doubling',
  GAUGE_CONVERSION: 'Gauge Conversion',
  ELECTRIFICATION:  'Electrification',
  ROAD_OVER_BRIDGE: 'Road Over Bridge',
  OTHER:            'Other',
};

// Plan Head number for each project type — used to render "PH-11 : New Line" style labels.
const PLAN_HEAD_BY_PROJECT_TYPE: Record<string, string> = {
  NEW_LINE:         '11',
  GAUGE_CONVERSION: '14',
  DOUBLING:         '15',
  ROAD_OVER_BRIDGE: '30',
  ELECTRIFICATION:  '35',
};

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
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 28,
        height: 28,
        borderRadius: 6,
        background: 'var(--ant-color-primary)',
        color: '#fff',
        fontSize: abbr.length > 2 ? 10 : 13,
        fontWeight: 700,
        flexShrink: 0,
      }}
    >
      {abbr}
    </span>
  );
}

// ── Labeled filter control ──────────────────────────────────────────────────────

function FilterField({ label, width, children }: { label: string; width: number; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, width }}>
      <Text style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', color: 'var(--ant-color-text-secondary)', textTransform: 'uppercase' }}>
        {label}
      </Text>
      {children}
    </div>
  );
}

// ── Project list columns (Ant Design Table — same pattern as InboxPage, so
//    header cells are guaranteed to line up with the data below them) ──────────

function useProjectColumns({
  zoneShortMap,
  onOpen,
  onRemove,
}: {
  zoneShortMap: Record<string, string>;
  onOpen: (project: ProjectSummaryResponse) => void;
  onRemove?: (project: ProjectSummaryResponse) => void;
}): ColumnsType<ProjectSummaryResponse> {
  return [
    {
      title: 'Project',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, row) => (
        <Space size={8}>
          <ProjectTypeIcon projectType={row.projectType} />
          <a onClick={() => onOpen(row)} style={{ fontWeight: 600 }}>{name}</a>
        </Space>
      ),
    },
    {
      title: 'Project ID',
      dataIndex: 'projectCode',
      key: 'projectCode',
      render: (code: string | null) => code ?? '—',
    },
    {
      title: 'PH No. & Name',
      dataIndex: 'projectType',
      key: 'projectType',
      render: (projectType: string | null) => projectType
        ? `${PLAN_HEAD_BY_PROJECT_TYPE[projectType] ? `PH-${PLAN_HEAD_BY_PROJECT_TYPE[projectType]} : ` : ''}${PROJECT_TYPE_LABEL[projectType] ?? projectType}`
        : '—',
    },
    {
      title: 'Zone',
      dataIndex: 'zoneId',
      key: 'zoneId',
      render: (zoneId: string) => zoneShortMap[zoneId] || '—',
    },
    {
      // Executing Agency = CAO of the zone the project was created for; no
      // dedicated CAO assignment is exposed on the summary endpoint yet, so
      // this falls back to the zone name until that's wired up.
      title: 'Executing Agency',
      dataIndex: 'zoneId',
      key: 'executingAgency',
      render: (zoneId: string) => (zoneShortMap[zoneId] ? `CAO ${zoneShortMap[zoneId]}` : '—'),
    },
    {
      title: 'Created',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (createdAt: string) => dayjs(createdAt).format('D MMM YYYY'),
      sorter: (a, b) => a.createdAt.localeCompare(b.createdAt),
    },
    {
      title: 'Status',
      dataIndex: 'lifecycleState',
      key: 'lifecycleState',
      render: (state: string) => {
        const badge = LIFECYCLE_BADGE[state] ?? { color: 'default', label: state };
        return <Tag color={badge.color} style={{ margin: 0, borderRadius: 20, fontWeight: 600 }}>{badge.label}</Tag>;
      },
    },
    ...(onRemove ? [{
      title: '',
      key: 'actions',
      width: 48,
      render: (_: unknown, row: ProjectSummaryResponse) => row.lifecycleState === 'REMOVED' ? null : (
        <span onClick={(e: React.MouseEvent) => e.stopPropagation()}>
          <Dropdown
            trigger={['click']}
            menu={{
              items: [
                { key: 'remove', icon: <DeleteOutlined />, label: 'Remove project', danger: true, onClick: () => onRemove(row) },
              ],
            }}
          >
            <Button type="text" size="small" icon={<MoreOutlined />} style={{ color: 'var(--ant-color-text-tertiary)' }} />
          </Dropdown>
        </span>
      ),
    }] : []),
  ];
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ProjectsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const currentUser = useAuthStore((s) => s.currentUser);

  const [wizardOpen, setWizardOpen] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [status, setStatus] = useState<StatusBucket>('ALL');
  const [zoneFilter, setZoneFilter] = useState<string | undefined>(undefined);
  const [typeFilter, setTypeFilter] = useState<string | undefined>(undefined);

  // Only holders of PROJECT.CREATE (EDGS/C-I, Super Admin) may create projects.
  const canCreate = currentUser?.permissions.includes('PROJECT.CREATE') ?? false;
  const isSuperAdmin = currentUser?.isSuperAdmin ?? false;

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

  const zoneShortMap: Record<string, string> = {};
  zonesQuery.data?.forEach((z) => { zoneShortMap[z.id] = z.shortName; });

  const handleRemoveProject = (project: ProjectSummaryResponse) => {
    Modal.confirm({
      title: 'Remove project',
      content: `Remove "${project.name}"? This will mark it as Removed and hide it from all other users.`,
      icon: <DeleteOutlined style={{ color: 'var(--ant-color-error)' }} />,
      okText: 'Remove',
      okType: 'danger',
      cancelText: 'Cancel',
      onOk: async () => {
        const reason = window.prompt('Reason for removal (required):');
        if (!reason?.trim()) return Promise.reject(new Error('Reason is required'));
        await removeProject(project.id, reason.trim());
        void queryClient.invalidateQueries({ queryKey: PROJECTS_QUERY_KEY });
      },
    });
  };

  const openProject = (project: ProjectSummaryResponse) => {
    const codeOrId = project.projectCode ?? project.id;
    navigate(`/workspace/${codeOrId}`);
  };

  // Distinct project types present, for the Type dropdown
  const typeOptions = [...new Set((projectsQuery.data ?? []).map((p) => p.projectType).filter(Boolean) as string[])]
    .map((tp) => ({ value: tp, label: PROJECT_TYPE_LABEL[tp] ?? tp }));

  const filteredProjects = (projectsQuery.data ?? [])
    .filter((p) => {
      const matchesSearch = !searchText || p.name.toLowerCase().includes(searchText.toLowerCase());
      const matchesZone = !zoneFilter || p.zoneId === zoneFilter;
      const matchesType = !typeFilter || p.projectType === typeFilter;
      const matchesStatus = status === 'ALL' || STATUS_BUCKET[p.lifecycleState] === status;
      return matchesSearch && matchesZone && matchesType && matchesStatus;
    })
    .sort((a, b) => {
      if (a.ipaDate && b.ipaDate) return b.ipaDate.localeCompare(a.ipaDate);
      if (a.ipaDate) return -1;
      if (b.ipaDate) return 1;
      return 0;
    });

  const columns = useProjectColumns({
    zoneShortMap,
    onOpen: openProject,
    onRemove: isSuperAdmin ? handleRemoveProject : undefined,
  });

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
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        {/* Header */}
        <div style={{ flexShrink: 0, padding: '16px 24px 0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
            <div>
              <Title level={4} style={{ margin: 0 }}>{t('projects.title', 'Projects')}</Title>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {projectsQuery.data
                  ? t('projects.count', '{{count}} projects', { count: filteredProjects.length })
                  : '…'}
              </Text>
            </div>
            <Space>
              <Button icon={<ExportOutlined />} disabled>{t('projects.export', 'Export')}</Button>
              {canCreate && (
                <Button type="primary" icon={<PlusOutlined />} onClick={() => setWizardOpen(true)}>
                  {t('projects.newButton', 'Add Project')}
                </Button>
              )}
            </Space>
          </div>

          {/* Filter bar — single row, labeled */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'flex-end', marginBottom: 12 }}>
            <FilterField label="Search" width={260}>
              <Search
                placeholder={t('projects.search', 'Search projects…')}
                allowClear
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
              />
            </FilterField>
            <FilterField label="Status" width={160}>
              <Select
                style={{ width: '100%' }}
                value={status}
                onChange={(v) => setStatus(v as StatusBucket)}
                options={[
                  { value: 'ALL', label: 'All' },
                  { value: 'INITIATED', label: 'Initiated' },
                  { value: 'ACTIVE', label: 'Active' },
                  { value: 'DONE', label: 'Done' },
                ]}
              />
            </FilterField>
            <FilterField label="Zone" width={200}>
              <Select
                style={{ width: '100%' }}
                value={zoneFilter ?? ''}
                onChange={(v) => setZoneFilter(v || undefined)}
                loading={zonesQuery.isLoading}
                options={[
                  { value: '', label: 'All' },
                  ...(zonesQuery.data?.map((z) => ({ value: z.id, label: `${z.shortName} — ${z.name}` })) ?? []),
                ]}
              />
            </FilterField>
            <FilterField label="Type of Project" width={200}>
              <Select
                style={{ width: '100%' }}
                value={typeFilter ?? ''}
                onChange={(v) => setTypeFilter(v || undefined)}
                options={[{ value: '', label: 'All' }, ...typeOptions]}
              />
            </FilterField>
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'flex-end' }}>
              <Button
                onClick={() => { setSearchText(''); setStatus('ALL'); setZoneFilter(undefined); setTypeFilter(undefined); }}
              >
                Reset filters
              </Button>
            </div>
          </div>

          {projectsQuery.isError && (
            <Alert
              type="error"
              message={t('projects.loadError', 'Failed to load projects')}
              description={projectsQuery.error instanceof Error ? projectsQuery.error.message : undefined}
              showIcon
              style={{ marginBottom: 8 }}
            />
          )}
        </div>

        {/* List — a real antd Table (same as InboxPage), so header cells are
            guaranteed to line up with the data below them. */}
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 24px 20px' }}>
          <Table<ProjectSummaryResponse>
            rowKey="id"
            columns={columns}
            dataSource={filteredProjects}
            loading={projectsQuery.isLoading}
            size="small"
            pagination={{ pageSize: 20 }}
            onRow={(row) => ({ onClick: () => openProject(row), style: { cursor: 'pointer' } })}
            locale={{ emptyText: t('projects.empty', 'No projects match your filters.') }}
          />
        </div>
      </div>

      <ProjectCreateWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onCreated={() => { queryClient.invalidateQueries({ queryKey: PROJECTS_QUERY_KEY }); }}
      />
    </>
  );
}
