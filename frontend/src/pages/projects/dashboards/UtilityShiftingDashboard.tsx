/**
 * Utility Shifting per-activity dashboard (dashboards.md §5).
 *
 * KPI strip        — total items, shifted, pending, SLA breaches.
 * By utility type  — horizontal bar chart (from fetchUtilityBreakdown).
 * By executing agency — doughnut.
 * Records table    — utility_type, owner_agency, chainage, agency, state.
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Alert,
  Card,
  Col,
  Row,
  Skeleton,
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
  FileOutlined,
  ToolOutlined,
} from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import dayjs from 'dayjs';
import {
  fetchProjectDashboard,
  fetchDashboardRecords,
  fetchUtilityBreakdown,
  type DashboardRecordDto,
} from '@api/dashboard';
import { fetchActivities } from '@api/projects';
import { stateColor, stateLabel } from './shared';

const { Text } = Typography;

const UTILITY_LABELS: Record<string, string> = {
  LT:                   'LT',
  HT:                   'HT',
  EHV:                  'EHV',
  PIPELINE_WATER:       'Pipeline (Water)',
  PIPELINE_INFLAMMABLE: 'Pipeline (Inflammable)',
  PIPELINE_OTHER:       'Pipeline (Other)',
  SNT_SIGNAL_TELECOM:   'SNT Signal/Telecom',
  SNT_LOCATION_BOX:     'SNT Location Box',
  SNT_SIGNAL_MAST:      'SNT Signal Mast',
  SNT_IBH:              'SNT IBH',
  QUARTER:              'Quarter',
  STATION_BUILDING:     'Station Building',
  AQUEDUCT_CANAL:       'Aqueduct/Canal',
  ROAD:                 'Road',
  TSS:                  'TSS',
  SS:                   'SS',
  OHE_MAST:             'OHE Mast',
};

const AGENCY_LABELS: Record<string, string> = {
  RAILWAY:      'Railway',
  USER:         'User',
  OPEN_LINE:    'Open Line',
  CONSTRUCTION: 'Construction',
};

interface RowData {
  key:           string;
  utilityType:   string;
  ownerAgency:   string;
  chainage:      string;
  execAgency:    string;
  recordState:   string;
  daysElapsed:   number;
}

function toRows(records: DashboardRecordDto[]): RowData[] {
  return records.map((r) => {
    const d    = r.dataJson;
    const from = d.railway_chainage_from as string | undefined;
    const to   = d.railway_chainage_to   as string | undefined;
    return {
      key:         r.id,
      utilityType: UTILITY_LABELS[String(d.utility_type ?? '')] ?? String(d.utility_type ?? '—'),
      ownerAgency: String(d.owner_agency ?? '—'),
      chainage:    from && to ? `${from}–${to}` : (from ?? to ?? '—'),
      execAgency:  AGENCY_LABELS[String(d.executing_agency ?? '')] ?? String(d.executing_agency ?? '—'),
      recordState: r.recordState,
      daysElapsed: dayjs().diff(dayjs(r.createdAt), 'day'),
    };
  });
}

const COLUMNS: ColumnsType<RowData> = [
  { title: 'Type',    dataIndex: 'utilityType', key: 'type',    width: 100, ellipsis: true },
  { title: 'Owner',   dataIndex: 'ownerAgency', key: 'owner',   width: 90,  ellipsis: true },
  { title: 'Chainage',dataIndex: 'chainage',    key: 'chainage',width: 110 },
  { title: 'Agency',  dataIndex: 'execAgency',  key: 'agency',  width: 90,  ellipsis: true },
  { title: 'State',   dataIndex: 'recordState', key: 'state',   width: 100,
    render: (s: string) => (
      <Tag color={stateColor(s)} style={{ fontSize: 10, margin: 0 }}>{stateLabel(s)}</Tag>
    ),
  },
  { title: 'Days', dataIndex: 'daysElapsed', key: 'days', width: 55,
    sorter: (a, b) => a.daysElapsed - b.daysElapsed },
];

interface Props { projectId: string; }

export function UtilityShiftingDashboard({ projectId }: Props) {
  const summaryQuery = useQuery({
    queryKey: ['dashboardProject', projectId],
    queryFn:  () => fetchProjectDashboard(projectId),
    staleTime: 60_000,
  });

  const recordsQuery = useQuery({
    queryKey: ['dashboardRecords', projectId, 'UTILITY_SHIFTING'],
    queryFn:  () => fetchDashboardRecords(projectId, 'UTILITY_SHIFTING'),
    staleTime: 60_000,
  });

  const breakdownQuery = useQuery({
    queryKey: ['dashboardUtilityBreakdown', projectId],
    queryFn:  () => fetchUtilityBreakdown(projectId),
    staleTime: 60_000,
  });

  // Fetch US activities to read scope count from metadataJson
  const activitiesQuery = useQuery({
    queryKey: ['activities', projectId],
    queryFn:  () => fetchActivities(projectId),
    staleTime: 60_000,
  });

  const summary   = summaryQuery.data?.summaries.find((s) => s.activityTypeCode === 'UTILITY_SHIFTING');
  const records   = recordsQuery.data ?? [];
  const breakdown = breakdownQuery.data;
  const rows      = useMemo(() => toRows(records), [records]);

  // Scope totals from all US activity metadata
  const { scopeCount, scopeTrackKm } = useMemo(() => {
    const usActivities = (activitiesQuery.data ?? []).filter(
      (a) => a.activityTypeCode === 'UTILITY_SHIFTING',
    );
    return usActivities.reduce(
      (acc, a) => {
        const m = (a.metadataJson ?? {}) as Record<string, unknown>;
        const n = Number(m.total_count);
        const t = Number(m.total_track_length_km);
        return {
          scopeCount:   acc.scopeCount   + (isNaN(n) ? 0 : n),
          scopeTrackKm: acc.scopeTrackKm + (isNaN(t) ? 0 : t),
        };
      },
      { scopeCount: 0, scopeTrackKm: 0 },
    );
  }, [activitiesQuery.data]);

  // Track length progress: sum across all records (not just authenticated)
  // so any entered progress is visible, regardless of workflow state.
  const shiftedTrackKm = useMemo(() => {
    return records.reduce((sum, r) => {
      const v = Number((r.dataJson as Record<string, unknown>).affected_track_length_km);
      return sum + (isNaN(v) ? 0 : v);
    }, 0);
  }, [records]);

  // By-type bar chart from breakdown (authoritative counts)
  const typeBarOption = useMemo(() => {
    const subtypes = breakdown?.subtypes ?? [];
    const labels   = subtypes.map((s) => UTILITY_LABELS[s.recordSubtype] ?? s.recordSubtype);
    return {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      grid:    { left: 8, right: 8, top: 8, bottom: 8, containLabel: true },
      xAxis:   { type: 'value', axisLabel: { fontSize: 10 } },
      yAxis:   { type: 'category', data: labels, axisLabel: { fontSize: 10 } },
      series: [
        { name: 'Authenticated', type: 'bar', stack: 'total', color: '#52c41a',
          data: subtypes.map((s) => s.authenticatedCount) },
        { name: 'Pending',       type: 'bar', stack: 'total', color: '#fa8c16',
          data: subtypes.map((s) => s.totalRecords - s.authenticatedCount) },
      ],
    };
  }, [breakdown]);

  // By executing agency doughnut
  const agencyData = useMemo(() => {
    const map: Record<string, number> = {};
    for (const r of records) {
      const key = AGENCY_LABELS[String(r.dataJson.executing_agency ?? '')] ?? String(r.dataJson.executing_agency ?? 'Unknown');
      map[key] = (map[key] ?? 0) + 1;
    }
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [records]);

  const agencyDoughnutOption = useMemo(() => ({
    tooltip: { trigger: 'item' },
    legend: { orient: 'vertical', right: 0, top: 'middle', textStyle: { fontSize: 11 } },
    series: [{
      type: 'pie',
      radius: ['40%', '65%'],
      center: ['38%', '50%'],
      label: { fontSize: 10 },
      data: agencyData,
    }],
  }), [agencyData]);

  if (summaryQuery.isLoading || recordsQuery.isLoading || breakdownQuery.isLoading || activitiesQuery.isLoading) {
    return <Skeleton active paragraph={{ rows: 4 }} style={{ marginTop: 8 }} />;
  }
  if (summaryQuery.isError || recordsQuery.isError) {
    return <Alert type="error" message="Failed to load Utility Shifting dashboard" showIcon style={{ marginTop: 8 }} />;
  }

  const total        = summary?.totalRecords      ?? 0;
  const authed       = summary?.authenticatedCount ?? 0;
  const balance      = scopeCount > 0 ? scopeCount - authed : total - authed;
  const trackBalance = scopeTrackKm > 0 ? +(scopeTrackKm - shiftedTrackKm).toFixed(3) : null;
  const sla          = summary?.slaBreachCount    ?? 0;
  const subtypes     = breakdown?.subtypes ?? [];

  return (
    <div style={{ marginTop: 8 }}>
      {/* ── KPI strip ──────────────────────────────────────────────────────── */}
      <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
        {/* ── Utilities ── */}
        {scopeCount > 0 && (
          <Col span={12}>
            <Statistic
              title={<Text type="secondary" style={{ fontSize: 11 }}>Scope (utilities)</Text>}
              value={scopeCount}
              valueStyle={{ fontSize: 17 }}
              prefix={<ToolOutlined />}
            />
          </Col>
        )}
        <Col span={12}>
          <Statistic title={<Text type="secondary" style={{ fontSize: 11 }}>Records</Text>}
            value={total} valueStyle={{ fontSize: 17 }} prefix={<FileOutlined />} />
        </Col>
        <Col span={12}>
          <Statistic title={<Text type="secondary" style={{ fontSize: 11 }}>Shifted</Text>}
            value={authed} valueStyle={{ fontSize: 17, color: '#52c41a' }}
            prefix={<CheckCircleOutlined />} />
        </Col>
        <Col span={12}>
          <Statistic
            title={<Text type="secondary" style={{ fontSize: 11 }}>Balance (utilities)</Text>}
            value={balance}
            valueStyle={{ fontSize: 17, color: balance > 0 ? '#fa8c16' : undefined }}
            prefix={<ClockCircleOutlined />}
          />
        </Col>

        {/* ── Track length ── */}
        <Col span={12}>
          <Statistic
            title={<Text type="secondary" style={{ fontSize: 11 }}>Scope Track (km)</Text>}
            value={scopeTrackKm > 0 ? scopeTrackKm : '—'}
            precision={scopeTrackKm > 0 ? 3 : undefined}
            valueStyle={{ fontSize: 17 }}
            suffix={scopeTrackKm > 0 ? 'km' : undefined}
          />
        </Col>
        <Col span={12}>
          <Statistic
            title={<Text type="secondary" style={{ fontSize: 11 }}>Track Recorded (km)</Text>}
            value={shiftedTrackKm > 0 ? shiftedTrackKm : '—'}
            precision={shiftedTrackKm > 0 ? 3 : undefined}
            valueStyle={{ fontSize: 17, color: shiftedTrackKm > 0 ? '#52c41a' : undefined }}
            suffix={shiftedTrackKm > 0 ? 'km' : undefined}
          />
        </Col>
        {trackBalance !== null && (
          <Col span={12}>
            <Statistic
              title={<Text type="secondary" style={{ fontSize: 11 }}>Track Remaining (km)</Text>}
              value={trackBalance}
              precision={3}
              valueStyle={{ fontSize: 17, color: trackBalance > 0 ? '#fa8c16' : undefined }}
              suffix="km"
            />
          </Col>
        )}

        <Col span={12}>
          <Statistic title={<Text type="secondary" style={{ fontSize: 11 }}>SLA Breaches</Text>}
            value={sla} valueStyle={{ fontSize: 17, color: sla > 0 ? '#ff4d4f' : undefined }}
            prefix={<ExclamationCircleOutlined />} />
        </Col>
      </Row>

      {/* ── By utility type ─────────────────────────────────────────────────── */}
      {subtypes.length > 0 && (
        <Card size="small" title="By utility type"
          style={{ marginBottom: 12 }} styles={{ body: { padding: '8px 12px' } }}>
          <ReactECharts option={typeBarOption}
            style={{ height: Math.max(100, subtypes.length * 32) }} notMerge />
        </Card>
      )}

      {/* ── By executing agency ─────────────────────────────────────────────── */}
      {agencyData.length > 0 && (
        <Card size="small" title="By executing agency"
          style={{ marginBottom: 12 }} styles={{ body: { padding: '8px 12px' } }}>
          <ReactECharts option={agencyDoughnutOption} style={{ height: 160 }} notMerge />
        </Card>
      )}

      {/* ── Records table ───────────────────────────────────────────────────── */}
      {rows.length > 0 ? (
        <Card size="small" title={`Records (${rows.length})`} styles={{ body: { padding: 0 } }}>
          <Table<RowData>
            size="small"
            dataSource={rows}
            columns={COLUMNS}
            pagination={{ pageSize: 6, showSizeChanger: false, size: 'small' }}
            scroll={{ x: 540 }}
          />
        </Card>
      ) : (
        <Text type="secondary" style={{ fontSize: 12, fontStyle: 'italic' }}>No records yet.</Text>
      )}
    </div>
  );
}
