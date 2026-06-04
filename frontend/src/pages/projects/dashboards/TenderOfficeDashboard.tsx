/**
 * Shared dashboard for Tender Packaging (§8a) and Temporary Office Space (§8b).
 *
 * KPI strip     — total, finalized/cleared, pending, SLA breaches.
 * Records table — key fields + state + pending-with.
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
} from '@ant-design/icons';
import dayjs from 'dayjs';
import {
  fetchProjectDashboard,
  fetchDashboardRecords,
  type DashboardRecordDto,
} from '@api/dashboard';
import { parseNum, stateColor, stateLabel } from './shared';

const { Text } = Typography;

// ── Tender Packaging ──────────────────────────────────────────────────────────

interface TenderRow {
  key:         string;
  packageName: string;
  estimatedValue: string;
  tenderId:    string;
  recordState: string;
  daysElapsed: number;
}

function toTenderRows(records: DashboardRecordDto[]): TenderRow[] {
  return records.map((r) => {
    const d = r.dataJson;
    const val = parseNum(d.estimated_value);
    return {
      key:            r.id,
      packageName:    String(d.package_name    ?? '—'),
      estimatedValue: val > 0 ? `₹${val.toLocaleString('en-IN')}` : '—',
      tenderId:       String(d.tender_id       ?? '—'),
      recordState:    r.recordState,
      daysElapsed:    dayjs().diff(dayjs(r.createdAt), 'day'),
    };
  });
}

const TENDER_COLUMNS: ColumnsType<TenderRow> = [
  { title: 'Package',   dataIndex: 'packageName',    key: 'name',  ellipsis: true },
  { title: 'Est. Value',dataIndex: 'estimatedValue', key: 'value', width: 110, ellipsis: true },
  { title: 'Tender ID', dataIndex: 'tenderId',       key: 'id',    width: 90,  ellipsis: true },
  { title: 'State',     dataIndex: 'recordState',    key: 'state', width: 100,
    render: (s: string) => (
      <Tag color={stateColor(s)} style={{ fontSize: 10, margin: 0 }}>{stateLabel(s)}</Tag>
    ),
  },
  { title: 'Days', dataIndex: 'daysElapsed', key: 'days', width: 55,
    sorter: (a, b) => a.daysElapsed - b.daysElapsed },
];

// ── Temporary Office Space ────────────────────────────────────────────────────

const STRUCTURE_LABELS: Record<string, string> = {
  NEW_REQUIRED: 'New Required',
  OLD_AVAILABLE:'Old Available',
  HIRING:       'Hiring',
};

interface OfficeRow {
  key:          string;
  locationName: string;
  chainage:     string;
  structureType:string;
  count:        number;
  recordState:  string;
  daysElapsed:  number;
}

function toOfficeRows(records: DashboardRecordDto[]): OfficeRow[] {
  return records.map((r) => {
    const d = r.dataJson;
    return {
      key:          r.id,
      locationName: String(d.location_name ?? '—'),
      chainage:     String(d.location_chainage ?? '—'),
      structureType:STRUCTURE_LABELS[String(d.structure_type ?? '')] ?? String(d.structure_type ?? '—'),
      count:        parseNum(d.count),
      recordState:  r.recordState,
      daysElapsed:  dayjs().diff(dayjs(r.createdAt), 'day'),
    };
  });
}

const OFFICE_COLUMNS: ColumnsType<OfficeRow> = [
  { title: 'Location',   dataIndex: 'locationName',  key: 'loc',     ellipsis: true },
  { title: 'Chainage',   dataIndex: 'chainage',      key: 'chainage',width: 90 },
  { title: 'Type',       dataIndex: 'structureType', key: 'type',    width: 110, ellipsis: true },
  { title: 'Count',      dataIndex: 'count',         key: 'count',   width: 60,
    render: (v: number) => v > 0 ? v : '—' },
  { title: 'State',      dataIndex: 'recordState',   key: 'state',   width: 100,
    render: (s: string) => (
      <Tag color={stateColor(s)} style={{ fontSize: 10, margin: 0 }}>{stateLabel(s)}</Tag>
    ),
  },
  { title: 'Days', dataIndex: 'daysElapsed', key: 'days', width: 55,
    sorter: (a, b) => a.daysElapsed - b.daysElapsed },
];

// ── Shared KPI strip ──────────────────────────────────────────────────────────

interface KpiProps {
  total:       number;
  authed:      number;
  sla:         number;
  doneLabel:   string;
}

function KpiStrip({ total, authed, sla, doneLabel }: KpiProps) {
  const pending = total - authed;
  return (
    <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
      <Col span={12}>
        <Statistic title={<Text type="secondary" style={{ fontSize: 11 }}>Total</Text>}
          value={total} valueStyle={{ fontSize: 17 }} prefix={<FileOutlined />} />
      </Col>
      <Col span={12}>
        <Statistic title={<Text type="secondary" style={{ fontSize: 11 }}>{doneLabel}</Text>}
          value={authed} valueStyle={{ fontSize: 17, color: '#52c41a' }}
          prefix={<CheckCircleOutlined />} />
      </Col>
      <Col span={12}>
        <Statistic title={<Text type="secondary" style={{ fontSize: 11 }}>Pending</Text>}
          value={pending} valueStyle={{ fontSize: 17, color: pending > 0 ? '#fa8c16' : undefined }}
          prefix={<ClockCircleOutlined />} />
      </Col>
      <Col span={12}>
        <Statistic title={<Text type="secondary" style={{ fontSize: 11 }}>SLA Breaches</Text>}
          value={sla} valueStyle={{ fontSize: 17, color: sla > 0 ? '#ff4d4f' : undefined }}
          prefix={<ExclamationCircleOutlined />} />
      </Col>
    </Row>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  projectId:         string;
  activityTypeCode:  'TENDER_PACKAGING' | 'TEMPORARY_OFFICE_SPACE';
}

export function TenderOfficeDashboard({ projectId, activityTypeCode }: Props) {
  const isTender = activityTypeCode === 'TENDER_PACKAGING';

  const summaryQuery = useQuery({
    queryKey: ['dashboardProject', projectId],
    queryFn:  () => fetchProjectDashboard(projectId),
    staleTime: 60_000,
  });

  const recordsQuery = useQuery({
    queryKey: ['dashboardRecords', projectId, activityTypeCode],
    queryFn:  () => fetchDashboardRecords(projectId, activityTypeCode),
    staleTime: 60_000,
  });

  const summary = summaryQuery.data?.summaries.find((s) => s.activityTypeCode === activityTypeCode);
  const records = recordsQuery.data ?? [];

  const tenderRows = useMemo(() => isTender ? toTenderRows(records) : [], [records, isTender]);
  const officeRows = useMemo(() => !isTender ? toOfficeRows(records) : [], [records, isTender]);

  if (summaryQuery.isLoading || recordsQuery.isLoading) {
    return <Skeleton active paragraph={{ rows: 3 }} style={{ marginTop: 8 }} />;
  }
  if (summaryQuery.isError || recordsQuery.isError) {
    return (
      <Alert type="error"
        message={`Failed to load ${isTender ? 'Tender Packaging' : 'Office Space'} dashboard`}
        showIcon style={{ marginTop: 8 }} />
    );
  }

  const total    = summary?.totalRecords       ?? 0;
  const authed   = summary?.authenticatedCount  ?? 0;
  const sla      = summary?.slaBreachCount     ?? 0;
  const doneLabel = isTender ? 'Finalized' : 'Cleared';

  return (
    <div style={{ marginTop: 8 }}>
      <KpiStrip total={total} authed={authed} sla={sla} doneLabel={doneLabel} />

      {isTender && tenderRows.length > 0 && (
        <Card size="small" title={`Packages (${tenderRows.length})`} styles={{ body: { padding: 0 } }}>
          <Table<TenderRow>
            size="small"
            dataSource={tenderRows}
            columns={TENDER_COLUMNS}
            pagination={{ pageSize: 6, showSizeChanger: false, size: 'small' }}
            scroll={{ x: 440 }}
          />
        </Card>
      )}

      {!isTender && officeRows.length > 0 && (
        <Card size="small" title={`Sites (${officeRows.length})`} styles={{ body: { padding: 0 } }}>
          <Table<OfficeRow>
            size="small"
            dataSource={officeRows}
            columns={OFFICE_COLUMNS}
            pagination={{ pageSize: 6, showSizeChanger: false, size: 'small' }}
            scroll={{ x: 460 }}
          />
        </Card>
      )}

      {records.length === 0 && (
        <Text type="secondary" style={{ fontSize: 12, fontStyle: 'italic' }}>No records yet.</Text>
      )}
    </div>
  );
}
