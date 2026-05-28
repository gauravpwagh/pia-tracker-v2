/**
 * DashboardPage — multi-scope KPI dashboard.
 *
 * Scopes (dashboards.md §3):
 *   PAN_INDIA  DASHBOARD.VIEW.PAN_INDIA  → system KPIs + zones table + drill-down (§11)
 *   ZONE       DASHBOARD.VIEW.ZONE        → zone KPI strip + charts + projects table (§10)
 *   PROJECT    DASHBOARD.VIEW.PROJECT     → project overview + per-activity detail sections (§4-9)
 *
 * Per-activity detail sections (§4-8) open inside the project scope:
 *   § 4 Land Acquisition  — KPI strip, ownership chart, villages table
 *   § 5 Utility Shifting  — KPI strip, by-type chart, by-agency doughnut, records table
 *   § 6 Forest Clearance  — KPI strip, stage progress, records table
 *   § 7 Drawing Approval  — KPI strip, by-type table, approver heatmap
 *   § 8 Tender / Office   — KPI strip, records table
 *
 * Layout rule: no horizontal scroll — all content is full-width, vertically stacked.
 */

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import ReactECharts from 'echarts-for-react';
import {
  Badge,
  Card,
  Col,
  Collapse,
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
  fetchProjectDashboard,
  fetchUtilityBreakdown,
  fetchForestStageBreakdown,
  fetchDashboardRecords,
  fetchDrawingApproverMatrix,
  type ZoneSummaryDto,
  type ZoneProjectDto,
  type ActivityCardDto,
  type ProjectOverviewDto,
  type ActivitySummaryDto,
  type UtilitySubtypeSummaryDto,
  type ForestStageSummaryDto,
  type DashboardRecordDto,
  type DrawingApproverMatrixDto,
} from '@api/dashboard';
import { fetchProjects, type ProjectSummaryResponse } from '@api/projects';
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

const LIFECYCLE_LABELS: Record<string, string> = {
  DRAFT:                      'Draft',
  AWAITING_CAO_ALLOCATION:    'Awaiting CAO Allocation',
  AWAITING_CEC_ASSIGNMENT:    'Awaiting CE/C Assignment',
  IN_PROGRESS:                'In Progress',
  COMPLETED:                  'Completed',
  ON_HOLD:                    'On Hold',
};

const LIFECYCLE_COLORS: Record<string, string> = {
  DRAFT:                      '#8b9aab',
  AWAITING_CAO_ALLOCATION:    '#d97706',
  AWAITING_CEC_ASSIGNMENT:    '#d97706',
  IN_PROGRESS:                '#2563eb',
  COMPLETED:                  '#16a34a',
  ON_HOLD:                    '#dc2626',
};

const STATE_COLORS: Record<string, string> = {
  DRAFT:         '#8b9aab',
  SUBMITTED:     '#2563eb',
  VERIFIED:      '#7c3aed',
  AUTHENTICATED: '#16a34a',
  SENT_BACK:     '#dc2626',
};

const STATE_LABELS: Record<string, string> = {
  DRAFT:         'Draft',
  SUBMITTED:     'Submitted',
  VERIFIED:      'Verified',
  AUTHENTICATED: 'Authenticated',
  SENT_BACK:     'Sent Back',
};

const UTILITY_TYPE_LABELS: Record<string, string> = {
  OVERHEAD_LINE:  'Overhead Line (OHT)',
  WATER_PIPELINE: 'Water Pipeline',
  NALA:           'Nala/Drain',
  TELECOM_CABLE:  'Telecom Cable',
  GAS_PIPELINE:   'Gas Pipeline',
};

const FOREST_STAGE_LABELS: Record<string, string> = {
  stage_i:       'Stage I',
  stage_ii:      'Stage II',
  post_approval: 'Post-Approval',
};

const DRAWING_TYPE_LABELS: Record<string, string> = {
  BRIDGE:         'Bridge',
  CULVERT:        'Culvert',
  FORMATION:      'Formation',
  ESP:            'ESP',
  STATION:        'Station',
  ELECTRIFICATION:'Electrification',
  SIGNALLING:     'Signalling',
  OTHER:          'Other',
  UNKNOWN:        'Unknown',
};

type DashboardScope = 'pan-india' | 'zone' | 'project';

// ── Helpers ───────────────────────────────────────────────────────────────────

function deriveScopes(permissions: string[], isSuperAdmin: boolean): DashboardScope[] {
  const scopes: DashboardScope[] = [];
  if (isSuperAdmin || permissions.includes('DASHBOARD.VIEW.PAN_INDIA')) scopes.push('pan-india');
  if (isSuperAdmin || permissions.includes('DASHBOARD.VIEW.ZONE'))      scopes.push('zone');
  if (permissions.includes('DASHBOARD.VIEW.PROJECT'))                   scopes.push('project');
  return [...new Set(scopes)];
}

function num(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return parseFloat(v) || 0;
  return 0;
}

function str(v: unknown): string {
  return v == null ? '' : String(v);
}

// ── Shared sub-components ─────────────────────────────────────────────────────

/** 3-card KPI row — active / SLA breaches / drawings in approval. */
function KpiStrip({
  active, slaBreaches, drawingsInApproval,
}: { active: number; slaBreaches: number; drawingsInApproval: number }) {
  return (
    <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
      <Col xs={24} sm={8}>
        <Card size="small">
          <Statistic title="Active Projects" value={active}
            prefix={<ProjectOutlined />}
            valueStyle={{ color: 'var(--ant-color-primary)' }} />
        </Card>
      </Col>
      <Col xs={24} sm={8}>
        <Card size="small">
          <Statistic title="SLA Breaches" value={slaBreaches}
            prefix={<AlertOutlined />}
            valueStyle={{ color: slaBreaches > 0 ? 'var(--ant-color-error)' : undefined }} />
        </Card>
      </Col>
      <Col xs={24} sm={8}>
        <Card size="small">
          <Statistic title="Drawings in Approval" value={drawingsInApproval}
            prefix={<FileSearchOutlined />}
            valueStyle={{ color: drawingsInApproval > 0 ? 'var(--ant-color-warning)' : undefined }} />
        </Card>
      </Col>
    </Row>
  );
}

/** Activity-level KPI strip using ActivitySummaryDto data. */
function ActivityKpiStrip({ summary }: { summary: ActivitySummaryDto }) {
  const pending = summary.totalRecords - summary.authenticatedCount;
  return (
    <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
      <Col xs={12} sm={6}>
        <Card size="small">
          <Statistic title="Total Records" value={summary.totalRecords}
            valueStyle={{ fontSize: 20 }} />
        </Card>
      </Col>
      <Col xs={12} sm={6}>
        <Card size="small">
          <Statistic title="Authenticated" value={summary.authenticatedCount}
            valueStyle={{ fontSize: 20, color: 'var(--ant-color-success)' }} />
        </Card>
      </Col>
      <Col xs={12} sm={6}>
        <Card size="small">
          <Statistic title="Pending" value={pending}
            valueStyle={{ fontSize: 20, color: pending > 0 ? 'var(--ant-color-warning)' : undefined }} />
        </Card>
      </Col>
      <Col xs={12} sm={6}>
        <Card size="small">
          <Statistic title="SLA Breaches" value={summary.slaBreachCount}
            valueStyle={{ fontSize: 20, color: summary.slaBreachCount > 0 ? 'var(--ant-color-error)' : undefined }} />
        </Card>
      </Col>
    </Row>
  );
}

/** Projects table used in zone + PAN India scopes. */
function ProjectsTable({
  projects, onProjectClick,
}: { projects: ZoneProjectDto[]; onProjectClick: (p: ZoneProjectDto) => void }) {
  const columns = [
    {
      title: 'Project',
      key: 'name',
      render: (_: unknown, p: ZoneProjectDto) => (
        <Space direction="vertical" size={0}>
          <Text
            style={{ cursor: 'pointer', color: 'var(--ant-color-primary)' }}
            onClick={() => onProjectClick(p)}
          >
            {p.name}
          </Text>
          {p.projectCode && <Text type="secondary" style={{ fontSize: 11 }}>{p.projectCode}</Text>}
          {p.divisionName && <Text type="secondary" style={{ fontSize: 11 }}>{p.divisionName}</Text>}
        </Space>
      ),
    },
    {
      title: 'State',
      dataIndex: 'lifecycleState',
      key: 'state',
      width: 130,
      render: (s: string) => (
        <Tag color={LIFECYCLE_COLORS[s] ? undefined : 'default'}
          style={{ background: LIFECYCLE_COLORS[s] ?? undefined, color: LIFECYCLE_COLORS[s] ? '#fff' : undefined, fontSize: 11 }}>
          {LIFECYCLE_LABELS[s] ?? s}
        </Tag>
      ),
    },
    {
      title: 'Days (RB)',
      dataIndex: 'daysSinceRbRecommendation',
      key: 'daysRb',
      width: 90,
      align: 'right' as const,
      render: (d: number | null) => d == null ? (
        <Text type="secondary">—</Text>
      ) : (
        <Text style={{ color: d > 365 ? 'var(--ant-color-error)' : undefined, fontWeight: d > 365 ? 600 : undefined }}>
          {d}
        </Text>
      ),
    },
    {
      title: 'SLA',
      dataIndex: 'slaBreachCount',
      key: 'sla',
      width: 60,
      align: 'right' as const,
      render: (n: number) => n > 0
        ? <Badge count={n} style={{ backgroundColor: 'var(--ant-color-error)' }} />
        : <Text type="secondary">—</Text>,
    },
    {
      title: 'Drawings',
      dataIndex: 'drawingsInApproval',
      key: 'drawings',
      width: 80,
      align: 'right' as const,
      render: (n: number) => n > 0
        ? <Text style={{ color: 'var(--ant-color-warning)' }}>{n}</Text>
        : <Text type="secondary">—</Text>,
    },
  ];
  return (
    <Table
      size="small"
      dataSource={projects}
      rowKey="projectId"
      columns={columns}
      pagination={projects.length > 15 ? { pageSize: 15, size: 'small' } : false}
      scroll={{ x: undefined }}
      onRow={(p) => ({ onClick: () => onProjectClick(p), style: { cursor: 'pointer' } })}
    />
  );
}

// ── §10 Zone scope components ─────────────────────────────────────────────────

function ZoneCharts({ zones }: { zones: ZoneSummaryDto[] }) {
  const stateCounts: Record<string, number> = {};
  zones.forEach((z) => z.projects.forEach((p) => {
    stateCounts[p.lifecycleState] = (stateCounts[p.lifecycleState] ?? 0) + 1;
  }));
  const doughnutData = Object.entries(stateCounts).map(([s, c]) => ({
    name: LIFECYCLE_LABELS[s] ?? s, value: c,
    itemStyle: { color: LIFECYCLE_COLORS[s] },
  }));

  const allProjects = zones.flatMap((z) => z.projects);
  const delayed = [...allProjects]
    .filter((p) => p.daysSinceRbRecommendation != null)
    .sort((a, b) => (b.daysSinceRbRecommendation ?? 0) - (a.daysSinceRbRecommendation ?? 0))
    .slice(0, 10);

  const barOption = {
    tooltip: { trigger: 'axis' },
    grid: { left: 120, right: 20, top: 10, bottom: 30 },
    xAxis: { type: 'value', name: 'Days' },
    yAxis: {
      type: 'category',
      data: delayed.map((p) => p.projectCode ?? p.name.slice(0, 15)),
      axisLabel: { fontSize: 11 },
    },
    series: [{
      type: 'bar', data: delayed.map((p) => ({
        value: p.daysSinceRbRecommendation,
        itemStyle: { color: (p.daysSinceRbRecommendation ?? 0) > 365 ? '#dc2626' : '#d97706' },
      })),
    }],
  };

  return (
    <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
      <Col xs={24} md={10}>
        <Card size="small" title="Projects by State">
          {doughnutData.length > 0 ? (
            <ReactECharts option={{
              tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
              legend: { bottom: 0, type: 'scroll' },
              series: [{
                type: 'pie', radius: ['40%', '65%'],
                label: { show: false },
                emphasis: { label: { show: true, fontSize: 13, fontWeight: 'bold' } },
                data: doughnutData,
              }],
            }} style={{ height: 220 }} />
          ) : (
            <Empty description="No data" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          )}
        </Card>
      </Col>
      <Col xs={24} md={14}>
        <Card size="small" title="Top 10 Most Delayed Projects (days since RB)">
          {delayed.length > 0 ? (
            <ReactECharts option={barOption} style={{ height: 220 }} />
          ) : (
            <Empty description="No data" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          )}
        </Card>
      </Col>
    </Row>
  );
}

function ZoneScope({
  zones, canSwitchZone, onProjectClick,
}: { zones: ZoneSummaryDto[]; canSwitchZone: boolean; onProjectClick: (p: ZoneProjectDto) => void }) {
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);

  useEffect(() => {
    if (zones.length > 0 && selectedZoneId === null) {
      setSelectedZoneId(zones[0].zoneId);
    }
  }, [zones, selectedZoneId]);

  const zone = zones.find((z) => z.zoneId === selectedZoneId) ?? zones[0] ?? null;
  if (!zone) return <Empty description="No zone data" />;

  return (
    <>
      <Flex align="center" gap={8} style={{ marginBottom: 16 }}>
        <Text type="secondary" style={{ fontSize: 12 }}>Zone</Text>
        <Select
          style={{ minWidth: 200 }}
          size="small"
          value={selectedZoneId}
          onChange={setSelectedZoneId}
          disabled={!canSwitchZone}
          options={zones.map((z) => ({ value: z.zoneId, label: `${z.zoneCode} — ${z.zoneName}` }))}
        />
      </Flex>

      <KpiStrip
        active={zone.projectsActive}
        slaBreaches={zone.projectsWithSlaBreaches}
        drawingsInApproval={zone.totalDrawingsInApproval}
      />

      <ZoneCharts zones={[zone]} />

      <Card size="small" title={`Projects — ${zone.zoneCode}`}>
        <ProjectsTable projects={zone.projects} onProjectClick={onProjectClick} />
      </Card>
    </>
  );
}

// ── §11 PAN India scope ───────────────────────────────────────────────────────

function PanIndiaScope({
  data, onZoneDrillDown, onProjectClick,
}: {
  data: { totalProjectsActive: number; totalProjectsWithSlaBreaches: number; totalDrawingsInApproval: number; zones: ZoneSummaryDto[] };
  onZoneDrillDown: (zoneId: string) => void;
  onProjectClick: (p: ZoneProjectDto) => void;
}) {
  const stateCounts: Record<string, number> = {};
  data.zones.forEach((z) => z.projects.forEach((p) => {
    stateCounts[p.lifecycleState] = (stateCounts[p.lifecycleState] ?? 0) + 1;
  }));
  const doughnutData = Object.entries(stateCounts).map(([s, c]) => ({
    name: LIFECYCLE_LABELS[s] ?? s, value: c,
    itemStyle: { color: LIFECYCLE_COLORS[s] },
  }));

  const zoneColumns = [
    {
      title: 'Zone',
      key: 'zone',
      render: (_: unknown, row: ZoneSummaryDto) => (
        <Text
          style={{ cursor: 'pointer', color: 'var(--ant-color-primary)' }}
          onClick={() => onZoneDrillDown(row.zoneId)}
        >
          {row.zoneCode} — {row.zoneName}
        </Text>
      ),
    },
    {
      title: 'Active',
      dataIndex: 'projectsActive',
      key: 'active',
      width: 70,
      align: 'right' as const,
      sorter: (a: ZoneSummaryDto, b: ZoneSummaryDto) => a.projectsActive - b.projectsActive,
    },
    {
      title: 'SLA',
      dataIndex: 'projectsWithSlaBreaches',
      key: 'sla',
      width: 60,
      align: 'right' as const,
      sorter: (a: ZoneSummaryDto, b: ZoneSummaryDto) => a.projectsWithSlaBreaches - b.projectsWithSlaBreaches,
      render: (n: number) => n > 0
        ? <Badge count={n} style={{ backgroundColor: 'var(--ant-color-error)' }} />
        : <Text type="secondary">—</Text>,
    },
    {
      title: 'Drawings',
      dataIndex: 'totalDrawingsInApproval',
      key: 'drawings',
      width: 80,
      align: 'right' as const,
      sorter: (a: ZoneSummaryDto, b: ZoneSummaryDto) => a.totalDrawingsInApproval - b.totalDrawingsInApproval,
      render: (n: number) => n > 0
        ? <Text style={{ color: 'var(--ant-color-warning)' }}>{n}</Text>
        : <Text type="secondary">—</Text>,
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
            <Text type="secondary" style={{ fontSize: 11 }}>Click zone to drill down</Text>
          }>
            <Table
              size="small"
              dataSource={data.zones}
              rowKey="zoneId"
              columns={zoneColumns}
              pagination={false}
              onRow={(row) => ({ onClick: () => onZoneDrillDown(row.zoneId), style: { cursor: 'pointer' } })}
            />
          </Card>
        </Col>
        <Col xs={24} md={10}>
          <Card size="small" title="All Projects by State">
            {doughnutData.length > 0 ? (
              <ReactECharts option={{
                tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
                legend: { bottom: 0, type: 'scroll' },
                series: [{
                  type: 'pie', radius: ['40%', '65%'],
                  label: { show: false },
                  emphasis: { label: { show: true, fontSize: 13, fontWeight: 'bold' } },
                  data: doughnutData,
                }],
              }} style={{ height: 260 }} />
            ) : (
              <Empty description="No data" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            )}
          </Card>
        </Col>
      </Row>

      {data.zones.map((zone) => (
        <Card
          key={zone.zoneId}
          size="small"
          style={{ marginBottom: 12 }}
          title={
            <Space>
              <Text strong>{zone.zoneCode}</Text>
              <Text type="secondary" style={{ fontSize: 12 }}>{zone.zoneName}</Text>
              <Tag color="blue" style={{ fontSize: 11 }}>{zone.projectsActive} active</Tag>
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

// ── §9 RAG card ────────────────────────────────────────────────────────────────

const RAG_COLORS = { GREEN: '#16a34a', AMBER: '#d97706', RED: '#dc2626' };

function ActivityRagCard({
  card, onClick, isExpanded,
}: { card: ActivityCardDto; onClick?: () => void; isExpanded?: boolean }) {
  const rag = card.ragStatus as 'GREEN' | 'AMBER' | 'RED';
  const pct = card.totalRecords > 0
    ? Math.round((card.authenticatedCount / card.totalRecords) * 100)
    : 0;

  return (
    <Card
      size="small"
      hoverable={!!onClick}
      onClick={onClick}
      style={{
        borderLeft: `4px solid ${RAG_COLORS[rag] ?? '#8b9aab'}`,
        cursor: onClick ? 'pointer' : 'default',
        marginBottom: 8,
        outline: isExpanded ? `2px solid ${RAG_COLORS[rag] ?? '#8b9aab'}` : undefined,
        outlineOffset: -1,
      }}
    >
      <Flex align="flex-start" justify="space-between">
        <Space direction="vertical" size={2}>
          <Space size={4}>
            <span style={{ fontSize: 16 }}>{ACTIVITY_ICONS[card.activityTypeCode] ?? '📎'}</span>
            <Text strong style={{ fontSize: 13 }}>
              {ACTIVITY_LABELS[card.activityTypeCode] ?? card.activityTypeCode}
            </Text>
          </Space>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {card.authenticatedCount} / {card.totalRecords} authenticated ({pct}%)
          </Text>
          {card.pendingCount > 0 && (
            <Text style={{ fontSize: 11, color: 'var(--ant-color-warning)' }}>
              {card.pendingCount} pending
            </Text>
          )}
          {card.slaBreachCount > 0 && (
            <Text style={{ fontSize: 11, color: 'var(--ant-color-error)' }}>
              <WarningOutlined /> {card.slaBreachCount} SLA breaches
            </Text>
          )}
        </Space>
        <Space direction="vertical" size={4} style={{ alignItems: 'flex-end', flexShrink: 0 }}>
          <div style={{
            width: 12, height: 12, borderRadius: '50%',
            background: RAG_COLORS[rag] ?? '#8b9aab',
          }} />
          {onClick && (
            <Text style={{ fontSize: 10, color: 'var(--ant-color-text-tertiary)' }}>
              {isExpanded ? '▲' : '▼'}
            </Text>
          )}
        </Space>
      </Flex>
    </Card>
  );
}

// ── §4 Land Acquisition section ───────────────────────────────────────────────

function LandAcquisitionSection({
  projectId, summary,
}: { projectId: string; summary?: ActivitySummaryDto }) {
  const { data: records = [], isLoading } = useQuery({
    queryKey: ['dashboard', 'records', projectId, 'LAND_ACQUISITION'],
    queryFn: () => fetchDashboardRecords(projectId, 'LAND_ACQUISITION'),
    staleTime: 60_000,
  });

  const totalHa   = records.reduce((s, r) => s + num(r.dataJson.area_hectares_total),   0);
  const privateHa = records.reduce((s, r) => s + num(r.dataJson.area_hectares_private), 0);
  const govtHa    = records.reduce((s, r) => s + num(r.dataJson.area_hectares_govt),    0);
  const forestHa  = records.reduce((s, r) => s + num(r.dataJson.area_hectares_forest),  0);
  const authenticatedRecords = records.filter((r) => r.recordState === 'AUTHENTICATED');
  const acquiredHa = authenticatedRecords.reduce((s, r) => s + num(r.dataJson.area_hectares_total), 0);
  const balanceHa  = Math.max(0, totalHa - acquiredHa);
  const pct = totalHa > 0 ? Math.round((acquiredHa / totalHa) * 100) : 0;

  const ownershipData = [
    { name: 'Private', value: privateHa, itemStyle: { color: '#2563eb' } },
    { name: 'Govt', value: govtHa, itemStyle: { color: '#16a34a' } },
    { name: 'Forest', value: forestHa, itemStyle: { color: '#7c3aed' } },
  ].filter((d) => d.value > 0);

  const ownershipChartOption = ownershipData.length > 0 ? {
    tooltip: { trigger: 'item', formatter: '{b}: {c} ha ({d}%)' },
    legend: { bottom: 0, type: 'scroll' },
    series: [{
      type: 'pie', radius: ['40%', '65%'],
      label: { show: false },
      emphasis: { label: { show: true, fontSize: 13 } },
      data: ownershipData,
    }],
  } : null;

  const villagesColumns = [
    {
      title: 'Village',
      key: 'village',
      render: (_: unknown, r: DashboardRecordDto) => (
        <Space direction="vertical" size={0}>
          <Text style={{ fontSize: 13 }}>{str(r.dataJson.village_name) || '—'}</Text>
          {!!r.dataJson.district && (
            <Text type="secondary" style={{ fontSize: 11 }}>{str(r.dataJson.district)}</Text>
          )}
        </Space>
      ),
    },
    {
      title: 'Chainage',
      key: 'chainage',
      width: 140,
      render: (_: unknown, r: DashboardRecordDto) => (
        <Text style={{ fontSize: 12 }}>
          {str(r.dataJson.village_chainage_from) || '—'} – {str(r.dataJson.village_chainage_to) || '—'}
        </Text>
      ),
    },
    {
      title: 'Area (ha)',
      key: 'area',
      width: 90,
      align: 'right' as const,
      render: (_: unknown, r: DashboardRecordDto) => (
        <Text>{num(r.dataJson.area_hectares_total).toFixed(2)}</Text>
      ),
    },
    {
      title: 'State',
      dataIndex: 'recordState',
      key: 'state',
      width: 110,
      render: (s: string) => (
        <Tag style={{ fontSize: 11, background: STATE_COLORS[s] ?? undefined, color: STATE_COLORS[s] ? '#fff' : undefined }}>
          {STATE_LABELS[s] ?? s}
        </Tag>
      ),
    },
  ];

  return (
    <>
      {summary && <ActivityKpiStrip summary={summary} />}

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={6}>
          <Card size="small">
            <Statistic title="Total Area (ha)" value={totalHa.toFixed(2)} valueStyle={{ fontSize: 18 }} />
          </Card>
        </Col>
        <Col xs={24} sm={6}>
          <Card size="small">
            <Statistic title="Acquired (ha)" value={acquiredHa.toFixed(2)}
              valueStyle={{ fontSize: 18, color: 'var(--ant-color-success)' }} />
          </Card>
        </Col>
        <Col xs={24} sm={6}>
          <Card size="small">
            <Statistic title="Balance (ha)" value={balanceHa.toFixed(2)}
              valueStyle={{ fontSize: 18, color: balanceHa > 0 ? 'var(--ant-color-warning)' : undefined }} />
          </Card>
        </Col>
        <Col xs={24} sm={6}>
          <Card size="small">
            <Statistic title="Acquired %" value={`${pct}%`}
              valueStyle={{ fontSize: 18, color: pct >= 80 ? 'var(--ant-color-success)' : undefined }} />
          </Card>
        </Col>
      </Row>

      {ownershipChartOption && (
        <Card size="small" title="Land by Ownership Type" style={{ marginBottom: 16 }}>
          <Row gutter={[16, 0]}>
            <Col xs={24} md={12}>
              <ReactECharts option={ownershipChartOption} style={{ height: 200 }} />
            </Col>
            <Col xs={24} md={12}>
              <Descriptions size="small" column={1} style={{ marginTop: 8 }}>
                <Descriptions.Item label="Private">{privateHa.toFixed(2)} ha</Descriptions.Item>
                <Descriptions.Item label="Govt">{govtHa.toFixed(2)} ha</Descriptions.Item>
                <Descriptions.Item label="Forest">{forestHa.toFixed(2)} ha</Descriptions.Item>
              </Descriptions>
            </Col>
          </Row>
        </Card>
      )}

      <Card size="small" title={`Villages (${records.length})`}>
        {isLoading ? (
          <Skeleton active paragraph={{ rows: 4 }} />
        ) : (
          <Table
            size="small"
            dataSource={records}
            rowKey="id"
            columns={villagesColumns}
            pagination={records.length > 20 ? { pageSize: 20, size: 'small' } : false}
            scroll={{ x: undefined }}
          />
        )}
      </Card>
    </>
  );
}

// ── §5 Utility Shifting section ───────────────────────────────────────────────

function UtilityShiftingSection({
  projectId, summary,
}: { projectId: string; summary?: ActivitySummaryDto }) {
  const { data: subtypes = [], isLoading: subtypeLoading } = useQuery({
    queryKey: ['dashboard', 'utility-breakdown', projectId],
    queryFn: () => fetchUtilityBreakdown(projectId),
    staleTime: 60_000,
    select: (d) => d.subtypes,
  });

  const { data: records = [], isLoading: recLoading } = useQuery({
    queryKey: ['dashboard', 'records', projectId, 'UTILITY_SHIFTING'],
    queryFn: () => fetchDashboardRecords(projectId, 'UTILITY_SHIFTING'),
    staleTime: 60_000,
  });

  // By-type stacked bar
  const barOption = subtypes.length > 0 ? {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    legend: { bottom: 0, type: 'scroll' },
    grid: { left: 140, right: 20, top: 10, bottom: 50 },
    xAxis: { type: 'value' },
    yAxis: {
      type: 'category',
      data: subtypes.map((s: UtilitySubtypeSummaryDto) => UTILITY_TYPE_LABELS[s.recordSubtype] ?? s.recordSubtype),
      axisLabel: { fontSize: 11 },
    },
    series: [
      { name: 'Authenticated', type: 'bar', stack: 'total', itemStyle: { color: '#16a34a' },
        data: subtypes.map((s: UtilitySubtypeSummaryDto) => s.authenticatedCount) },
      { name: 'In Progress',   type: 'bar', stack: 'total', itemStyle: { color: '#2563eb' },
        data: subtypes.map((s: UtilitySubtypeSummaryDto) => s.submittedCount + s.verifiedCount) },
      { name: 'Draft',         type: 'bar', stack: 'total', itemStyle: { color: '#8b9aab' },
        data: subtypes.map((s: UtilitySubtypeSummaryDto) => s.draftCount) },
      { name: 'Sent Back',     type: 'bar', stack: 'total', itemStyle: { color: '#dc2626' },
        data: subtypes.map((s: UtilitySubtypeSummaryDto) => s.sentBackCount) },
    ],
  } : null;

  // By-agency doughnut from records
  const agencyCounts: Record<string, number> = {};
  records.forEach((r) => {
    const ag = str(r.dataJson.agency_name) || 'Unknown';
    agencyCounts[ag] = (agencyCounts[ag] ?? 0) + 1;
  });
  const agencyData = Object.entries(agencyCounts).map(([name, value]) => ({ name, value }));

  const recordsColumns = [
    {
      title: 'Location',
      key: 'loc',
      render: (_: unknown, r: DashboardRecordDto) => (
        <Space direction="vertical" size={0}>
          <Text style={{ fontSize: 12 }}>{str(r.dataJson.location_description) || '—'}</Text>
          <Text type="secondary" style={{ fontSize: 11 }}>
            {str(r.dataJson.chainage_from) || '—'} – {str(r.dataJson.chainage_to) || '—'}
          </Text>
        </Space>
      ),
    },
    {
      title: 'Type',
      dataIndex: ['dataJson', 'utility_type'],
      key: 'type',
      width: 110,
      render: (t: unknown) => <Text style={{ fontSize: 12 }}>{UTILITY_TYPE_LABELS[str(t)] ?? (str(t) || '—')}</Text>,
    },
    {
      title: 'Agency',
      key: 'agency',
      width: 140,
      render: (_: unknown, r: DashboardRecordDto) => (
        <Text style={{ fontSize: 12 }}>{str(r.dataJson.agency_name) || '—'}</Text>
      ),
    },
    {
      title: 'State',
      dataIndex: 'recordState',
      key: 'state',
      width: 110,
      render: (s: string) => (
        <Tag style={{ fontSize: 11, background: STATE_COLORS[s], color: '#fff' }}>
          {STATE_LABELS[s] ?? s}
        </Tag>
      ),
    },
  ];

  return (
    <>
      {summary && <ActivityKpiStrip summary={summary} />}

      {(subtypeLoading || recLoading) ? (
        <Skeleton active paragraph={{ rows: 4 }} />
      ) : (
        <>
          <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
            {barOption && (
              <Col xs={24} md={14}>
                <Card size="small" title="By Utility Type">
                  <ReactECharts option={barOption}
                    style={{ height: Math.max(160, subtypes.length * 36 + 80) }} />
                </Card>
              </Col>
            )}
            {agencyData.length > 0 && (
              <Col xs={24} md={10}>
                <Card size="small" title="By Executing Agency">
                  <ReactECharts option={{
                    tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
                    legend: { bottom: 0, type: 'scroll' },
                    series: [{
                      type: 'pie', radius: ['40%', '65%'],
                      label: { show: false },
                      emphasis: { label: { show: true, fontSize: 13 } },
                      data: agencyData,
                    }],
                  }} style={{ height: 220 }} />
                </Card>
              </Col>
            )}
          </Row>

          <Card size="small" title={`Records (${records.length})`}>
            <Table
              size="small"
              dataSource={records}
              rowKey="id"
              columns={recordsColumns}
              pagination={records.length > 20 ? { pageSize: 20, size: 'small' } : false}
              scroll={{ x: undefined }}
            />
          </Card>
        </>
      )}
    </>
  );
}

// ── §6 Forest Clearance section ───────────────────────────────────────────────

function ForestClearanceSection({
  projectId, summary,
}: { projectId: string; summary?: ActivitySummaryDto }) {
  const { data: stages = [], isLoading: stageLoading } = useQuery({
    queryKey: ['dashboard', 'forest-stages', projectId],
    queryFn: () => fetchForestStageBreakdown(projectId),
    staleTime: 60_000,
    select: (d) => d.stages,
  });

  const { data: records = [], isLoading: recLoading } = useQuery({
    queryKey: ['dashboard', 'records', projectId, 'FOREST_CLEARANCE'],
    queryFn: () => fetchDashboardRecords(projectId, 'FOREST_CLEARANCE'),
    staleTime: 60_000,
  });

  const stageItems = stages.map((s: ForestStageSummaryDto) => {
    const done  = s.authenticatedCount;
    const total = s.totalRecords;
    const status: 'finish' | 'process' | 'wait' =
      done === total && total > 0 ? 'finish' : s.submittedCount > 0 ? 'process' : 'wait';
    return {
      title: FOREST_STAGE_LABELS[s.stageCode] ?? s.stageCode,
      description: (
        <Space direction="vertical" size={0}>
          <Text style={{ fontSize: 11 }}>{done}/{total} authenticated</Text>
          {s.sentBackCount > 0 && (
            <Text style={{ fontSize: 11, color: 'var(--ant-color-warning)' }}>
              {s.sentBackCount} sent back
            </Text>
          )}
        </Space>
      ),
      status,
    };
  });

  const recordsColumns = [
    {
      title: 'Forest Division',
      key: 'division',
      render: (_: unknown, r: DashboardRecordDto) => (
        <Space direction="vertical" size={0}>
          <Text style={{ fontSize: 12 }}>{str(r.dataJson.forest_division_name) || '—'}</Text>
          <Text type="secondary" style={{ fontSize: 11 }}>
            {str(r.dataJson.project_chainage_from) || '—'} – {str(r.dataJson.project_chainage_to) || '—'}
          </Text>
        </Space>
      ),
    },
    {
      title: 'Area (ha)',
      key: 'area',
      width: 90,
      align: 'right' as const,
      render: (_: unknown, r: DashboardRecordDto) => (
        <Text>{num(r.dataJson.forest_area_hectares).toFixed(2)}</Text>
      ),
    },
    {
      title: 'Stage I',
      key: 's1',
      width: 90,
      render: (_: unknown, r: DashboardRecordDto) => {
        const s = r.dataJson.stage_i as Record<string, unknown> | undefined;
        const submitted = s?.submitted_on as string | undefined;
        return submitted
          ? <Tag color="blue" style={{ fontSize: 10 }}>{dayjs(submitted).format('DD MMM YY')}</Tag>
          : <Text type="secondary" style={{ fontSize: 11 }}>Pending</Text>;
      },
    },
    {
      title: 'Stage II',
      key: 's2',
      width: 90,
      render: (_: unknown, r: DashboardRecordDto) => {
        const s = r.dataJson.stage_ii as Record<string, unknown> | undefined;
        const submitted = s?.submitted_on as string | undefined;
        return submitted
          ? <Tag color="purple" style={{ fontSize: 10 }}>{dayjs(submitted).format('DD MMM YY')}</Tag>
          : <Text type="secondary" style={{ fontSize: 11 }}>Pending</Text>;
      },
    },
    {
      title: 'State',
      dataIndex: 'recordState',
      key: 'state',
      width: 110,
      render: (s: string) => (
        <Tag style={{ fontSize: 11, background: STATE_COLORS[s], color: '#fff' }}>
          {STATE_LABELS[s] ?? s}
        </Tag>
      ),
    },
  ];

  return (
    <>
      {summary && <ActivityKpiStrip summary={summary} />}

      {stageItems.length > 0 && (
        <Card size="small" title="Stage Progress" style={{ marginBottom: 16 }}>
          <Steps
            direction="horizontal"
            size="small"
            current={stageItems.findIndex((i) => i.status === 'process')}
            items={stageItems}
          />
        </Card>
      )}

      {(stageLoading || recLoading) ? (
        <Skeleton active paragraph={{ rows: 4 }} />
      ) : (
        <Card size="small" title={`Records (${records.length})`}>
          <Table
            size="small"
            dataSource={records}
            rowKey="id"
            columns={recordsColumns}
            pagination={records.length > 20 ? { pageSize: 20, size: 'small' } : false}
            scroll={{ x: undefined }}
          />
        </Card>
      )}
    </>
  );
}

// ── §7 Drawing Approval section ───────────────────────────────────────────────

function DrawingApprovalSection({
  projectId, summary,
}: { projectId: string; summary?: ActivitySummaryDto }) {
  const { data: records = [], isLoading: recLoading } = useQuery({
    queryKey: ['dashboard', 'records', projectId, 'DRAWING_APPROVAL'],
    queryFn: () => fetchDashboardRecords(projectId, 'DRAWING_APPROVAL'),
    staleTime: 60_000,
  });

  const { data: matrix, isLoading: matrixLoading } = useQuery({
    queryKey: ['dashboard', 'drawing-approver-matrix', projectId],
    queryFn: () => fetchDrawingApproverMatrix(projectId),
    staleTime: 60_000,
  });

  // By-drawing-type stats from records
  const byType: Record<string, { total: number; submitted: number; authenticated: number; sentBack: number }> = {};
  records.forEach((r) => {
    const t = str(r.dataJson.drawing_type) || 'OTHER';
    if (!byType[t]) byType[t] = { total: 0, submitted: 0, authenticated: 0, sentBack: 0 };
    byType[t].total++;
    if (r.recordState === 'AUTHENTICATED') byType[t].authenticated++;
    else if (r.recordState === 'SUBMITTED' || r.recordState === 'VERIFIED') byType[t].submitted++;
    else if (r.recordState === 'SENT_BACK') byType[t].sentBack++;
  });

  const byTypeRows = Object.entries(byType).map(([type, s]) => ({
    type, ...s,
  }));

  const byTypeColumns = [
    {
      title: 'Drawing Type',
      dataIndex: 'type',
      key: 'type',
      render: (t: string) => <Text>{DRAWING_TYPE_LABELS[t] ?? t}</Text>,
    },
    { title: 'Total',          dataIndex: 'total',         key: 'total',         width: 70, align: 'right' as const },
    { title: 'In Approval',    dataIndex: 'submitted',     key: 'sub',           width: 90, align: 'right' as const,
      render: (n: number) => n > 0 ? <Text style={{ color: 'var(--ant-color-warning)' }}>{n}</Text> : <Text type="secondary">—</Text> },
    { title: 'Authenticated',  dataIndex: 'authenticated', key: 'auth',          width: 110, align: 'right' as const,
      render: (n: number) => n > 0 ? <Text style={{ color: 'var(--ant-color-success)' }}>{n}</Text> : <Text type="secondary">—</Text> },
    { title: 'Sent Back',      dataIndex: 'sentBack',      key: 'sb',            width: 90, align: 'right' as const,
      render: (n: number) => n > 0 ? <Text style={{ color: 'var(--ant-color-error)' }}>{n}</Text> : <Text type="secondary">—</Text> },
  ];

  // Approver heatmap
  const HeatmapSection = ({ m }: { m: DrawingApproverMatrixDto }) => {
    if (!m.cells.length) return null;
    const cellMap = new Map(m.cells.map((c) => [`${c.designationCode}|${c.drawingType}`, c]));
    return (
      <Card size="small" title="Approver Heatmap (Pending per designation × type)" style={{ marginBottom: 16 }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', fontSize: 12, width: '100%' }}>
            <thead>
              <tr>
                <th style={{ padding: '4px 8px', textAlign: 'left', whiteSpace: 'nowrap' }}>Designation</th>
                {m.drawingTypes.map((dt) => (
                  <th key={dt} style={{ padding: '4px 8px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                    {DRAWING_TYPE_LABELS[dt] ?? dt}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {m.designations.map((desig) => (
                <tr key={desig}>
                  <td style={{ padding: '4px 8px', fontWeight: 500, whiteSpace: 'nowrap' }}>{desig}</td>
                  {m.drawingTypes.map((dt) => {
                    const cell = cellMap.get(`${desig}|${dt}`);
                    const pending = cell?.pendingCount ?? 0;
                    const bg = pending > 10 ? '#fbe7e7' : pending > 5 ? '#fbf0d9' : pending > 0 ? '#e8f5ee' : undefined;
                    const color = pending > 10 ? '#dc2626' : pending > 5 ? '#d97706' : pending > 0 ? '#16a34a' : '#8b9aab';
                    return (
                      <td key={dt} style={{ padding: '4px 8px', textAlign: 'center',
                        background: bg, color, fontWeight: pending > 0 ? 600 : undefined }}>
                        {pending > 0 ? pending : '—'}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    );
  };

  const stuckApprovers = summary ? Math.max(0, summary.slaBreachCount) : 0;

  return (
    <>
      {summary && (
        <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
          <Col xs={12} sm={5}>
            <Card size="small"><Statistic title="Total Drawings" value={summary.totalRecords} valueStyle={{ fontSize: 20 }} /></Card>
          </Col>
          <Col xs={12} sm={5}>
            <Card size="small"><Statistic title="Approved" value={summary.authenticatedCount}
              valueStyle={{ fontSize: 20, color: 'var(--ant-color-success)' }} /></Card>
          </Col>
          <Col xs={12} sm={5}>
            <Card size="small"><Statistic title="In Approval"
              value={summary.submittedCount + summary.verifiedCount}
              valueStyle={{ fontSize: 20, color: 'var(--ant-color-warning)' }} /></Card>
          </Col>
          <Col xs={12} sm={5}>
            <Card size="small"><Statistic title="Sent Back" value={summary.sentBackCount}
              valueStyle={{ fontSize: 20, color: summary.sentBackCount > 0 ? 'var(--ant-color-error)' : undefined }} /></Card>
          </Col>
          <Col xs={12} sm={4}>
            <Card size="small">
              <Tooltip title="Records with SLA breach">
                <Statistic title="SLA Breach" value={stuckApprovers}
                  valueStyle={{ fontSize: 20, color: stuckApprovers > 0 ? 'var(--ant-color-error)' : undefined }} />
              </Tooltip>
            </Card>
          </Col>
        </Row>
      )}

      {(recLoading || matrixLoading) ? (
        <Skeleton active paragraph={{ rows: 6 }} />
      ) : (
        <>
          {matrix && <HeatmapSection m={matrix} />}

          {byTypeRows.length > 0 && (
            <Card size="small" title="By Drawing Type" style={{ marginBottom: 16 }}>
              <Table
                size="small"
                dataSource={byTypeRows}
                rowKey="type"
                columns={byTypeColumns}
                pagination={false}
                scroll={{ x: undefined }}
              />
            </Card>
          )}

          <Card size="small" title={`Drawing Records (${records.length})`}>
            <Table
              size="small"
              dataSource={records}
              rowKey="id"
              columns={[
                {
                  title: 'Drawing',
                  key: 'drawing',
                  render: (_: unknown, r: DashboardRecordDto) => (
                    <Space direction="vertical" size={0}>
                      <Text style={{ fontSize: 12 }}>{str(r.dataJson.drawing_title) || str(r.dataJson.drawing_number) || '—'}</Text>
                      {!!r.dataJson.drawing_number && !!r.dataJson.drawing_title && (
                        <Text type="secondary" style={{ fontSize: 11 }}>{str(r.dataJson.drawing_number)}</Text>
                      )}
                    </Space>
                  ),
                },
                {
                  title: 'Type',
                  key: 'type',
                  width: 110,
                  render: (_: unknown, r: DashboardRecordDto) => (
                    <Text style={{ fontSize: 12 }}>{DRAWING_TYPE_LABELS[str(r.dataJson.drawing_type)] ?? (str(r.dataJson.drawing_type) || '—')}</Text>
                  ),
                },
                {
                  title: 'Station',
                  key: 'station',
                  width: 120,
                  render: (_: unknown, r: DashboardRecordDto) => (
                    <Text style={{ fontSize: 12 }}>{str(r.dataJson.station_name) || '—'}</Text>
                  ),
                },
                {
                  title: 'State',
                  dataIndex: 'recordState',
                  key: 'state',
                  width: 110,
                  render: (s: string) => (
                    <Tag style={{ fontSize: 11, background: STATE_COLORS[s], color: '#fff' }}>
                      {STATE_LABELS[s] ?? s}
                    </Tag>
                  ),
                },
              ]}
              pagination={records.length > 20 ? { pageSize: 20, size: 'small' } : false}
              scroll={{ x: undefined }}
            />
          </Card>
        </>
      )}
    </>
  );
}

// ── §8 Tender Packaging section ───────────────────────────────────────────────

function TenderSection({
  projectId, summary,
}: { projectId: string; summary?: ActivitySummaryDto }) {
  const { data: records = [], isLoading } = useQuery({
    queryKey: ['dashboard', 'records', projectId, 'TENDER_PACKAGING'],
    queryFn: () => fetchDashboardRecords(projectId, 'TENDER_PACKAGING'),
    staleTime: 60_000,
  });

  const columns = [
    {
      title: 'Package',
      key: 'pkg',
      render: (_: unknown, r: DashboardRecordDto) => (
        <Space direction="vertical" size={0}>
          <Text style={{ fontSize: 12 }}>{str(r.dataJson.package_name) || '—'}</Text>
          {!!r.dataJson.tender_id && (
            <Text type="secondary" style={{ fontSize: 11 }}>ID: {str(r.dataJson.tender_id)}</Text>
          )}
        </Space>
      ),
    },
    {
      title: 'Est. Value',
      key: 'val',
      width: 120,
      align: 'right' as const,
      render: (_: unknown, r: DashboardRecordDto) => {
        const v = num(r.dataJson.estimated_value);
        return v > 0 ? (
          <Text style={{ fontSize: 12 }}>₹{v.toLocaleString('en-IN')}</Text>
        ) : <Text type="secondary">—</Text>;
      },
    },
    {
      title: 'NIT Published',
      key: 'nit',
      width: 110,
      render: (_: unknown, r: DashboardRecordDto) => {
        const d = r.dataJson.nit_published_on as string | undefined;
        return d ? <Text style={{ fontSize: 12 }}>{dayjs(d).format('DD MMM YY')}</Text>
          : <Text type="secondary">—</Text>;
      },
    },
    {
      title: 'State',
      dataIndex: 'recordState',
      key: 'state',
      width: 110,
      render: (s: string) => (
        <Tag style={{ fontSize: 11, background: STATE_COLORS[s], color: '#fff' }}>
          {STATE_LABELS[s] ?? s}
        </Tag>
      ),
    },
  ];

  return (
    <>
      {summary && <ActivityKpiStrip summary={summary} />}
      {isLoading ? <Skeleton active paragraph={{ rows: 4 }} /> : (
        <Card size="small" title={`Tender Records (${records.length})`}>
          <Table size="small" dataSource={records} rowKey="id" columns={columns}
            pagination={records.length > 20 ? { pageSize: 20, size: 'small' } : false}
            scroll={{ x: undefined }} />
        </Card>
      )}
    </>
  );
}

// ── §8 Temporary Office Space section ─────────────────────────────────────────

function OfficeSpaceSection({
  projectId, summary,
}: { projectId: string; summary?: ActivitySummaryDto }) {
  const { data: records = [], isLoading } = useQuery({
    queryKey: ['dashboard', 'records', projectId, 'TEMPORARY_OFFICE_SPACE'],
    queryFn: () => fetchDashboardRecords(projectId, 'TEMPORARY_OFFICE_SPACE'),
    staleTime: 60_000,
  });

  const STRUCT_LABELS: Record<string, string> = {
    NEW_REQUIRED: 'New Construction',
    OLD_AVAILABLE: 'Existing Building',
    HIRING: 'Hired/Rented',
  };

  const columns = [
    {
      title: 'Location',
      key: 'loc',
      render: (_: unknown, r: DashboardRecordDto) => (
        <Text style={{ fontSize: 12 }}>{str(r.dataJson.location_description) || '—'}</Text>
      ),
    },
    {
      title: 'Type',
      key: 'type',
      width: 120,
      render: (_: unknown, r: DashboardRecordDto) => (
        <Text style={{ fontSize: 12 }}>
          {STRUCT_LABELS[str(r.dataJson.structure_type)] ?? (str(r.dataJson.structure_type) || '—')}
        </Text>
      ),
    },
    {
      title: 'Area (sqm)',
      key: 'area',
      width: 90,
      align: 'right' as const,
      render: (_: unknown, r: DashboardRecordDto) => {
        const v = num(r.dataJson.area_sqm);
        return v > 0 ? <Text style={{ fontSize: 12 }}>{v}</Text> : <Text type="secondary">—</Text>;
      },
    },
    {
      title: 'State',
      dataIndex: 'recordState',
      key: 'state',
      width: 110,
      render: (s: string) => (
        <Tag style={{ fontSize: 11, background: STATE_COLORS[s], color: '#fff' }}>
          {STATE_LABELS[s] ?? s}
        </Tag>
      ),
    },
  ];

  return (
    <>
      {summary && <ActivityKpiStrip summary={summary} />}
      {isLoading ? <Skeleton active paragraph={{ rows: 4 }} /> : (
        <Card size="small" title={`Office Space Records (${records.length})`}>
          <Table size="small" dataSource={records} rowKey="id" columns={columns}
            pagination={records.length > 20 ? { pageSize: 20, size: 'small' } : false}
            scroll={{ x: undefined }} />
        </Card>
      )}
    </>
  );
}

// ── §9 Project overview panel ─────────────────────────────────────────────────

function ProjectOverviewPanel({
  overview, summaries,
}: { overview: ProjectOverviewDto; summaries: ActivitySummaryDto[] }) {
  const daysRb = overview.daysSinceRbRecommendation;
  const summaryMap = new Map(summaries.map((s) => [s.activityTypeCode, s]));
  const [activeKeys, setActiveKeys] = useState<string[]>([]);

  const togglePanel = (key: string) =>
    setActiveKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );

  // Build collapse items for each activity type that has records
  const activityPanels = overview.activityCards
    .filter((c) => c.totalRecords > 0)
    .map((card) => {
      const s = summaryMap.get(card.activityTypeCode);
      const label = `${ACTIVITY_ICONS[card.activityTypeCode] ?? '📎'} ${ACTIVITY_LABELS[card.activityTypeCode] ?? card.activityTypeCode}`;
      let children: React.ReactNode;
      switch (card.activityTypeCode) {
        case 'LAND_ACQUISITION':
          children = <LandAcquisitionSection projectId={overview.projectId} summary={s} />;
          break;
        case 'UTILITY_SHIFTING':
          children = <UtilityShiftingSection projectId={overview.projectId} summary={s} />;
          break;
        case 'FOREST_CLEARANCE':
          children = <ForestClearanceSection projectId={overview.projectId} summary={s} />;
          break;
        case 'DRAWING_APPROVAL':
          children = <DrawingApprovalSection projectId={overview.projectId} summary={s} />;
          break;
        case 'TENDER_PACKAGING':
          children = <TenderSection projectId={overview.projectId} summary={s} />;
          break;
        case 'TEMPORARY_OFFICE_SPACE':
          children = <OfficeSpaceSection projectId={overview.projectId} summary={s} />;
          break;
        default:
          children = s ? <ActivityKpiStrip summary={s} /> : null;
      }
      const ragColor = RAG_COLORS[card.ragStatus as 'GREEN' | 'AMBER' | 'RED'] ?? '#8b9aab';
      return {
        key: card.activityTypeCode,
        label: (
          <Flex align="center" gap={8}>
            <span>{label}</span>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: ragColor }} />
            {card.slaBreachCount > 0 && (
              <Tag color="red" style={{ fontSize: 10, padding: '0 4px' }}>
                {card.slaBreachCount} SLA
              </Tag>
            )}
          </Flex>
        ),
        children,
        forceRender: false,
      };
    });

  return (
    <>
      {/* Header card */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Row gutter={[16, 8]}>
          <Col xs={24} sm={16}>
            <Space direction="vertical" size={2}>
              <Title level={5} style={{ margin: 0 }}>{overview.name}</Title>
              <Space size={8} wrap>
                {overview.projectCode && (
                  <Text code style={{ fontSize: 12 }}>{overview.projectCode}</Text>
                )}
                {overview.zoneCode && (
                  <Tag>{overview.zoneCode}</Tag>
                )}
                <Tag color={LIFECYCLE_COLORS[overview.lifecycleState] ? undefined : 'default'}
                  style={{
                    background: LIFECYCLE_COLORS[overview.lifecycleState] ?? undefined,
                    color: LIFECYCLE_COLORS[overview.lifecycleState] ? '#fff' : undefined,
                  }}>
                  {LIFECYCLE_LABELS[overview.lifecycleState] ?? overview.lifecycleState}
                </Tag>
              </Space>
            </Space>
          </Col>
          <Col xs={24} sm={8}>
            <Row gutter={[12, 8]}>
              <Col span={12}>
                <Statistic
                  title="Days since RB"
                  value={daysRb ?? '—'}
                  valueStyle={{ fontSize: 22, color: (daysRb ?? 0) > 365 ? 'var(--ant-color-error)' : undefined }}
                />
              </Col>
              <Col span={12}>
                <Statistic title="SLA Breaches" value={overview.totalSlaBreaches}
                  valueStyle={{ fontSize: 22, color: overview.totalSlaBreaches > 0 ? 'var(--ant-color-error)' : undefined }} />
              </Col>
            </Row>
          </Col>
        </Row>
      </Card>

      {/* Cross-activity health indicators */}
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col xs={12} sm={8}>
          <Card size="small">
            <Statistic title="Total SLA Breaches" value={overview.totalSlaBreaches}
              prefix={<AlertOutlined />}
              valueStyle={{ color: overview.totalSlaBreaches > 0 ? 'var(--ant-color-error)' : undefined }} />
          </Card>
        </Col>
        <Col xs={12} sm={8}>
          <Card size="small">
            <Statistic
              title="Pending Items"
              value={overview.activityCards.reduce((s, c) => s + c.pendingCount, 0)}
              prefix={<ClockCircleOutlined />}
              valueStyle={{ color: 'var(--ant-color-warning)' }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={8}>
          <Card size="small">
            <Statistic title="Drawings in Approval" value={overview.totalDrawingsInApproval}
              prefix={<FileSearchOutlined />} />
          </Card>
        </Col>
      </Row>

      {/* Activity RAG grid — each card toggles its detail panel */}
      <Divider orientation="left" orientationMargin={0}
        style={{ fontSize: 12, color: 'var(--ant-color-text-secondary)', margin: '0 0 12px' }}>
        Activity Overview
      </Divider>
      <Row gutter={[12, 0]} style={{ marginBottom: 8 }}>
        {overview.activityCards.map((card) => {
          const hasPanel = card.totalRecords > 0;
          const isOpen = activeKeys.includes(card.activityTypeCode);
          return (
            <Col xs={24} sm={12} lg={8} key={card.activityTypeCode}>
              <ActivityRagCard
                card={card}
                onClick={hasPanel ? () => togglePanel(card.activityTypeCode) : undefined}
                isExpanded={isOpen}
              />
            </Col>
          );
        })}
      </Row>

      {/* Per-activity expanded sections */}
      {activityPanels.length > 0 && (
        <Collapse
          items={activityPanels}
          activeKey={activeKeys}
          onChange={(keys) => setActiveKeys(typeof keys === 'string' ? [keys] : keys)}
          size="small"
          style={{ marginTop: 4 }}
        />
      )}
    </>
  );
}

// ── §3 Project scope ──────────────────────────────────────────────────────────

function ProjectScope({ zones }: { zones: ZoneSummaryDto[] }) {
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  const needsDirectFetch = zones.length === 0;
  const { data: directProjects } = useQuery({
    queryKey: ['projects', 'list'],
    queryFn: fetchProjects,
    staleTime: 120_000,
    enabled: needsDirectFetch,
  });

  const projectOptions: Array<{ value: string; label: string }> = useMemo(() => {
    if (!needsDirectFetch) {
      return zones.flatMap((z) => z.projects).map((p) => ({
        value: p.projectId,
        label: p.projectCode ? `${p.projectCode} — ${p.name}` : p.name,
      }));
    }
    return (directProjects ?? []).map((p: ProjectSummaryResponse) => ({
      value: p.id,
      label: p.projectCode ? `${p.projectCode} — ${p.name}` : p.name,
    }));
  }, [needsDirectFetch, zones, directProjects]);

  const { data: overview, isLoading: overviewLoading } = useQuery({
    queryKey: ['dashboard', 'project-overview', selectedProjectId],
    queryFn: () => fetchProjectOverview(selectedProjectId!),
    enabled: !!selectedProjectId,
    staleTime: 60_000,
  });

  const { data: projectDashboard } = useQuery({
    queryKey: ['dashboard', 'project-summary', selectedProjectId],
    queryFn: () => fetchProjectDashboard(selectedProjectId!),
    enabled: !!selectedProjectId,
    staleTime: 60_000,
  });

  return (
    <>
      <Flex align="center" gap={8} style={{ marginBottom: 16 }}>
        <Text type="secondary" style={{ fontSize: 12 }}>Project</Text>
        <Select
          style={{ minWidth: 300, maxWidth: '100%' }}
          size="small"
          showSearch
          allowClear
          optionFilterProp="label"
          placeholder="Select a project…"
          value={selectedProjectId}
          onChange={(v) => setSelectedProjectId(v ?? null)}
          options={projectOptions}
        />
      </Flex>

      {!selectedProjectId && (
        <Empty description="Select a project to view its dashboard" />
      )}

      {selectedProjectId && overviewLoading && (
        <Skeleton active paragraph={{ rows: 8 }} />
      )}

      {overview && (
        <ProjectOverviewPanel
          overview={overview}
          summaries={projectDashboard?.summaries ?? []}
        />
      )}
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

  // Sync scope if permissions load after initial render
  useEffect(() => {
    if (availableScopes.length > 0 && !availableScopes.includes(scope)) {
      setScope(availableScopes[0]);
    }
  }, [availableScopes, scope]);

  const canSwitchZone =
    isSuperAdmin ||
    (currentUser?.accessibleZoneIds?.length ?? 0) > 1;

  const hasZoneOrHigher =
    isSuperAdmin ||
    permissions.includes('DASHBOARD.VIEW.ZONE') ||
    permissions.includes('DASHBOARD.VIEW.PAN_INDIA');

  // ── Data fetching ─────────────────────────────────────────────────────────

  const zoneQuery = useQuery({
    queryKey: ['dashboard', 'zone'],
    queryFn: fetchZoneDashboard,
    staleTime: 120_000,
    refetchInterval: 120_000,
    enabled: !!currentUser && (scope === 'zone' || scope === 'project') && hasZoneOrHigher,
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
  const error = scope === 'pan-india' ? panIndiaQuery.error : zoneQuery.error;

  const handleProjectClick = (p: ZoneProjectDto) => {
    navigate(`/projects/${p.projectCode ?? p.projectId}`);
  };

  // PAN India → zone drill-down: switch to zone scope + pre-filter
  const handleZoneDrillDown = (_zoneId: string) => {
    if (availableScopes.includes('zone')) {
      setScope('zone');
    }
  };

  const scopeLabels: Record<DashboardScope, { label: string; icon: React.ReactNode }> = {
    'pan-india': { label: 'PAN India', icon: <GlobalOutlined /> },
    'zone':      { label: 'Zone',      icon: <BarChartOutlined /> },
    'project':   { label: 'Project',   icon: <ProjectOutlined /> },
  };

  return (
    <div style={{ padding: '16px 20px', maxWidth: '100%' }}>
      {/* Scope selector */}
      {availableScopes.length > 1 && (
        <Flex align="center" gap={12} style={{ marginBottom: 20 }}>
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
          <Space>
            {scopeLabels[scope]?.icon}
            <Text strong style={{ fontSize: 14 }}>{scopeLabels[scope]?.label} Dashboard</Text>
          </Space>
        </Flex>
      )}

      {/* Loading / error states */}
      {isLoading && scope !== 'project' && (
        <Skeleton active paragraph={{ rows: 6 }} />
      )}

      {error && (
        <div style={{
          padding: 16, marginBottom: 16,
          background: 'var(--ant-color-error-bg)',
          border: '1px solid var(--ant-color-error-border)',
          borderRadius: 6, color: 'var(--ant-color-error)',
        }}>
          Failed to load dashboard: {(error as Error).message}
        </div>
      )}

      {/* ── PAN India scope ──────────────────────────────────────────────── */}
      {!isLoading && scope === 'pan-india' && panIndiaQuery.data && (
        <PanIndiaScope
          data={panIndiaQuery.data}
          onZoneDrillDown={handleZoneDrillDown}
          onProjectClick={handleProjectClick}
        />
      )}

      {/* ── Zone scope ───────────────────────────────────────────────────── */}
      {!isLoading && scope === 'zone' && (
        <ZoneScope
          zones={zones}
          canSwitchZone={canSwitchZone}
          onProjectClick={handleProjectClick}
        />
      )}

      {/* ── Project scope ────────────────────────────────────────────────── */}
      {scope === 'project' && (
        <ProjectScope zones={hasZoneOrHigher ? zones : []} />
      )}
    </div>
  );
}
