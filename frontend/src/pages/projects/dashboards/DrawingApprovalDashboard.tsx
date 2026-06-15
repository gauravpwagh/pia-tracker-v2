/**
 * Drawing Approval per-activity dashboard (dashboards.md §7).
 *
 * KPI strip         — total, approved, in-approval, sent-back, SLA breaches.
 * By drawing type   — table: total/draft/in-approval/approved rows.
 * Approver heatmap  — designation × drawing_type grid (from fetchDrawingApproverMatrix).
 * Records table     — drawing_type, number, section, state, pending approvers count.
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Alert,
  Card,
  Col,
  Row,
  Skeleton,
  Space,
  Statistic,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  ExclamationCircleOutlined,
  FileOutlined,
  SendOutlined,
  SyncOutlined,
} from '@ant-design/icons';
import {
  fetchProjectDashboard,
  fetchDashboardRecords,
  fetchDrawingApproverMatrix,
  type DashboardRecordDto,
  type DrawingApproverCellDto,
} from '@api/dashboard';
import { fetchActivities } from '@api/projects';
import { stateColor, stateLabel } from './shared';

const { Text } = Typography;

// ── Records table ─────────────────────────────────────────────────────────────

interface RecordRow {
  key:             string;
  drawingType:     string;
  drawingNumber:   string;
  sectionName:     string;
  recordState:     string;
}

function toRecordRows(records: DashboardRecordDto[]): RecordRow[] {
  return records.map((r) => ({
    key:           r.id,
    drawingType:   r.recordSubtype ?? String(r.dataJson.drawing_type ?? '—'),
    drawingNumber: String(r.dataJson.drawing_number ?? '—'),
    sectionName:   String(r.dataJson.name_of_section ?? '—'),
    recordState:   r.recordState,
  }));
}

const RECORD_COLUMNS: ColumnsType<RecordRow> = [
  { title: 'Type',    dataIndex: 'drawingType',   key: 'type',    width: 100, ellipsis: true },
  { title: 'Drawing #',dataIndex: 'drawingNumber',key: 'number',  width: 100, ellipsis: true },
  { title: 'Section', dataIndex: 'sectionName',   key: 'section', ellipsis: true },
  { title: 'State',   dataIndex: 'recordState',   key: 'state',   width: 100,
    render: (s: string) => (
      <Tag color={stateColor(s)} style={{ fontSize: 10, margin: 0 }}>{stateLabel(s)}</Tag>
    ),
  },
];

// ── Drawing type summary table ────────────────────────────────────────────────

interface TypeRow {
  key:         string;
  drawingType: string;
  total:       number;
  authenticated: number;
  inApproval:  number;
  draft:       number;
}

function toTypeRows(records: DashboardRecordDto[]): TypeRow[] {
  const map = new Map<string, TypeRow>();
  for (const r of records) {
    const t = r.recordSubtype ?? String(r.dataJson.drawing_type ?? 'UNKNOWN');
    if (!map.has(t)) {
      map.set(t, { key: t, drawingType: t, total: 0, authenticated: 0, inApproval: 0, draft: 0 });
    }
    const row = map.get(t)!;
    row.total++;
    if (r.recordState === 'AUTHENTICATED') row.authenticated++;
    else if (r.recordState === 'SUBMITTED_FOR_VERIFICATION' || r.recordState === 'VERIFIED') row.inApproval++;
    else row.draft++;
  }
  return [...map.values()].sort((a, b) => a.drawingType.localeCompare(b.drawingType));
}

const TYPE_COLUMNS: ColumnsType<TypeRow> = [
  { title: 'Drawing Type', dataIndex: 'drawingType',  key: 'type',    ellipsis: true },
  { title: 'Total',        dataIndex: 'total',        key: 'total',   width: 60 },
  { title: 'Approved',     dataIndex: 'authenticated',key: 'authed',  width: 80,
    render: (v: number, r) => (
      <Text style={{ color: v > 0 && v === r.total ? '#52c41a' : undefined }}>{v}</Text>
    ),
  },
  { title: 'In Approval',  dataIndex: 'inApproval',   key: 'inApproval', width: 90,
    render: (v: number) => v > 0 ? <Text style={{ color: '#1677ff' }}>{v}</Text> : v },
  { title: 'Draft',        dataIndex: 'draft',        key: 'draft',   width: 60,
    render: (v: number) => v > 0 ? <Text type="secondary">{v}</Text> : v },
];

// ── Approver heatmap ──────────────────────────────────────────────────────────

function heatmapColor(pending: number, total: number): string {
  if (total === 0 || pending === 0) return '#f6ffed';       // all approved — light green
  const ratio = pending / total;
  if (ratio >= 0.8) return '#fff1f0';                       // mostly pending — light red
  if (ratio >= 0.4) return '#fff7e6';                       // mixed — light orange
  return '#e6f4ff';                                          // mostly done — light blue
}

function cellTextColor(pending: number, total: number): string {
  if (total === 0 || pending === 0) return '#52c41a';
  const ratio = pending / total;
  if (ratio >= 0.8) return '#ff4d4f';
  if (ratio >= 0.4) return '#fa8c16';
  return '#1677ff';
}

interface HeatmapProps {
  cells:        DrawingApproverCellDto[];
  designations: string[];
  drawingTypes: string[];
}

function ApproverHeatmap({ cells, designations, drawingTypes }: HeatmapProps) {
  const cellMap = useMemo(() => {
    const m = new Map<string, DrawingApproverCellDto>();
    for (const c of cells) m.set(`${c.designationCode}::${c.drawingType}`, c);
    return m;
  }, [cells]);

  if (designations.length === 0) return null;

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', fontSize: 11, width: '100%' }}>
        <thead>
          <tr>
            <th style={{ padding: '4px 6px', textAlign: 'left', fontWeight: 600, whiteSpace: 'nowrap',
              borderBottom: '1px solid var(--ant-color-border)', background: 'var(--ant-color-bg-layout)' }}>
              Designation
            </th>
            {drawingTypes.map((dt) => (
              <th key={dt} style={{ padding: '4px 6px', textAlign: 'center', fontWeight: 500,
                borderBottom: '1px solid var(--ant-color-border)',
                background: 'var(--ant-color-bg-layout)', whiteSpace: 'nowrap' }}>
                {dt}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {designations.map((desig) => (
            <tr key={desig}>
              <td style={{ padding: '3px 6px', borderBottom: '1px solid var(--ant-color-border-secondary)',
                whiteSpace: 'nowrap', fontWeight: 500 }}>
                {desig}
              </td>
              {drawingTypes.map((dt) => {
                const cell    = cellMap.get(`${desig}::${dt}`);
                const pending = cell?.pendingCount ?? 0;
                const total   = cell ? cell.pendingCount + cell.approvedCount : 0;
                return (
                  <td key={dt} style={{
                    padding: '3px 8px',
                    textAlign: 'center',
                    background: cell ? heatmapColor(pending, total) : 'transparent',
                    borderBottom: '1px solid var(--ant-color-border-secondary)',
                  }}>
                    {cell ? (
                      <Tooltip title={`${pending} pending / ${total} total`}>
                        <span style={{ color: cellTextColor(pending, total), fontWeight: pending > 0 ? 600 : 400 }}>
                          {pending > 0 ? pending : '✓'}
                        </span>
                      </Tooltip>
                    ) : (
                      <span style={{ color: 'var(--ant-color-text-quaternary)' }}>–</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props { projectId: string; }

export function DrawingApprovalDashboard({ projectId }: Props) {
  const summaryQuery = useQuery({
    queryKey: ['dashboardProject', projectId],
    queryFn:  () => fetchProjectDashboard(projectId),
    staleTime: 60_000,
  });

  const recordsQuery = useQuery({
    queryKey: ['dashboardRecords', projectId, 'DRAWING_APPROVAL'],
    queryFn:  () => fetchDashboardRecords(projectId, 'DRAWING_APPROVAL'),
    staleTime: 60_000,
  });

  const activitiesQuery = useQuery({
    queryKey: ['activities', projectId],
    queryFn:  () => fetchActivities(projectId),
    staleTime: 60_000,
  });

  const matrixQuery = useQuery({
    queryKey: ['dashboardDrawingMatrix', projectId],
    queryFn:  () => fetchDrawingApproverMatrix(projectId),
    staleTime: 60_000,
  });

  const summary   = summaryQuery.data?.summaries.find((s) => s.activityTypeCode === 'DRAWING_APPROVAL');
  const records   = recordsQuery.data ?? [];
  const matrix    = matrixQuery.data;
  const typeRows  = useMemo(() => toTypeRows(records), [records]);
  const recRows   = useMemo(() => toRecordRows(records), [records]);

  const scopeCount = useMemo(() => {
    return (activitiesQuery.data ?? [])
      .filter((a) => a.activityTypeCode === 'DRAWING_APPROVAL')
      .reduce((sum, a) => {
        const n = Number((a.metadataJson as Record<string, unknown>).total_count);
        return sum + (isNaN(n) ? 0 : n);
      }, 0);
  }, [activitiesQuery.data]);

  if (summaryQuery.isLoading || recordsQuery.isLoading || matrixQuery.isLoading || activitiesQuery.isLoading) {
    return <Skeleton active paragraph={{ rows: 4 }} style={{ marginTop: 8 }} />;
  }
  if (summaryQuery.isError || recordsQuery.isError) {
    return <Alert type="error" message="Failed to load Drawing Approval dashboard" showIcon style={{ marginTop: 8 }} />;
  }

  const total      = summary?.totalRecords       ?? 0;
  const authed     = summary?.authenticatedCount  ?? 0;
  const inApproval = (summary?.submittedCount ?? 0) + (summary?.verifiedCount ?? 0);
  const sentBack   = summary?.sentBackCount      ?? 0;
  const sla        = summary?.slaBreachCount     ?? 0;
  const balance    = scopeCount > 0 ? scopeCount - total : null;

  return (
    <div style={{ marginTop: 8 }}>
      {/* ── KPI strip ──────────────────────────────────────────────────────── */}
      <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
        {scopeCount > 0 && (
          <Col span={8}>
            <Statistic title={<Text type="secondary" style={{ fontSize: 11 }}>Required (scope)</Text>}
              value={scopeCount} valueStyle={{ fontSize: 17 }} prefix={<FileOutlined />} />
          </Col>
        )}
        <Col span={8}>
          <Statistic title={<Text type="secondary" style={{ fontSize: 11 }}>Total</Text>}
            value={total} valueStyle={{ fontSize: 17 }} prefix={<FileOutlined />} />
        </Col>
        {balance !== null && (
          <Col span={8}>
            <Statistic title={<Text type="secondary" style={{ fontSize: 11 }}>Balance</Text>}
              value={balance}
              valueStyle={{ fontSize: 17, color: balance > 0 ? '#fa8c16' : undefined }}
              prefix={<ClockCircleOutlined />} />
          </Col>
        )}
        <Col span={8}>
          <Statistic title={<Text type="secondary" style={{ fontSize: 11 }}>Approved</Text>}
            value={authed} valueStyle={{ fontSize: 17, color: '#52c41a' }}
            prefix={<CheckCircleOutlined />} />
        </Col>
        <Col span={8}>
          <Statistic title={<Text type="secondary" style={{ fontSize: 11 }}>In Approval</Text>}
            value={inApproval} valueStyle={{ fontSize: 17, color: '#1677ff' }}
            prefix={<SyncOutlined />} />
        </Col>
        <Col span={8}>
          <Statistic title={<Text type="secondary" style={{ fontSize: 11 }}>Sent Back</Text>}
            value={sentBack} valueStyle={{ fontSize: 17, color: sentBack > 0 ? '#fa8c16' : undefined }}
            prefix={<SendOutlined />} />
        </Col>
        <Col span={8}>
          <Statistic title={<Text type="secondary" style={{ fontSize: 11 }}>SLA Breaches</Text>}
            value={sla} valueStyle={{ fontSize: 17, color: sla > 0 ? '#ff4d4f' : undefined }}
            prefix={<ExclamationCircleOutlined />} />
        </Col>
        {sla > 0 && (
          <Col span={8}>
            <Space direction="vertical" size={2}>
              <Text type="secondary" style={{ fontSize: 11 }}>Stuck Approvers</Text>
              <Tag color="red" style={{ fontSize: 12 }}>{sla} &gt; 30 days</Tag>
            </Space>
          </Col>
        )}
      </Row>

      {/* ── By drawing type table ───────────────────────────────────────────── */}
      {typeRows.length > 0 && (
        <Card size="small" title="By drawing type" style={{ marginBottom: 12 }}
          styles={{ body: { padding: 0 } }}>
          <Table<TypeRow>
            size="small"
            dataSource={typeRows}
            columns={TYPE_COLUMNS}
            pagination={false}
            scroll={{ x: 360 }}
          />
        </Card>
      )}

      {/* ── Approver heatmap ────────────────────────────────────────────────── */}
      {matrix && matrix.designations.length > 0 && (
        <Card size="small" title="Approver heatmap — pending per designation × type"
          style={{ marginBottom: 12 }} styles={{ body: { padding: '8px 12px' } }}>
          <ApproverHeatmap
            cells={matrix.cells}
            designations={matrix.designations}
            drawingTypes={matrix.drawingTypes}
          />
          <Text type="secondary" style={{ fontSize: 10, display: 'block', marginTop: 6 }}>
            Numbers = pending approvals. ✓ = all approved. — = not applicable.
          </Text>
        </Card>
      )}

      {/* ── Records table ───────────────────────────────────────────────────── */}
      {recRows.length > 0 ? (
        <Card size="small" title={`Drawings (${recRows.length})`} styles={{ body: { padding: 0 } }}>
          <Table<RecordRow>
            size="small"
            dataSource={recRows}
            columns={RECORD_COLUMNS}
            pagination={{ pageSize: 6, showSizeChanger: false, size: 'small' }}
            scroll={{ x: 400 }}
          />
        </Card>
      ) : (
        <Text type="secondary" style={{ fontSize: 12, fontStyle: 'italic' }}>
          <ClockCircleOutlined style={{ marginRight: 4 }} />No drawings yet.
        </Text>
      )}
    </div>
  );
}
