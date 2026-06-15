/**
 * Temporary Office Space dashboard.
 *
 * KPI strip — scope (required), records (entered), provisioned (authenticated), balance, SLA.
 * By structure type — doughnut.
 * Records table — structure type, location, state, days.
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
  HomeOutlined,
} from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import dayjs from 'dayjs';
import { fetchProjectDashboard, fetchDashboardRecords, type DashboardRecordDto } from '@api/dashboard';
import { fetchActivities } from '@api/projects';
import { stateColor, stateLabel } from './shared';

const { Text } = Typography;

const STRUCTURE_LABELS: Record<string, string> = {
  NEW_REQUIRED:  'New Structure',
  OLD_AVAILABLE: 'Old Structure',
  HIRING:        'Hiring / Rent',
};

interface RowData {
  key:           string;
  structureType: string;
  location:      string;
  recordState:   string;
  daysElapsed:   number;
}

function toRows(records: DashboardRecordDto[]): RowData[] {
  return records.map((r) => {
    const d = r.dataJson as Record<string, unknown>;
    return {
      key:           r.id,
      structureType: STRUCTURE_LABELS[String(d.structure_type ?? '')] ?? String(d.structure_type ?? '—'),
      location:      String(d.location_description ?? '—'),
      recordState:   r.recordState,
      daysElapsed:   dayjs().diff(dayjs(r.createdAt), 'day'),
    };
  });
}

const COLUMNS: ColumnsType<RowData> = [
  { title: 'Structure', dataIndex: 'structureType', key: 'type',     width: 130, ellipsis: true },
  { title: 'Location',  dataIndex: 'location',      key: 'location', ellipsis: true },
  { title: 'State',     dataIndex: 'recordState',   key: 'state',    width: 110,
    render: (s: string) => (
      <Tag color={stateColor(s)} style={{ fontSize: 10, margin: 0 }}>{stateLabel(s)}</Tag>
    ),
  },
  { title: 'Days', dataIndex: 'daysElapsed', key: 'days', width: 55,
    sorter: (a, b) => a.daysElapsed - b.daysElapsed },
];

interface Props { projectId: string; }

export function TemporaryOfficeSpaceDashboard({ projectId }: Props) {
  const summaryQuery = useQuery({
    queryKey: ['dashboardProject', projectId],
    queryFn:  () => fetchProjectDashboard(projectId),
    staleTime: 60_000,
  });

  const recordsQuery = useQuery({
    queryKey: ['dashboardRecords', projectId, 'TEMPORARY_OFFICE_SPACE'],
    queryFn:  () => fetchDashboardRecords(projectId, 'TEMPORARY_OFFICE_SPACE'),
    staleTime: 60_000,
  });

  const activitiesQuery = useQuery({
    queryKey: ['activities', projectId],
    queryFn:  () => fetchActivities(projectId),
    staleTime: 60_000,
  });

  const summary = summaryQuery.data?.summaries.find((s) => s.activityTypeCode === 'TEMPORARY_OFFICE_SPACE');
  const records = recordsQuery.data ?? [];
  const rows    = useMemo(() => toRows(records), [records]);

  const scopeCount = useMemo(() => {
    return (activitiesQuery.data ?? [])
      .filter((a) => a.activityTypeCode === 'TEMPORARY_OFFICE_SPACE')
      .reduce((sum, a) => {
        const n = Number((a.metadataJson as Record<string, unknown>).total_count);
        return sum + (isNaN(n) ? 0 : n);
      }, 0);
  }, [activitiesQuery.data]);

  const byType = useMemo(() => {
    const map: Record<string, number> = {};
    for (const r of records) {
      const key = STRUCTURE_LABELS[String((r.dataJson as Record<string, unknown>).structure_type ?? '')] ?? 'Unknown';
      map[key] = (map[key] ?? 0) + 1;
    }
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [records]);

  const doughnutOption = useMemo(() => ({
    tooltip: { trigger: 'item' },
    legend:  { orient: 'vertical', right: 0, top: 'middle', textStyle: { fontSize: 11 } },
    series: [{
      type: 'pie', radius: ['40%', '65%'], center: ['38%', '50%'],
      label: { fontSize: 10 },
      data: byType,
    }],
  }), [byType]);

  if (summaryQuery.isLoading || recordsQuery.isLoading || activitiesQuery.isLoading) {
    return <Skeleton active paragraph={{ rows: 4 }} style={{ marginTop: 8 }} />;
  }
  if (summaryQuery.isError || recordsQuery.isError) {
    return <Alert type="error" message="Failed to load Temporary Office Space dashboard" showIcon style={{ marginTop: 8 }} />;
  }

  const total   = summary?.totalRecords      ?? 0;
  const authed  = summary?.authenticatedCount ?? 0;
  const balance = scopeCount > 0 ? scopeCount - total : null;
  const sla     = summary?.slaBreachCount    ?? 0;

  return (
    <div style={{ marginTop: 8 }}>
      <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
        {scopeCount > 0 && (
          <Col span={12}>
            <Statistic
              title={<Text type="secondary" style={{ fontSize: 11 }}>Required (scope)</Text>}
              value={scopeCount}
              valueStyle={{ fontSize: 17 }}
              prefix={<HomeOutlined />}
            />
          </Col>
        )}
        <Col span={12}>
          <Statistic
            title={<Text type="secondary" style={{ fontSize: 11 }}>Records</Text>}
            value={total}
            valueStyle={{ fontSize: 17 }}
            prefix={<FileOutlined />}
          />
        </Col>
        <Col span={12}>
          <Statistic
            title={<Text type="secondary" style={{ fontSize: 11 }}>Provisioned</Text>}
            value={authed}
            valueStyle={{ fontSize: 17, color: '#52c41a' }}
            prefix={<CheckCircleOutlined />}
          />
        </Col>
        {balance !== null && (
          <Col span={12}>
            <Statistic
              title={<Text type="secondary" style={{ fontSize: 11 }}>Balance</Text>}
              value={balance}
              valueStyle={{ fontSize: 17, color: balance > 0 ? '#fa8c16' : undefined }}
              prefix={<ClockCircleOutlined />}
            />
          </Col>
        )}
        <Col span={12}>
          <Statistic
            title={<Text type="secondary" style={{ fontSize: 11 }}>SLA Breaches</Text>}
            value={sla}
            valueStyle={{ fontSize: 17, color: sla > 0 ? '#ff4d4f' : undefined }}
            prefix={<ExclamationCircleOutlined />}
          />
        </Col>
      </Row>

      {byType.length > 0 && (
        <Card size="small" title="By structure type"
          style={{ marginBottom: 12 }} styles={{ body: { padding: '8px 12px' } }}>
          <ReactECharts option={doughnutOption} style={{ height: 160 }} notMerge />
        </Card>
      )}

      {rows.length > 0 ? (
        <Card size="small" title={`Records (${rows.length})`} styles={{ body: { padding: 0 } }}>
          <Table<RowData>
            size="small"
            dataSource={rows}
            columns={COLUMNS}
            pagination={{ pageSize: 6, showSizeChanger: false, size: 'small' }}
            scroll={{ x: 460 }}
          />
        </Card>
      ) : (
        <Text type="secondary" style={{ fontSize: 12, fontStyle: 'italic' }}>No records yet.</Text>
      )}
    </div>
  );
}
