/**
 * Tender Packaging dashboard.
 *
 * KPI strip — scope (required), records, finalized (authenticated), balance,
 *             EPC doc prepared count, SLA breaches.
 * Records table — package name, EPC doc prepared, tender finalized, state, days.
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
  FileDoneOutlined,
  FileOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { fetchProjectDashboard, fetchDashboardRecords, type DashboardRecordDto } from '@api/dashboard';
import { fetchActivities } from '@api/projects';
import { stateColor, stateLabel } from './shared';

const { Text } = Typography;

function toBool(v: unknown): boolean | null {
  if (v === true  || v === 'true'  || v === 1) return true;
  if (v === false || v === 'false' || v === 0) return false;
  return null;
}

function YesNo({ value }: { value: boolean | null }) {
  if (value === null) return <Text type="secondary" style={{ fontSize: 11 }}>—</Text>;
  return value
    ? <Tag color="green"   style={{ fontSize: 10, margin: 0 }}>Yes</Tag>
    : <Tag color="default" style={{ fontSize: 10, margin: 0 }}>No</Tag>;
}

interface RowData {
  key:             string;
  packageName:     string;
  epcDocPrepared:  boolean | null;
  tenderFinalized: boolean | null;
  recordState:     string;
  daysElapsed:     number;
}

function toRows(records: DashboardRecordDto[]): RowData[] {
  return records.map((r) => {
    const d = r.dataJson as Record<string, unknown>;
    return {
      key:             r.id,
      packageName:     String(d.package_name ?? '—'),
      epcDocPrepared:  toBool(d.epc_document_prepared),
      tenderFinalized: toBool(d.tender_finalized),
      recordState:     r.recordState,
      daysElapsed:     dayjs().diff(dayjs(r.createdAt), 'day'),
    };
  });
}

const COLUMNS: ColumnsType<RowData> = [
  { title: 'Package',              dataIndex: 'packageName',     key: 'name',     ellipsis: true },
  { title: 'EPC Doc Prepared',     dataIndex: 'epcDocPrepared',  key: 'epcDoc',   width: 130,
    render: (v: boolean | null) => <YesNo value={v} />,
    sorter: (a, b) => Number(a.epcDocPrepared ?? -1) - Number(b.epcDocPrepared ?? -1),
  },
  { title: 'Tender Finalized',     dataIndex: 'tenderFinalized', key: 'finalized',width: 130,
    render: (v: boolean | null) => <YesNo value={v} />,
    sorter: (a, b) => Number(a.tenderFinalized ?? -1) - Number(b.tenderFinalized ?? -1),
  },
  { title: 'State', dataIndex: 'recordState', key: 'state', width: 100,
    render: (s: string) => (
      <Tag color={stateColor(s)} style={{ fontSize: 10, margin: 0 }}>{stateLabel(s)}</Tag>
    ),
  },
  { title: 'Days', dataIndex: 'daysElapsed', key: 'days', width: 55,
    sorter: (a, b) => a.daysElapsed - b.daysElapsed },
];

interface Props { projectId: string; }

export function TenderPackagingDashboard({ projectId }: Props) {
  const summaryQuery = useQuery({
    queryKey: ['dashboardProject', projectId],
    queryFn:  () => fetchProjectDashboard(projectId),
    staleTime: 60_000,
  });

  const recordsQuery = useQuery({
    queryKey: ['dashboardRecords', projectId, 'TENDER_PACKAGING'],
    queryFn:  () => fetchDashboardRecords(projectId, 'TENDER_PACKAGING'),
    staleTime: 60_000,
  });

  const activitiesQuery = useQuery({
    queryKey: ['activities', projectId],
    queryFn:  () => fetchActivities(projectId),
    staleTime: 60_000,
  });

  const summary = summaryQuery.data?.summaries.find((s) => s.activityTypeCode === 'TENDER_PACKAGING');
  const records = recordsQuery.data ?? [];
  const rows    = useMemo(() => toRows(records), [records]);

  const scopeCount = useMemo(() => {
    return (activitiesQuery.data ?? [])
      .filter((a) => a.activityTypeCode === 'TENDER_PACKAGING')
      .reduce((sum, a) => {
        const n = Number((a.metadataJson as Record<string, unknown>).total_count);
        return sum + (isNaN(n) ? 0 : n);
      }, 0);
  }, [activitiesQuery.data]);

  const epcDocCount = useMemo(
    () => records.filter((r) => toBool((r.dataJson as Record<string, unknown>).epc_document_prepared) === true).length,
    [records],
  );
  const finalizedCount = useMemo(
    () => records.filter((r) => toBool((r.dataJson as Record<string, unknown>).tender_finalized) === true).length,
    [records],
  );

  if (summaryQuery.isLoading || recordsQuery.isLoading || activitiesQuery.isLoading) {
    return <Skeleton active paragraph={{ rows: 4 }} style={{ marginTop: 8 }} />;
  }
  if (summaryQuery.isError || recordsQuery.isError) {
    return <Alert type="error" message="Failed to load Tender Packaging dashboard" showIcon style={{ marginTop: 8 }} />;
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
              prefix={<FileOutlined />}
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
            title={<Text type="secondary" style={{ fontSize: 11 }}>Finalized</Text>}
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
            title={<Text type="secondary" style={{ fontSize: 11 }}>EPC Doc Prepared</Text>}
            value={epcDocCount}
            suffix={total > 0 ? <Text type="secondary" style={{ fontSize: 12 }}>/ {total}</Text> : undefined}
            valueStyle={{ fontSize: 17, color: epcDocCount > 0 ? '#1677ff' : undefined }}
            prefix={<FileDoneOutlined />}
          />
        </Col>
        <Col span={12}>
          <Statistic
            title={<Text type="secondary" style={{ fontSize: 11 }}>Tender Finalized</Text>}
            value={finalizedCount}
            suffix={total > 0 ? <Text type="secondary" style={{ fontSize: 12 }}>/ {total}</Text> : undefined}
            valueStyle={{ fontSize: 17, color: finalizedCount > 0 ? '#52c41a' : undefined }}
            prefix={<CheckCircleOutlined />}
          />
        </Col>
        <Col span={12}>
          <Statistic
            title={<Text type="secondary" style={{ fontSize: 11 }}>SLA Breaches</Text>}
            value={sla}
            valueStyle={{ fontSize: 17, color: sla > 0 ? '#ff4d4f' : undefined }}
            prefix={<ExclamationCircleOutlined />}
          />
        </Col>
      </Row>

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
