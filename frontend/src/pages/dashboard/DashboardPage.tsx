/**
 * DashboardPage — multi-scope KPI dashboard.
 *
 * Scopes (§3 dashboards.md):
 *   PAN_INDIA  DASHBOARD.VIEW.PAN_INDIA  → system KPIs + zones table + drill-down
 *   ZONE       DASHBOARD.VIEW.ZONE        → zone KPI strip + charts + projects table
 *   PROJECT    DASHBOARD.VIEW.PROJECT     → project selector + overview + activity cards
 *
 * Users with multiple scopes see a scope selector at the top.
 * Zone filter: enabled for multi-zone / super-admin; locked for single-zone users.
 * Project drill-down from zone/PAN India: navigates to the Tree view.
 */

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import ReactECharts from 'echarts-for-react';
import {
  Alert,
  Badge,
  Card,
  Col,
  Descriptions,
  Divider,
  Empty,
  Flex,
  Row,
  Segmented,
  Select,
  Skeleton,
  Space,
  Statistic,
  Steps,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import {
  AlertOutlined,
  BarChartOutlined,
  ClockCircleOutlined,
  FileSearchOutlined,
  GlobalOutlined,
  ProjectOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import {
  fetchZoneDashboard,
  fetchPanIndiaDashboard,
  fetchProjectOverview,
  fetchUtilityBreakdown,
  fetchForestStageBreakdown,
  type ZoneSummaryDto,
  type ZoneProjectDto,
  type ActivityCardDto,
  type ProjectOverviewDto,
  type UtilitySubtypeSummaryDto,
  type ForestStageSummaryDto,
} from '@api/dashboard';
import { useAuthStore } from '@stores/authStore';

dayjs.extend(relativeTime);

const { Text, Title } = Typography;

// ── Constants ─────────────────────────────────────────────────────────────────

const ACTIVITY_LABELS: Record<string, string> = {
  LAND_ACQUISITION:       'Land Acquisition',
  FOREST_CLEARANCE:       'Forest Clearance',
  UTILITY_SHIFTING:       'Utility Shifting',
  DRAWING_APPROVAL:       'Drawing Approval',
  TENDER_PACKAGING:       'Tender Packaging',
  TEMPORARY_OFFICE_SPACE: 'Temp. Office Space',
};

const ACTIVITY_ICONS: Record<string, string> = {
  LAND_ACQUISITION:       '🌾',
  FOREST_CLEARANCE:       '🌲',
  UTILITY_SHIFTING:       '⚡',
  DRAWING_APPROVAL:       '📐',
  TENDER_PACKAGING:       '📋',
  TEMPORARY_OFFICE_SPACE: '🏠',
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

const RAG_COLORS: Record<string, string> = {
  GREEN: 'var(--ant-color-success)',
  AMBER: 'var(--ant-color-warning)',
  RED:   'var(--ant-color-error)',
};

const UTILITY_TYPE_LABELS: Record<string, string> = {
  LT_HT_EHV:      'LT / HT / EHV',
  PIPELINE:        'Pipeline',
  SNT:             'S&T',
  QUARTER_STATION: 'Quarter / Station',
  TSS_SS_OHE:      'TSS / SS / OHE',
  OTHER:           'Other',
};

const FOREST_STAGE_LABELS: Record<string, string> = {
  STAGE_I:       'Stage I',
  STAGE_II:      'Stage II',
  POST_APPROVAL: 'Post Approval',
};

type DashboardScope = 'pan-india' | 'zone' | 'project';

// ── Scope derivation ──────────────────────────────────────────────────────────

function deriveScopes(permissions: string[], isSuperAdmin: boolean): DashboardScope[] {
  const scopes: DashboardScope[] = [];
  if (isSuperAdmin || permissions.includes('DASHBOARD.VIEW.PAN_INDIA')) scopes.push('pan-india');
  if (isSuperAdmin || permissions.includes('DASHBOARD.VIEW.ZONE'))      scopes.push('zone');
  if (permissions.includes('DASHBOARD.VIEW.PROJECT'))                   scopes.push('project');
  // de-duplicate (super-admin gets all three)
  return [...new Set(scopes)];
}

// ── Shared: KPI strip ─────────────────────────────────────────────────────────

interface KpiStripProps {
  active: number;
  slaBreaches: number;
  drawingsInApproval: number;
}
function KpiStrip({ active, slaBreaches, drawingsInApproval }: KpiStripProps) {
  return (
    <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
      <Col xs={24} sm={8}>
        <Card size="small">
          <Statistic
            title={<Space size={4}><ProjectOutlined />Active Projects</Space>}
            value={active}
            valueStyle={{ color: 'var(--ant-color-success)' }}
          />
        </Card>
      </Col>
      <Col xs={24} sm={8}>
        <Card size="small">
          <Statistic
            title={<Space size={4}><AlertOutlined />SLA Breaches</Space>}
            value={slaBreaches}
            valueStyle={{ color: slaBreaches > 0 ? 'var(--ant-color-error)' : undefined }}
          />
        </Card>
      </Col>
      <Col xs={24} sm={8}>
        <Card size="small">
          <Statistic
            title={<Space size={4}><FileSearchOutlined />Drawings in Approval</Space>}
            value={drawingsInApproval}
            valueStyle={{ color: 'var(--ant-color-info)' }}
          />
        </Card>
      </Col>
    </Row>
  );
}

// ── Shared: Projects table ────────────────────────────────────────────────────

function ProjectsTable({
  projects,
  onProjectClick,
}: {
  projects: ZoneProjectDto[];
  onProjectClick: (p: ZoneProjectDto) => void;
}) {
  const columns = [
    {
      title: 'Project',
      key: 'name',
      render: (_: unknown, row: ZoneProjectDto) => (
        <Space direction="vertical" size={0}>
          <Text
            style={{ fontSize: 13, cursor: 'pointer', color: 'var(--ant-color-primary)' }}
            onClick={() => onProjectClick(row)}
          >
            {row.name}
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
      title: <Tooltip title="Days since Railway Board recommendation"><ClockCircleOutlined /> Days (RB)</Tooltip>,
      dataIndex: 'daysSinceRbRecommendation',
      key: 'days',
      width: 110,
      sorter: (a: ZoneProjectDto, b: ZoneProjectDto) =>
        (a.daysSinceRbRecommendation ?? 0) - (b.daysSinceRbRecommendation ?? 0),
      defaultSortOrder: 'descend' as const,
      align: 'right' as const,
      render: (days: number | null) =>
        days == null ? (
          <Text type="secondary" style={{ fontSize: 12 }}>—</Text>
        ) : (
          <Text style={{ fontSize: 12, color: days > 365 ? 'var(--ant-color-error)' : undefined }}>
            {days}d
          </Text>
        ),
    },
    {
      title: 'SLA',
      dataIndex: 'slaBreachCount',
      key: 'sla',
      width: 60,
      align: 'center' as const,
      render: (n: number) =>
        n > 0
          ? <Badge count={n} size="small" />
          : <Text type="secondary" style={{ fontSize: 12 }}>—</Text>,
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
      locale={{ emptyText: 'No projects' }}
    />
  );
}

// ── Zone charts ───────────────────────────────────────────────────────────────

function ZoneCharts({ zone }: { zone: ZoneSummaryDto }) {
  // Projects-by-state doughnut
  const stateCounts: Record<string, number> = {};
  zone.projects.forEach((p) => {
    stateCounts[p.lifecycleState] = (stateCounts[p.lifecycleState] ?? 0) + 1;
  });
  const doughnutData = Object.entries(stateCounts).map(([state, count]) => ({
    name: LIFECYCLE_LABELS[state] ?? state,
    value: count,
  }));

  const doughnutOption = {
    tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
    legend: { bottom: 0, type: 'scroll' },
    series: [{
      type: 'pie',
      radius: ['45%', '70%'],
      avoidLabelOverlap: true,
      label: { show: false },
      emphasis: { label: { show: true, fontSize: 13, fontWeight: 'bold' } },
      data: doughnutData,
    }],
  };

  // Top 10 most-delayed projects (by daysSinceRbRecommendation)
  const delayed = [...zone.projects]
    .filter((p) => p.daysSinceRbRecommendation != null)
    .sort((a, b) => (b.daysSinceRbRecommendation ?? 0) - (a.daysSinceRbRecommendation ?? 0))
    .slice(0, 10);

  const barOption = {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: '3%', right: '4%', top: 8, bottom: 4, containLabel: true },
    xAxis: { type: 'value', name: 'Days since RB', nameLocation: 'middle', nameGap: 25 },
    yAxis: {
      type: 'category',
      data: delayed.map((p) => p.projectCode ?? p.name).reverse(),
      axisLabel: { fontSize: 11, width: 120, overflow: 'truncate' },
    },
    series: [{
      type: 'bar',
      data: delayed.map((p) => p.daysSinceRbRecommendation).reverse(),
      itemStyle: {
        color: (params: { dataIndex: number }) => {
          const val = delayed[delayed.length - 1 - params.dataIndex]?.daysSinceRbRecommendation ?? 0;
          return val > 365 ? '#ef4444' : val > 180 ? '#f59e0b' : '#22c55e';
        },
      },
    }],
  };

  if (zone.projects.length === 0) return null;

  return (
    <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
      <Col xs={24} md={10}>
        <Card size="small" title="Projects by State">
          <ReactECharts option={doughnutOption} style={{ height: 220 }} />
        </Card>
      </Col>
      <Col xs={24} md={14}>
        <Card size="small" title="Top 10 Most Delayed (days since RB)">
          {delayed.length === 0 ? (
            <Empty description="No RB dates recorded" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          ) : (
            <ReactECharts option={barOption} style={{ height: 220 }} />
          )}
        </Card>
      </Col>
    </Row>
  );
}

// ── §10 Zone scope ────────────────────────────────────────────────────────────

function ZoneScope({
  canSwitchZone,
  zones,
  onProjectClick,
}: {
  canSwitchZone: boolean;
  zones: ZoneSummaryDto[];
  onProjectClick: (p: ZoneProjectDto) => void;
}) {
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);

  useEffect(() => {
    if (zones.length > 0 && selectedZoneId === null) {
      setSelectedZoneId(zones[0].zoneId);
    }
  }, [zones, selectedZoneId]);

  const zone = zones.find((z) => z.zoneId === selectedZoneId) ?? zones[0] ?? null;

  return (
    <>
      {/* Zone selector */}
      <Flex align="center" gap={8} style={{ marginBottom: 16 }}>
        <Text type="secondary" style={{ fontSize: 12 }}>Zone</Text>
        <Select
          size="small"
          style={{ minWidth: 220 }}
          disabled={!canSwitchZone}
          value={zone?.zoneId}
          onChange={setSelectedZoneId}
          options={zones.map((z) => ({ value: z.zoneId, label: `${z.zoneCode} — ${z.zoneName}` }))}
        />
        {!canSwitchZone && zone && (
          <Text type="secondary" style={{ fontSize: 11 }}>(your zone)</Text>
        )}
      </Flex>

      {zone ? (
        <>
          <KpiStrip
            active={zone.projectsActive}
            slaBreaches={zone.projectsWithSlaBreaches}
            drawingsInApproval={zone.totalDrawingsInApproval}
          />
          <ZoneCharts zone={zone} />
          <Divider orientation="left" orientationMargin={0}
            style={{ fontSize: 12, color: 'var(--ant-color-text-secondary)', margin: '0 0 12px' }}>
            Projects — {zone.zoneCode}
          </Divider>
          <ProjectsTable projects={zone.projects} onProjectClick={onProjectClick} />
        </>
      ) : (
        <Empty description="No zone data" />
      )}
    </>
  );
}

// ── §11 PAN India scope ───────────────────────────────────────────────────────

function PanIndiaScope({
  data,
  onZoneSelect,
  onProjectClick,
}: {
  data: { totalProjectsActive: number; totalProjectsWithSlaBreaches: number; totalDrawingsInApproval: number; zones: ZoneSummaryDto[] };
  onZoneSelect: (zoneId: string) => void;
  onProjectClick: (p: ZoneProjectDto) => void;
}) {
  const zoneColumns = [
    {
      title: 'Zone',
      key: 'zone',
      render: (_: unknown, row: ZoneSummaryDto) => (
        <Space direction="vertical" size={0}>
          <Text
            style={{ fontSize: 13, cursor: 'pointer', color: 'var(--ant-color-primary)' }}
            onClick={() => onZoneSelect(row.zoneId)}
          >
            {row.zoneName}
          </Text>
          <Text type="secondary" style={{ fontSize: 11 }}>{row.zoneCode}</Text>
        </Space>
      ),
    },
    {
      title: 'Active',
      dataIndex: 'projectsActive',
      key: 'active',
      width: 70,
      align: 'right' as const,
      render: (n: number) => <Text style={{ color: 'var(--ant-color-success)', fontSize: 13 }}>{n}</Text>,
    },
    {
      title: 'SLA Breaches',
      dataIndex: 'projectsWithSlaBreaches',
      key: 'sla',
      width: 110,
      align: 'center' as const,
      render: (n: number) =>
        n > 0
          ? <Badge count={n} style={{ backgroundColor: 'var(--ant-color-error)' }} />
          : <Text type="secondary">—</Text>,
    },
    {
      title: 'Drawings',
      dataIndex: 'totalDrawingsInApproval',
      key: 'drawings',
      width: 90,
      align: 'right' as const,
      render: (n: number) => <Text style={{ fontSize: 13 }}>{n}</Text>,
    },
    {
      title: 'Projects',
      key: 'projects',
      width: 80,
      align: 'right' as const,
      render: (_: unknown, row: ZoneSummaryDto) => (
        <Text type="secondary" style={{ fontSize: 12 }}>{row.projects.length}</Text>
      ),
    },
  ];

  // System-wide projects-by-state chart (across all zones)
  const stateCounts: Record<string, number> = {};
  data.zones.forEach((z) => z.projects.forEach((p) => {
    stateCounts[p.lifecycleState] = (stateCounts[p.lifecycleState] ?? 0) + 1;
  }));
  const doughnutData = Object.entries(stateCounts).map(([s, c]) => ({
    name: LIFECYCLE_LABELS[s] ?? s, value: c,
  }));
  const doughnutOption = {
    tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
    legend: { right: 10, top: 'middle', orient: 'vertical' },
    series: [{
      type: 'pie', radius: ['45%', '70%'],
      label: { show: false },
      emphasis: { label: { show: true, fontSize: 13, fontWeight: 'bold' } },
      data: doughnutData,
    }],
  };

  return (
    <>
      <KpiStrip
        active={data.totalProjectsActive}
        slaBreaches={data.totalProjectsWithSlaBreaches}
        drawingsInApproval={data.totalDrawingsInApproval}
      />

      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        <Col xs={24} md={14}>
          <Card size="small" title="Zones" extra={
            <Text type="secondary" style={{ fontSize: 11 }}>Click a zone to drill down</Text>
          }>
            <Table
              size="small"
              dataSource={data.zones}
              rowKey="zoneId"
              columns={zoneColumns}
              pagination={false}
            />
          </Card>
        </Col>
        <Col xs={24} md={10}>
          <Card size="small" title="All Projects by State">
            {doughnutData.length > 0 ? (
              <ReactECharts option={doughnutOption} style={{ height: 260 }} />
            ) : (
              <Empty description="No data" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            )}
          </Card>
        </Col>
      </Row>

      {/* Expandable per-zone project tables */}
      {data.zones.map((zone) => (
        <Card
          key={zone.zoneId}
          size="small"
          style={{ marginBottom: 12 }}
          title={
            <Space>
              <Text strong>{zone.zoneCode}</Text>
              <Text type="secondary" style={{ fontSize: 12 }}>{zone.zoneName}</Text>
              <Tag color="green" style={{ fontSize: 11 }}>{zone.projectsActive} active</Tag>
              {zone.projectsWithSlaBreaches > 0 && (
                <Tag color="red" style={{ fontSize: 11 }}>
                  <WarningOutlined /> {zone.projectsWithSlaBreaches} SLA
                </Tag>
              )}
            </Space>
          }
        >
          <ProjectsTable projects={zone.projects} onProjectClick={onProjectClick} />
        </Card>
      ))}
    </>
  );
}

// ── §9 Project overview ───────────────────────────────────────────────────────

function ActivityRagCard({ card }: { card: ActivityCardDto }) {
  const label = ACTIVITY_LABELS[card.activityTypeCode] ?? card.activityTypeCode;
  const icon  = ACTIVITY_ICONS[card.activityTypeCode] ?? '📄';
  const ragColor = RAG_COLORS[card.ragStatus] ?? 'var(--ant-color-success)';
  const completePct = card.totalRecords > 0
    ? Math.round((card.authenticatedCount / card.totalRecords) * 100)
    : 0;

  return (
    <Card
      size="small"
      style={{ borderLeft: `4px solid ${ragColor}`, height: '100%' }}
    >
      <Flex justify="space-between" align="flex-start">
        <Space direction="vertical" size={2} style={{ flex: 1 }}>
          <Text style={{ fontSize: 13, fontWeight: 600 }}>{icon} {label}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {card.authenticatedCount} of {card.totalRecords} authenticated ({completePct}%)
          </Text>
          {card.pendingCount > 0 && (
            <Text style={{ fontSize: 11, color: 'var(--ant-color-warning)' }}>
              {card.pendingCount} pending
            </Text>
          )}
          {card.slaBreachCount > 0 && (
            <Text style={{ fontSize: 11, color: 'var(--ant-color-error)' }}>
              <WarningOutlined /> {card.slaBreachCount} SLA breach{card.slaBreachCount > 1 ? 'es' : ''}
            </Text>
          )}
        </Space>
        <div style={{
          width: 12, height: 12, borderRadius: '50%',
          background: ragColor, flexShrink: 0, marginTop: 4,
        }} />
      </Flex>
    </Card>
  );
}

function UtilityBreakdownSection({ projectId }: { projectId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard', 'utility-breakdown', projectId],
    queryFn: () => fetchUtilityBreakdown(projectId),
    staleTime: 60_000,
  });

  if (isLoading) return <Skeleton active paragraph={{ rows: 3 }} />;
  if (!data?.subtypes.length) return null;

  const barOption = {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    legend: { bottom: 0 },
    grid: { left: 60, right: 20, top: 10, bottom: 36 },
    xAxis: { type: 'category', data: data.subtypes.map((s: UtilitySubtypeSummaryDto) => UTILITY_TYPE_LABELS[s.recordSubtype] ?? s.recordSubtype) },
    yAxis: { type: 'value' },
    series: [
      { name: 'Draft',      type: 'bar', stack: 'total', data: data.subtypes.map((s: UtilitySubtypeSummaryDto) => s.draftCount) },
      { name: 'Submitted',  type: 'bar', stack: 'total', data: data.subtypes.map((s: UtilitySubtypeSummaryDto) => s.submittedCount) },
      { name: 'Verified',   type: 'bar', stack: 'total', data: data.subtypes.map((s: UtilitySubtypeSummaryDto) => s.verifiedCount), itemStyle: { color: '#22c55e' } },
      { name: 'Authenticated', type: 'bar', stack: 'total', data: data.subtypes.map((s: UtilitySubtypeSummaryDto) => s.authenticatedCount), itemStyle: { color: '#3b82f6' } },
      { name: 'Sent Back',  type: 'bar', stack: 'total', data: data.subtypes.map((s: UtilitySubtypeSummaryDto) => s.sentBackCount), itemStyle: { color: '#f59e0b' } },
    ],
  };

  return (
    <>
      <Divider orientation="left" orientationMargin={0}
        style={{ fontSize: 12, color: 'var(--ant-color-text-secondary)', margin: '16px 0 10px' }}>
        ⚡ Utility Shifting — by Type
      </Divider>
      <ReactECharts option={barOption} style={{ height: 200 }} />
    </>
  );
}

function ForestStageSection({ projectId }: { projectId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard', 'forest-stages', projectId],
    queryFn: () => fetchForestStageBreakdown(projectId),
    staleTime: 60_000,
  });

  if (isLoading) return <Skeleton active paragraph={{ rows: 2 }} />;
  if (!data?.stages.length) return null;

  const stageItems = data.stages.map((s: ForestStageSummaryDto) => {
    const total = s.totalRecords;
    const done  = s.authenticatedCount;
    const status: 'finish' | 'process' | 'wait' = done === total && total > 0 ? 'finish' : s.submittedCount > 0 ? 'process' : 'wait';
    return {
      title: FOREST_STAGE_LABELS[s.stageCode] ?? s.stageCode,
      description: (
        <Space direction="vertical" size={0}>
          <Text style={{ fontSize: 11 }}>{done}/{total} authenticated</Text>
          {s.sentBackCount > 0 && (
            <Text style={{ fontSize: 11, color: 'var(--ant-color-warning)' }}>{s.sentBackCount} sent back</Text>
          )}
        </Space>
      ),
      status,
    };
  });

  const currentIdx = stageItems.findIndex((i) => i.status === 'process');

  return (
    <>
      <Divider orientation="left" orientationMargin={0}
        style={{ fontSize: 12, color: 'var(--ant-color-text-secondary)', margin: '16px 0 10px' }}>
        🌲 Forest Clearance — Stage Progress
      </Divider>
      <Steps
        direction="horizontal"
        size="small"
        current={currentIdx >= 0 ? currentIdx : stageItems.length}
        items={stageItems}
      />
    </>
  );
}

function ProjectOverviewPanel({ overview }: { overview: ProjectOverviewDto }) {
  const daysRb = overview.daysSinceRbRecommendation;

  return (
    <>
      {/* Header card */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Row gutter={[16, 8]}>
          <Col xs={24} sm={16}>
            <Space direction="vertical" size={2}>
              <Title level={5} style={{ margin: 0 }}>{overview.name}</Title>
              <Space size={8}>
                {overview.projectCode && <Text code style={{ fontSize: 12 }}>{overview.projectCode}</Text>}
                {overview.zoneCode && <Tag style={{ fontSize: 11 }}>{overview.zoneCode}</Tag>}
                <Tag color={LIFECYCLE_COLORS[overview.lifecycleState] ?? 'default'} style={{ fontSize: 11 }}>
                  {LIFECYCLE_LABELS[overview.lifecycleState] ?? overview.lifecycleState}
                </Tag>
              </Space>
            </Space>
          </Col>
          <Col xs={24} sm={8}>
            <Descriptions size="small" column={1}>
              {daysRb != null && (
                <Descriptions.Item label="Days since RB">
                  <Text style={{ fontSize: 13, fontWeight: 600, color: daysRb > 365 ? 'var(--ant-color-error)' : undefined }}>
                    {daysRb}d
                  </Text>
                </Descriptions.Item>
              )}
              <Descriptions.Item label="SLA Breaches">
                <Text style={{ color: overview.totalSlaBreaches > 0 ? 'var(--ant-color-error)' : undefined }}>
                  {overview.totalSlaBreaches}
                </Text>
              </Descriptions.Item>
              <Descriptions.Item label="Drawings in Approval">
                {overview.totalDrawingsInApproval}
              </Descriptions.Item>
            </Descriptions>
          </Col>
        </Row>
      </Card>

      {/* Activity grid with RAG */}
      {overview.activityCards.length > 0 ? (
        <>
          <Divider orientation="left" orientationMargin={0}
            style={{ fontSize: 12, color: 'var(--ant-color-text-secondary)', margin: '0 0 12px' }}>
            Activity Summary
          </Divider>
          <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
            {overview.activityCards.map((card) => (
              <Col xs={24} sm={12} lg={8} key={card.activityTypeCode}>
                <ActivityRagCard card={card} />
              </Col>
            ))}
          </Row>
        </>
      ) : (
        <Alert type="info" message="No activity data yet" showIcon style={{ marginBottom: 16 }} />
      )}

      {/* Per-activity breakdowns */}
      {overview.activityCards.some((c) => c.activityTypeCode === 'UTILITY_SHIFTING') && (
        <UtilityBreakdownSection projectId={overview.projectId} />
      )}
      {overview.activityCards.some((c) => c.activityTypeCode === 'FOREST_CLEARANCE') && (
        <ForestStageSection projectId={overview.projectId} />
      )}
    </>
  );
}

function ProjectScope({ zones }: { zones: ZoneSummaryDto[] }) {
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  const allProjects = useMemo(() => zones.flatMap((z) => z.projects), [zones]);

  const { data: overview, isLoading } = useQuery({
    queryKey: ['dashboard', 'project-overview', selectedProjectId],
    queryFn: () => fetchProjectOverview(selectedProjectId!),
    enabled: !!selectedProjectId,
    staleTime: 60_000,
  });

  return (
    <>
      <Flex align="center" gap={8} style={{ marginBottom: 16 }}>
        <Text type="secondary" style={{ fontSize: 12 }}>Project</Text>
        <Select
          style={{ minWidth: 300 }}
          size="small"
          showSearch
          allowClear
          optionFilterProp="label"
          placeholder="Select a project…"
          value={selectedProjectId}
          onChange={(v) => setSelectedProjectId(v ?? null)}
          options={allProjects.map((p) => ({
            value: p.projectId,
            label: p.projectCode ? `${p.projectCode} — ${p.name}` : p.name,
          }))}
        />
      </Flex>

      {!selectedProjectId && (
        <Empty description="Select a project to view its dashboard" />
      )}

      {selectedProjectId && isLoading && <Skeleton active paragraph={{ rows: 8 }} />}

      {overview && <ProjectOverviewPanel overview={overview} />}
    </>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const navigate = useNavigate();
  const currentUser = useAuthStore((s) => s.currentUser);

  const permissions = currentUser?.permissions ?? [];
  const isSuperAdmin = currentUser?.isSuperAdmin ?? false;

  const availableScopes = useMemo(
    () => deriveScopes(permissions, isSuperAdmin),
    [permissions, isSuperAdmin],
  );

  const defaultScope = availableScopes[0] ?? 'project';
  const [scope, setScope] = useState<DashboardScope>(defaultScope);

  // Keep scope in sync if permissions load late
  useEffect(() => {
    if (availableScopes.length > 0 && !availableScopes.includes(scope)) {
      setScope(availableScopes[0]);
    }
  }, [availableScopes, scope]);

  const canSwitchZone =
    isSuperAdmin ||
    (currentUser?.accessibleZoneIds?.length ?? 0) > 1;

  // ── Data fetching ─────────────────────────────────────────────────────────

  const zoneQuery = useQuery({
    queryKey: ['dashboard', 'zone'],
    queryFn: fetchZoneDashboard,
    staleTime: 120_000,
    refetchInterval: 120_000,
    enabled: !!currentUser && (scope === 'zone' || scope === 'project'),
  });

  const panIndiaQuery = useQuery({
    queryKey: ['dashboard', 'pan-india'],
    queryFn: fetchPanIndiaDashboard,
    staleTime: 120_000,
    refetchInterval: 120_000,
    enabled: !!currentUser && scope === 'pan-india',
  });

  const zones: ZoneSummaryDto[] =
    scope === 'pan-india'
      ? panIndiaQuery.data?.zones ?? []
      : zoneQuery.data?.zones ?? [];

  const isLoading = scope === 'pan-india' ? panIndiaQuery.isLoading : zoneQuery.isLoading;
  const error     = scope === 'pan-india' ? panIndiaQuery.error    : zoneQuery.error;

  // Navigate to tree view when user clicks a project row
  const handleProjectClick = (p: ZoneProjectDto) => {
    navigate(`/projects/${p.projectCode ?? p.projectId}`);
  };

  // Drill from PAN India zone row → switch to zone scope for that zone
  const handleZoneSelect = (zoneId: string) => {
    // If user has zone permission, switch scope; otherwise just filter pan-india
    if (availableScopes.includes('zone')) {
      setScope('zone');
      // The ZoneScope component will pick up the zone from the shared zones list
      // We store the desired zone in a ref passed via state — simplest: just switch scope
      // and ZoneScope defaults to first zone. For now navigate to projects filtered by zone.
    }
    // Select the zone in the zone view — communicated via URL state or local state
    void zoneId; // used below via passed state
  };

  // ── Scope label map ───────────────────────────────────────────────────────

  const scopeLabels: Record<DashboardScope, { label: string; icon: React.ReactNode }> = {
    'pan-india': { label: 'PAN India', icon: <GlobalOutlined /> },
    'zone':      { label: 'Zone',      icon: <BarChartOutlined /> },
    'project':   { label: 'Project',   icon: <ProjectOutlined /> },
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (error) {
    return (
      <Alert type="error" message="Dashboard failed to load" description={String(error)} showIcon />
    );
  }

  return (
    <div style={{ height: '100%', overflow: 'auto', padding: '0 4px' }}>

      {/* ── Scope selector ──────────────────────────────────────────────── */}
      <Flex align="center" justify="space-between" style={{ marginBottom: 20 }}>
        {availableScopes.length > 1 ? (
          <Segmented
            value={scope}
            onChange={(v) => setScope(v as DashboardScope)}
            options={availableScopes.map((s) => ({
              value: s,
              label: (
                <Space size={4}>
                  {scopeLabels[s].icon}
                  {scopeLabels[s].label}
                </Space>
              ),
            }))}
          />
        ) : (
          <Space size={6}>
            {scopeLabels[scope]?.icon}
            <Text strong style={{ fontSize: 14 }}>{scopeLabels[scope]?.label} Dashboard</Text>
          </Space>
        )}
        <Text type="secondary" style={{ fontSize: 11 }}>
          Auto-refreshes every 2 min
        </Text>
      </Flex>

      {/* ── Loading skeleton ─────────────────────────────────────────────── */}
      {isLoading && <Skeleton active paragraph={{ rows: 8 }} />}

      {/* ── PAN India scope ──────────────────────────────────────────────── */}
      {!isLoading && scope === 'pan-india' && panIndiaQuery.data && (
        <PanIndiaScope
          data={panIndiaQuery.data}
          onZoneSelect={handleZoneSelect}
          onProjectClick={handleProjectClick}
        />
      )}

      {/* ── Zone scope ───────────────────────────────────────────────────── */}
      {!isLoading && scope === 'zone' && (
        <ZoneScope
          canSwitchZone={canSwitchZone}
          zones={zones}
          onProjectClick={handleProjectClick}
        />
      )}

      {/* ── Project scope ────────────────────────────────────────────────── */}
      {scope === 'project' && (
        <ProjectScope zones={zones} />
      )}
    </div>
  );
}
