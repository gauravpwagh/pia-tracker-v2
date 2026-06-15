/**
 * Land Acquisition per-project dashboard.
 *
 * Scope  → activity.metadataJson  (planned totals: area, ownership breakdown, est. villages)
 * Progress → record.dataJson      (each record = one village/section progress update)
 *
 * KPI strip   — scope area, acquired area, balance, est. villages, records count, SLA breaches.
 * Ownership chart — private/govt/forest scope vs acquired.
 * Villages table  — per-record row with village name, chainage, area, state, days.
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
  ExpandAltOutlined,
  FileOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import dayjs from 'dayjs';
import {
  fetchProjectDashboard,
  fetchDashboardRecords,
  type DashboardRecordDto,
} from '@api/dashboard';
import { fetchActivities } from '@api/projects';
import { parseNum, stateColor, stateLabel } from './shared';

const { Text } = Typography;

interface Props {
  projectId: string;
}

interface RowData {
  key: string;
  villageName: string;
  district: string;
  chainage: string;
  areaHa: number;
  recordState: string;
  daysElapsed: number;
}

function toRows(records: DashboardRecordDto[]): RowData[] {
  return records.map((r) => {
    const d = r.dataJson;
    const from = d.village_chainage_from as string | undefined;
    const to   = d.village_chainage_to   as string | undefined;
    return {
      key:         r.id,
      villageName: String(d.village_name ?? '—'),
      district:    String(d.district     ?? '—'),
      chainage:    from && to ? `${from}–${to}` : (from ?? to ?? '—'),
      areaHa:      parseNum(d.area_hectares_total),
      recordState: r.recordState,
      daysElapsed: dayjs().diff(dayjs(r.createdAt), 'day'),
    };
  });
}

const COLUMNS: ColumnsType<RowData> = [
  { title: 'Village',   dataIndex: 'villageName', key: 'village',  ellipsis: true, width: 120 },
  { title: 'District',  dataIndex: 'district',    key: 'district', ellipsis: true, width: 100 },
  { title: 'Chainage',  dataIndex: 'chainage',    key: 'chainage', width: 120 },
  { title: 'Area (ha)', dataIndex: 'areaHa',      key: 'area',     width: 80,
    render: (v: number) => v > 0 ? v.toFixed(2) : '—',
    sorter: (a, b) => a.areaHa - b.areaHa,
  },
  { title: 'State', dataIndex: 'recordState', key: 'state', width: 110,
    render: (s: string) => (
      <Tag color={stateColor(s)} style={{ fontSize: 10, margin: 0 }}>
        {stateLabel(s)}
      </Tag>
    ),
  },
  { title: 'Days', dataIndex: 'daysElapsed', key: 'days', width: 60, sorter: (a, b) => a.daysElapsed - b.daysElapsed },
];

export function LandAcquisitionDashboard({ projectId }: Props) {
  const summaryQuery = useQuery({
    queryKey: ['dashboardProject', projectId],
    queryFn:  () => fetchProjectDashboard(projectId),
    staleTime: 60_000,
  });

  const recordsQuery = useQuery({
    queryKey: ['dashboardRecords', projectId, 'LAND_ACQUISITION'],
    queryFn:  () => fetchDashboardRecords(projectId, 'LAND_ACQUISITION'),
    staleTime: 60_000,
  });

  // Fetch LA activities to read scope/target from metadataJson
  const activitiesQuery = useQuery({
    queryKey: ['activities', projectId],
    queryFn:  () => fetchActivities(projectId),
    staleTime: 60_000,
  });

  const summary  = summaryQuery.data?.summaries.find((s) => s.activityTypeCode === 'LAND_ACQUISITION');
  const records  = recordsQuery.data ?? [];
  const rows     = useMemo(() => toRows(records), [records]);

  // ── Scope totals from activity metadata ──────────────────────────────────────
  // activity.metadataJson = planned/target values (scope)
  const { scopeTotalHa, scopePrivateHa, scopeGovtHa, scopeForestHa, estVillages } = useMemo(() => {
    const laActivities = (activitiesQuery.data ?? []).filter(
      (a) => a.activityTypeCode === 'LAND_ACQUISITION',
    );
    let total = 0, priv = 0, govt = 0, forest = 0, villages = 0;
    for (const a of laActivities) {
      const m = (a.metadataJson ?? {}) as Record<string, unknown>;
      total    += parseNum(m.area_hectares_total);
      priv     += parseNum(m.area_hectares_private);
      govt     += parseNum(m.area_hectares_govt);
      forest   += parseNum(m.area_hectares_forest);
      villages += parseNum(m.villages_estimated_count);
    }
    return { scopeTotalHa: total, scopePrivateHa: priv, scopeGovtHa: govt,
             scopeForestHa: forest, estVillages: villages };
  }, [activitiesQuery.data]);

  // ── Progress totals from record data ─────────────────────────────────────────
  // record.dataJson = actual progress per village/section; no dedup — each
  // record is an independent progress entry for a distinct village/section.
  const { acquiredHa, acqPrivate, acqGovt, acqForest } = useMemo(() => {
    let acquired = 0, aqPriv = 0, aqGovt = 0, aqForest = 0;
    for (const r of records) {
      if (r.recordState !== 'AUTHENTICATED') continue;
      const d = r.dataJson;
      acquired += parseNum(d.area_hectares_total);
      aqPriv   += parseNum(d.area_hectares_private);
      aqGovt   += parseNum(d.area_hectares_govt);
      aqForest += parseNum(d.area_hectares_forest);
    }
    return { acquiredHa: acquired, acqPrivate: aqPriv, acqGovt: aqGovt, acqForest: aqForest };
  }, [records]);

  const balanceHa = scopeTotalHa - acquiredHa;

  const ownershipOption = useMemo(() => ({
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    legend: { bottom: 0, textStyle: { fontSize: 11 } },
    grid:   { left: 8, right: 8, top: 8, bottom: 36, containLabel: true },
    xAxis:  { type: 'value', axisLabel: { fontSize: 10 } },
    yAxis:  { type: 'category', data: ['Balance', 'Acquired'], axisLabel: { fontSize: 10 } },
    series: [
      { name: 'Private', type: 'bar', stack: 'total', color: '#1677ff',
        data: [+(scopePrivateHa - acqPrivate).toFixed(2), +acqPrivate.toFixed(2)] },
      { name: 'Govt',    type: 'bar', stack: 'total', color: '#52c41a',
        data: [+(scopeGovtHa - acqGovt).toFixed(2),       +acqGovt.toFixed(2)] },
      { name: 'Forest',  type: 'bar', stack: 'total', color: '#389e0d',
        data: [+(scopeForestHa - acqForest).toFixed(2),   +acqForest.toFixed(2)] },
    ],
  }), [scopePrivateHa, scopeGovtHa, scopeForestHa, acqPrivate, acqGovt, acqForest]);

  if (summaryQuery.isLoading || recordsQuery.isLoading || activitiesQuery.isLoading) {
    return <Skeleton active paragraph={{ rows: 4 }} style={{ marginTop: 8 }} />;
  }
  if (summaryQuery.isError || recordsQuery.isError) {
    return <Alert type="error" message="Failed to load Land Acquisition dashboard" showIcon style={{ marginTop: 8 }} />;
  }

  const total   = summary?.totalRecords      ?? 0;
  const authed  = summary?.authenticatedCount ?? 0;
  const pending = total - authed;
  const sla     = summary?.slaBreachCount    ?? 0;

  return (
    <div style={{ marginTop: 8 }}>
      {/* ── KPI strip ──────────────────────────────────────────────────────── */}
      <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
        <Col span={8}>
          <Statistic
            title={<Text type="secondary" style={{ fontSize: 11 }}>Scope Area (ha)</Text>}
            value={scopeTotalHa > 0 ? scopeTotalHa.toFixed(2) : '—'}
            valueStyle={{ fontSize: 17 }}
          />
        </Col>
        <Col span={8}>
          <Statistic
            title={<Text type="secondary" style={{ fontSize: 11 }}>Acquired (ha)</Text>}
            value={acquiredHa > 0 ? acquiredHa.toFixed(2) : '—'}
            valueStyle={{ fontSize: 17, color: '#52c41a' }}
            prefix={<CheckCircleOutlined />}
          />
        </Col>
        <Col span={8}>
          <Statistic
            title={<Text type="secondary" style={{ fontSize: 11 }}>Balance (ha)</Text>}
            value={scopeTotalHa > 0 ? balanceHa.toFixed(2) : '—'}
            valueStyle={{ fontSize: 17, color: balanceHa > 0 ? '#fa8c16' : undefined }}
            prefix={<ExpandAltOutlined />}
          />
        </Col>
        {estVillages > 0 && (
          <Col span={8}>
            <Statistic
              title={<Text type="secondary" style={{ fontSize: 11 }}>Est. Villages</Text>}
              value={estVillages}
              valueStyle={{ fontSize: 17 }}
              prefix={<TeamOutlined />}
            />
          </Col>
        )}
        <Col span={8}>
          <Statistic
            title={<Text type="secondary" style={{ fontSize: 11 }}>Records</Text>}
            value={total}
            valueStyle={{ fontSize: 17 }}
            prefix={<FileOutlined />}
          />
        </Col>
        <Col span={8}>
          <Statistic
            title={<Text type="secondary" style={{ fontSize: 11 }}>Authenticated</Text>}
            value={authed}
            valueStyle={{ fontSize: 17, color: '#52c41a' }}
            prefix={<CheckCircleOutlined />}
          />
        </Col>
        <Col span={8}>
          <Statistic
            title={<Text type="secondary" style={{ fontSize: 11 }}>SLA Breaches</Text>}
            value={sla}
            valueStyle={{ fontSize: 17, color: sla > 0 ? '#ff4d4f' : undefined }}
            prefix={<ExclamationCircleOutlined />}
          />
        </Col>
        {pending > 0 && (
          <Col span={8}>
            <Statistic
              title={<Text type="secondary" style={{ fontSize: 11 }}>Pending</Text>}
              value={pending}
              valueStyle={{ fontSize: 17, color: '#fa8c16' }}
              prefix={<ClockCircleOutlined />}
            />
          </Col>
        )}
      </Row>

      {/* ── Ownership chart ─────────────────────────────────────────────────── */}
      {scopeTotalHa > 0 && (
        <Card size="small" title="Acquired vs Balance — by ownership (ha)"
          style={{ marginBottom: 12 }} styles={{ body: { padding: '8px 12px' } }}>
          <ReactECharts option={ownershipOption} style={{ height: 150 }} notMerge />
        </Card>
      )}

      {/* ── Villages table ──────────────────────────────────────────────────── */}
      {rows.length > 0 ? (
        <Card size="small" title={`Villages / Records (${rows.length})`}
          styles={{ body: { padding: 0 } }}>
          <Table<RowData>
            size="small"
            dataSource={rows}
            columns={COLUMNS}
            pagination={{ pageSize: 6, showSizeChanger: false, size: 'small' }}
            scroll={{ x: 580 }}
          />
        </Card>
      ) : (
        <Text type="secondary" style={{ fontSize: 12, fontStyle: 'italic' }}>No records yet.</Text>
      )}
    </div>
  );
}
