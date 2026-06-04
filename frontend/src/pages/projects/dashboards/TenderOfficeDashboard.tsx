/**
 * Shared dashboard for Tender Packaging (§8a) and Temporary Office Space (§8b).
 *
 * Tender Packaging KPI strip — total, EPC doc prepared, EPC tender finalized,
 *                              authenticated, SLA breaches.
 * Records table — package name, EPC doc prepared, EPC tender finalized, state, days.
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
  FileDoneOutlined,
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
  key:            string;
  packageName:    string;
  epcDocPrepared: boolean | null;
  tenderFinalized:boolean | null;
  recordState:    string;
  daysElapsed:    number;
}

function toBool(v: unknown): boolean | null {
  if (v === true  || v === 'true'  || v === 1) return true;
  if (v === false || v === 'false' || v === 0) return false;
  return null;
}

function YesNo({ value }: { value: boolean | null }) {
  if (value === null) return <Text type="secondary" style={{ fontSize: 11 }}>—</Text>;
  return value
    ? <Tag color="green"  style={{ fontSize: 10, margin: 0 }}>Yes</Tag>
    : <Tag color="default" style={{ fontSize: 10, margin: 0 }}>No</Tag>;
}

function toTenderRows(records: DashboardRecordDto[]): TenderRow[] {
  return records.map((r) => {
    const d = r.dataJson;
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

const TENDER_COLUMNS: ColumnsType<TenderRow> = [
  { title: 'Package',              dataIndex: 'packageName',    key: 'name',    ellipsis: true },
  { title: 'EPC Doc Prepared',     dataIndex: 'epcDocPrepared', key: 'epcDoc',  width: 130,
    render: (v: boolean | null) => <YesNo value={v} />,
    sorter: (a, b) => Number(a.epcDocPrepared ?? -1) - Number(b.epcDocPrepared ?? -1),
  },
  { title: 'EPC Tender Finalized', dataIndex: 'tenderFinalized', key: 'finalized', width: 145,
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

// ── KPI strip — Tender Packaging ─────────────────────────────────────────────

interface TenderKpiProps {
  total:          number;
  authed:         number;
  sla:            number;
  epcDocCount:    number;
  finalizedCount: number;
}

function TenderKpiStrip({ total, authed, sla, epcDocCount, finalizedCount }: TenderKpiProps) {
  const pending = total - authed;
  return (
    <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
      <Col span={12}>
        <Statistic title={<Text type="secondary" style={{ fontSize: 11 }}>Total Packages</Text>}
          value={total} valueStyle={{ fontSize: 17 }} prefix={<FileOutlined />} />
      </Col>
      <Col span={12}>
        <Statistic title={<Text type="secondary" style={{ fontSize: 11 }}>Authenticated</Text>}
          value={authed} valueStyle={{ fontSize: 17, color: '#52c41a' }}
          prefix={<CheckCircleOutlined />} />
      </Col>
      <Col span={12}>
        <Statistic title={<Text type="secondary" style={{ fontSize: 11 }}>EPC Doc Prepared</Text>}
          value={epcDocCount}
          suffix={total > 0 ? <Text type="secondary" style={{ fontSize: 12 }}>/ {total}</Text> : undefined}
          valueStyle={{ fontSize: 17, color: epcDocCount > 0 ? '#1677ff' : undefined }}
          prefix={<FileDoneOutlined />} />
      </Col>
      <Col span={12}>
        <Statistic title={<Text type="secondary" style={{ fontSize: 11 }}>EPC Tender Finalized</Text>}
          value={finalizedCount}
          suffix={total > 0 ? <Text type="secondary" style={{ fontSize: 12 }}>/ {total}</Text> : undefined}
          valueStyle={{ fontSize: 17, color: finalizedCount > 0 ? '#52c41a' : undefined }}
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

// ── KPI strip — Temporary Office Space ───────────────────────────────────────

interface OfficeKpiProps { total: number; authed: number; sla: number; }

function OfficeKpiStrip({ total, authed, sla }: OfficeKpiProps) {
  const pending = total - authed;
  return (
    <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
      <Col span={12}>
        <Statistic title={<Text type="secondary" style={{ fontSize: 11 }}>Total Sites</Text>}
          value={total} valueStyle={{ fontSize: 17 }} prefix={<FileOutlined />} />
      </Col>
      <Col span={12}>
        <Statistic title={<Text type="secondary" style={{ fontSize: 11 }}>Cleared</Text>}
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

  // Count EPC milestones from dataJson for Tender KPI strip
  const epcDocCount    = useMemo(() => records.filter((r) => r.dataJson.epc_document_prepared === true).length, [records]);
  const finalizedCount = useMemo(() => records.filter((r) => r.dataJson.tender_finalized     === true).length, [records]);

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

  const total  = summary?.totalRecords       ?? 0;
  const authed = summary?.authenticatedCount  ?? 0;
  const sla    = summary?.slaBreachCount     ?? 0;

  return (
    <div style={{ marginTop: 8 }}>
      {isTender
        ? <TenderKpiStrip total={total} authed={authed} sla={sla}
            epcDocCount={epcDocCount} finalizedCount={finalizedCount} />
        : <OfficeKpiStrip total={total} authed={authed} sla={sla} />
      }

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
