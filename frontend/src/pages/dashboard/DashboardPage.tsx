/**
 * DashboardPage — zone + project KPI dashboard.
 *
 * Filter bar:
 *   Zone   — disabled (pre-selected) for single-zone users; enabled for EDGS/C-I
 *             and super-admins who have access to multiple zones.
 *   Project — filtered to the selected zone's project list; optional.
 *
 * When no project is selected → zone-level summary (KPI strip + projects table).
 * When a project is selected  → per-project activity KPI cards.
 */

import { useMemo, useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Alert,
  Badge,
  Card,
  Col,
  Descriptions,
  Divider,
  Flex,
  Row,
  Select,
  Skeleton,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
} from 'antd';
import {
  AlertOutlined,
  BarChartOutlined,
  ClockCircleOutlined,
  FileSearchOutlined,
  ProjectOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import {
  fetchZoneDashboard,
  fetchProjectDashboard,
  type ZoneSummaryDto,
  type ZoneProjectDto,
  type ActivitySummaryDto,
} from '@api/dashboard';
import { useAuthStore } from '@stores/authStore';

dayjs.extend(relativeTime);

const { Text } = Typography;

// ── Constants ─────────────────────────────────────────────────────────────────

const ACTIVITY_LABELS: Record<string, string> = {
  LAND_ACQUISITION:     'Land Acquisition',
  FOREST_CLEARANCE:     'Forest Clearance',
  UTILITY_SHIFTING:     'Utility Shifting',
  DRAWING_APPROVAL:     'Drawing Approval',
  TENDER_PACKAGING:     'Tender Packaging',
  TEMPORARY_OFFICE_SPACE: 'Temp. Office Space',
};

const LIFECYCLE_COLORS: Record<string, string> = {
  DRAFT:                   'default',
  AWAITING_CAO_ALLOCATION: 'orange',
  AWAITING_CEC_ASSIGNMENT: 'gold',
  ACTIVE:                  'green',
  CLOSED:                  'default',
  CANCELLED:               'red',
};

const LIFECYCLE_LABELS: Record<string, string> = {
  DRAFT:                   'Draft',
  AWAITING_CAO_ALLOCATION: 'Awaiting CAO/C',
  AWAITING_CEC_ASSIGNMENT: 'Awaiting CE/C',
  ACTIVE:                  'Active',
  CLOSED:                  'Closed',
  CANCELLED:               'Cancelled',
};

// ── Zone KPI strip ────────────────────────────────────────────────────────────

function ZoneKpiStrip({ zone }: { zone: ZoneSummaryDto }) {
  return (
    <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
      <Col xs={24} sm={8}>
        <Card size="small">
          <Statistic
            title={<Space size={4}><ProjectOutlined />Active Projects</Space>}
            value={zone.projectsActive}
            valueStyle={{ color: 'var(--ant-color-success)' }}
          />
        </Card>
      </Col>
      <Col xs={24} sm={8}>
        <Card size="small">
          <Statistic
            title={<Space size={4}><AlertOutlined />SLA Breaches</Space>}
            value={zone.projectsWithSlaBreaches}
            valueStyle={{ color: zone.projectsWithSlaBreaches > 0 ? 'var(--ant-color-error)' : undefined }}
          />
        </Card>
      </Col>
      <Col xs={24} sm={8}>
        <Card size="small">
          <Statistic
            title={<Space size={4}><FileSearchOutlined />Drawings in Approval</Space>}
            value={zone.totalDrawingsInApproval}
            valueStyle={{ color: 'var(--ant-color-info)' }}
          />
        </Card>
      </Col>
    </Row>
  );
}

// ── Projects table ────────────────────────────────────────────────────────────

function ProjectsTable({
  projects,
  onSelect,
}: {
  projects: ZoneProjectDto[];
  onSelect: (id: string) => void;
}) {
  const columns = [
    {
      title: 'Project',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, row: ZoneProjectDto) => (
        <Space direction="vertical" size={0}>
          <Text
            style={{ fontSize: 13, cursor: 'pointer', color: 'var(--ant-color-primary)' }}
            onClick={() => onSelect(row.projectId)}
          >
            {name}
          </Text>
          {row.projectCode && (
            <Text type="secondary" style={{ fontSize: 11 }}>{row.projectCode}</Text>
          )}
        </Space>
      ),
    },
    {
      title: 'State',
      dataIndex: 'lifecycleState',
      key: 'state',
      width: 140,
      render: (s: string) => (
        <Tag color={LIFECYCLE_COLORS[s] ?? 'default'} style={{ fontSize: 11 }}>
          {LIFECYCLE_LABELS[s] ?? s}
        </Tag>
      ),
    },
    {
      title: <Space size={4}><ClockCircleOutlined />Days since RB</Space>,
      dataIndex: 'daysSinceRbRecommendation',
      key: 'days',
      width: 130,
      align: 'right' as const,
      render: (days: number | null) =>
        days == null ? (
          <Text type="secondary" style={{ fontSize: 12 }}>—</Text>
        ) : (
          <Text
            style={{ fontSize: 12, color: days > 365 ? 'var(--ant-color-error)' : undefined }}
          >
            {days}d
          </Text>
        ),
    },
    {
      title: 'SLA',
      dataIndex: 'slaBreachCount',
      key: 'sla',
      width: 64,
      align: 'center' as const,
      render: (n: number) =>
        n > 0 ? <Badge count={n} size="small" /> : <Text type="secondary" style={{ fontSize: 12 }}>—</Text>,
    },
    {
      title: 'Drawings',
      dataIndex: 'drawingsInApproval',
      key: 'drawings',
      width: 80,
      align: 'right' as const,
      render: (n: number) => <Text style={{ fontSize: 12 }}>{n}</Text>,
    },
  ];

  return (
    <Table
      size="small"
      dataSource={projects}
      rowKey="projectId"
      columns={columns}
      pagination={{ pageSize: 20, hideOnSinglePage: true }}
      locale={{ emptyText: 'No projects in this zone' }}
    />
  );
}

// ── Activity KPI card ─────────────────────────────────────────────────────────

function ActivityKpiCard({ summary }: { summary: ActivitySummaryDto }) {
  const label = ACTIVITY_LABELS[summary.activityTypeCode] ??
    summary.activityTypeCode.toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <Card
      size="small"
      title={label}
      extra={
        <Text type="secondary" style={{ fontSize: 11 }}>
          {dayjs(summary.updatedAt).fromNow()}
        </Text>
      }
      style={{ marginBottom: 16 }}
    >
      <Descriptions size="small" column={3} style={{ marginBottom: 8 }}>
        <Descriptions.Item label="Total">{summary.totalRecords}</Descriptions.Item>
        <Descriptions.Item label="Verified">
          <Text style={{ color: 'var(--ant-color-success)' }}>{summary.verifiedCount}</Text>
        </Descriptions.Item>
        <Descriptions.Item label="Authenticated">
          <Text style={{ color: 'var(--ant-color-info)' }}>{summary.authenticatedCount}</Text>
        </Descriptions.Item>
      </Descriptions>
      <Flex wrap="wrap" gap={6}>
        {summary.draftCount > 0 && <Tag>{summary.draftCount} Draft</Tag>}
        {summary.submittedCount > 0 && <Tag color="processing">{summary.submittedCount} Submitted</Tag>}
        {summary.verifiedCount > 0 && <Tag color="success">{summary.verifiedCount} Verified</Tag>}
        {summary.authenticatedCount > 0 && <Tag color="purple">{summary.authenticatedCount} Authenticated</Tag>}
        {summary.sentBackCount > 0 && <Tag color="warning">{summary.sentBackCount} Sent Back</Tag>}
      </Flex>
    </Card>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const currentUser = useAuthStore((s) => s.currentUser);

  // ── Zone dashboard (zones + project lists) ────────────────────────────────
  const { data: zoneData, isLoading: zonesLoading, error: zonesError } = useQuery({
    queryKey: ['dashboard', 'zone'],
    queryFn: fetchZoneDashboard,
    staleTime: 60_000,
    refetchInterval: 120_000,
    enabled: !!currentUser,
  });

  const zones = zoneData?.zones ?? [];

  // Use the principal's own flags — don't wait for the API response.
  // Super-admin sees all zones; EDGS/C-I typically has multiple accessible zones.
  // Fall back to checking the returned zones list in case accessibleZoneIds is stale.
  const canSwitchZone =
    (currentUser?.isSuperAdmin ?? false) ||
    (currentUser?.accessibleZoneIds?.length ?? 0) > 1 ||
    zones.length > 1;

  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  // Default to first zone once data arrives
  useEffect(() => {
    if (zones.length > 0 && selectedZoneId === null) {
      setSelectedZoneId(zones[0].zoneId);
    }
  }, [zones, selectedZoneId]);

  const selectedZone = useMemo(
    () => zones.find((z) => z.zoneId === selectedZoneId) ?? null,
    [zones, selectedZoneId],
  );

  const projectsInZone: ZoneProjectDto[] = selectedZone?.projects ?? [];

  // When zone changes clear the project selection
  const handleZoneChange = (zoneId: string) => {
    setSelectedZoneId(zoneId);
    setSelectedProjectId(null);
  };

  // ── Project dashboard (activity summaries) ────────────────────────────────
  const { data: projectData, isLoading: projectLoading } = useQuery({
    queryKey: ['dashboard', 'project', selectedProjectId],
    queryFn: () => fetchProjectDashboard(selectedProjectId!),
    enabled: !!selectedProjectId,
    staleTime: 60_000,
    refetchInterval: 60_000,
  });

  // ── Render ────────────────────────────────────────────────────────────────
  if (zonesError) {
    return (
      <Alert type="error" message="Failed to load dashboard" description={String(zonesError)} showIcon />
    );
  }

  const selectedProjectName = projectsInZone.find((p) => p.projectId === selectedProjectId)?.name;

  return (
    <div style={{ height: '100%', overflow: 'auto', padding: '0 4px' }}>
      {/* ── Filter bar ──────────────────────────────────────────────────── */}
      <Flex align="center" gap={12} wrap="wrap" style={{ marginBottom: 20 }}>
        <Space size={4}>
          <Text type="secondary" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>Zone</Text>
          <Select
            style={{ minWidth: 200 }}
            size="small"
            loading={zonesLoading}
            disabled={!canSwitchZone}
            value={selectedZoneId}
            onChange={handleZoneChange}
            options={zones.map((z) => ({ value: z.zoneId, label: `${z.zoneCode} — ${z.zoneName}` }))}
            placeholder="Select zone…"
          />
        </Space>

        <Space size={4}>
          <Text type="secondary" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>Project</Text>
          <Select
            style={{ minWidth: 260 }}
            size="small"
            allowClear
            showSearch
            optionFilterProp="label"
            disabled={!selectedZoneId || projectsInZone.length === 0}
            value={selectedProjectId}
            onChange={(v) => setSelectedProjectId(v ?? null)}
            onClear={() => setSelectedProjectId(null)}
            options={projectsInZone.map((p) => ({
              value: p.projectId,
              label: p.projectCode ? `${p.projectCode} — ${p.name}` : p.name,
            }))}
            placeholder="All projects (zone view)…"
          />
        </Space>

        <Flex align="center" gap={6} style={{ marginLeft: 'auto' }}>
          <BarChartOutlined style={{ color: 'var(--ant-color-text-secondary)', fontSize: 12 }} />
          <Text type="secondary" style={{ fontSize: 12 }}>
            {selectedProjectName
              ? `Project: ${selectedProjectName}`
              : selectedZone
                ? `Zone: ${selectedZone.zoneCode} — ${selectedZone.zoneName}`
                : 'Loading…'}
          </Text>
        </Flex>
      </Flex>

      {/* ── Zone view (no project selected) ─────────────────────────────── */}
      {!selectedProjectId && (
        <>
          {zonesLoading ? (
            <Skeleton active paragraph={{ rows: 6 }} />
          ) : selectedZone ? (
            <>
              <ZoneKpiStrip zone={selectedZone} />
              <Divider orientation="left" orientationMargin={0}
                style={{ fontSize: 12, color: 'var(--ant-color-text-secondary)', margin: '0 0 12px' }}>
                Projects
              </Divider>
              <ProjectsTable
                projects={projectsInZone}
                onSelect={(id) => setSelectedProjectId(id)}
              />
            </>
          ) : null}
        </>
      )}

      {/* ── Project view ─────────────────────────────────────────────────── */}
      {selectedProjectId && (
        <>
          {projectLoading ? (
            <Skeleton active paragraph={{ rows: 8 }} />
          ) : (
            <>
              <Divider orientation="left" orientationMargin={0}
                style={{ fontSize: 12, color: 'var(--ant-color-text-secondary)', margin: '0 0 16px' }}>
                Activity Summary
              </Divider>
              {(projectData?.summaries ?? []).length === 0 ? (
                <Alert
                  type="info"
                  message="No activity data yet"
                  description="Summaries appear once records have been submitted through the workflow."
                  showIcon
                />
              ) : (
                (projectData?.summaries ?? []).map((s) => (
                  <ActivityKpiCard key={s.activityTypeCode} summary={s} />
                ))
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
