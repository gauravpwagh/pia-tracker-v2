/**
 * Forest Clearance per-activity dashboard (dashboards.md §6).
 *
 * KPI strip      — total cases, cleared, in-progress, SLA breaches.
 * Stage stepper  — authenticated / submitted / pending per stage (from fetchForestStageBreakdown).
 * Records table  — forest_division_name, area, state, days.
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Alert,
  Card,
  Col,
  Progress,
  Row,
  Skeleton,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  ExclamationCircleOutlined,
  ExpandAltOutlined,
  FileOutlined,
  SyncOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import {
  fetchProjectDashboard,
  fetchDashboardRecords,
  fetchForestStageBreakdown,
  type DashboardRecordDto,
  type ForestStageSummaryDto,
} from '@api/dashboard';
import { fetchActivities } from '@api/projects';
import { parseNum, stateColor, stateLabel } from './shared';

const { Text } = Typography;

const STAGE_LABELS: Record<string, string> = {
  stage_i:      'Stage I — In-Principle Approval',
  stage_ii:     'Stage II — Final Approval',
  post_approval:'Post-Approval',
  STAGE_I:      'Stage I — In-Principle Approval',
  STAGE_II:     'Stage II — Final Approval',
  POST_APPROVAL:'Post-Approval',
};

interface RowData {
  key:         string;
  divisionName:string;
  areaHa:      number;
  chainage:    string;
  recordState: string;
  daysElapsed: number;
}

function toRows(records: DashboardRecordDto[]): RowData[] {
  return records.map((r) => {
    const d    = r.dataJson;
    const from = d.project_chainage_from as string | undefined;
    const to   = d.project_chainage_to   as string | undefined;
    return {
      key:         r.id,
      divisionName:String(d.forest_division_name ?? '—'),
      areaHa:      parseNum(d.forest_area_hectares),
      chainage:    from && to ? `${from}–${to}` : '—',
      recordState: r.recordState,
      daysElapsed: dayjs().diff(dayjs(r.createdAt), 'day'),
    };
  });
}

const COLUMNS: ColumnsType<RowData> = [
  { title: 'Division',  dataIndex: 'divisionName', key: 'division', ellipsis: true, width: 130 },
  { title: 'Area (ha)', dataIndex: 'areaHa',       key: 'area',     width: 80,
    render: (v: number) => v > 0 ? v.toFixed(2) : '—',
    sorter: (a, b) => a.areaHa - b.areaHa },
  { title: 'Chainage',  dataIndex: 'chainage',     key: 'chainage', width: 110 },
  { title: 'State',     dataIndex: 'recordState',  key: 'state',    width: 110,
    render: (s: string) => (
      <Tag color={stateColor(s)} style={{ fontSize: 10, margin: 0 }}>{stateLabel(s)}</Tag>
    ),
  },
  { title: 'Days', dataIndex: 'daysElapsed', key: 'days', width: 55,
    sorter: (a, b) => a.daysElapsed - b.daysElapsed },
];

function StageBar({ stage }: { stage: ForestStageSummaryDto }) {
  const total  = stage.totalRecords;
  const authed = stage.authenticatedCount;
  const pct    = total > 0 ? Math.round((authed / total) * 100) : 0;
  const label  = STAGE_LABELS[stage.stageCode] ?? stage.stageCode.replace(/_/g, ' ');

  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
        <Text style={{ fontSize: 12 }}>{label}</Text>
        <Space size={6}>
          <Tag color="green" style={{ fontSize: 10, margin: 0 }}>{authed} approved</Tag>
          {stage.submittedCount + stage.verifiedCount > 0 && (
            <Tag color="blue" style={{ fontSize: 10, margin: 0 }}>
              {stage.submittedCount + stage.verifiedCount} in progress
            </Tag>
          )}
          {stage.draftCount > 0 && (
            <Tag style={{ fontSize: 10, margin: 0 }}>{stage.draftCount} draft</Tag>
          )}
          {stage.sentBackCount > 0 && (
            <Tag color="orange" style={{ fontSize: 10, margin: 0 }}>{stage.sentBackCount} sent back</Tag>
          )}
        </Space>
      </div>
      <Progress
        percent={pct}
        strokeColor="#52c41a"
        trailColor="#f0f0f0"
        showInfo={false}
        size="small"
        style={{ margin: 0 }}
      />
    </div>
  );
}

interface Props { projectId: string; }

export function ForestClearanceDashboard({ projectId }: Props) {
  const summaryQuery = useQuery({
    queryKey: ['dashboardProject', projectId],
    queryFn:  () => fetchProjectDashboard(projectId),
    staleTime: 60_000,
  });

  const recordsQuery = useQuery({
    queryKey: ['dashboardRecords', projectId, 'FOREST_CLEARANCE'],
    queryFn:  () => fetchDashboardRecords(projectId, 'FOREST_CLEARANCE'),
    staleTime: 60_000,
  });

  const stageQuery = useQuery({
    queryKey: ['dashboardForestStages', projectId],
    queryFn:  () => fetchForestStageBreakdown(projectId),
    staleTime: 60_000,
  });

  // Fetch FC activities to read scope/target area from metadataJson
  const activitiesQuery = useQuery({
    queryKey: ['activities', projectId],
    queryFn:  () => fetchActivities(projectId),
    staleTime: 60_000,
  });

  const summary = summaryQuery.data?.summaries.find((s) => s.activityTypeCode === 'FOREST_CLEARANCE');
  const records = recordsQuery.data ?? [];
  const stages  = stageQuery.data?.stages ?? [];
  const rows    = useMemo(() => toRows(records), [records]);

  // Scope area from activity metadata (planned total forest area to clear)
  const scopeAreaHa = useMemo(() => {
    const fcActivities = (activitiesQuery.data ?? []).filter(
      (a) => a.activityTypeCode === 'FOREST_CLEARANCE',
    );
    return fcActivities.reduce((sum, a) => {
      const m = (a.metadataJson ?? {}) as Record<string, unknown>;
      return sum + parseNum(m.forest_area_hectares);
    }, 0);
  }, [activitiesQuery.data]);

  if (summaryQuery.isLoading || recordsQuery.isLoading || stageQuery.isLoading || activitiesQuery.isLoading) {
    return <Skeleton active paragraph={{ rows: 4 }} style={{ marginTop: 8 }} />;
  }
  if (summaryQuery.isError || recordsQuery.isError) {
    return <Alert type="error" message="Failed to load Forest Clearance dashboard" showIcon style={{ marginTop: 8 }} />;
  }

  const total      = summary?.totalRecords       ?? 0;
  const authed     = summary?.authenticatedCount  ?? 0;
  const inProgress = (summary?.submittedCount ?? 0) + (summary?.verifiedCount ?? 0);
  const sla        = summary?.slaBreachCount     ?? 0;

  return (
    <div style={{ marginTop: 8 }}>
      {/* ── KPI strip ──────────────────────────────────────────────────────── */}
      <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
        {scopeAreaHa > 0 && (
          <Col span={12}>
            <Statistic
              title={<Text type="secondary" style={{ fontSize: 11 }}>Scope Area (ha)</Text>}
              value={scopeAreaHa.toFixed(2)}
              valueStyle={{ fontSize: 17 }}
              prefix={<ExpandAltOutlined />}
            />
          </Col>
        )}
        <Col span={12}>
          <Statistic title={<Text type="secondary" style={{ fontSize: 11 }}>Total Cases</Text>}
            value={total} valueStyle={{ fontSize: 17 }} prefix={<FileOutlined />} />
        </Col>
        <Col span={12}>
          <Statistic title={<Text type="secondary" style={{ fontSize: 11 }}>Cleared</Text>}
            value={authed} valueStyle={{ fontSize: 17, color: '#52c41a' }}
            prefix={<CheckCircleOutlined />} />
        </Col>
        <Col span={12}>
          <Statistic title={<Text type="secondary" style={{ fontSize: 11 }}>In Progress</Text>}
            value={inProgress} valueStyle={{ fontSize: 17, color: '#1677ff' }}
            prefix={<SyncOutlined />} />
        </Col>
        <Col span={12}>
          <Statistic title={<Text type="secondary" style={{ fontSize: 11 }}>SLA Breaches</Text>}
            value={sla} valueStyle={{ fontSize: 17, color: sla > 0 ? '#ff4d4f' : undefined }}
            prefix={<ExclamationCircleOutlined />} />
        </Col>
      </Row>

      {/* ── Stage progress bars ─────────────────────────────────────────────── */}
      {stages.length > 0 && (
        <Card size="small" title="Stage progress" style={{ marginBottom: 12 }}
          styles={{ body: { padding: '10px 12px 2px' } }}>
          {stages.map((s) => <StageBar key={s.stageCode} stage={s} />)}
        </Card>
      )}
      {stages.length === 0 && total > 0 && (
        <div style={{ marginBottom: 12 }}>
          <Text type="secondary" style={{ fontSize: 12, fontStyle: 'italic' }}>
            Stage data available after first workflow transition.
          </Text>
        </div>
      )}

      {/* ── Records table ───────────────────────────────────────────────────── */}
      {rows.length > 0 ? (
        <Card size="small" title={`Records (${rows.length})`} styles={{ body: { padding: 0 } }}>
          <Table<RowData>
            size="small"
            dataSource={rows}
            columns={COLUMNS}
            pagination={{ pageSize: 6, showSizeChanger: false, size: 'small' }}
            scroll={{ x: 480 }}
          />
        </Card>
      ) : (
        <Text type="secondary" style={{ fontSize: 12, fontStyle: 'italic' }}>
          <ClockCircleOutlined style={{ marginRight: 4 }} />No records yet.
        </Text>
      )}
    </div>
  );
}
