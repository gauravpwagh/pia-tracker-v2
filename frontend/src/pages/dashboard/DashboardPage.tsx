/**
 * DashboardPage — activity-wise cumulative KPI view.
 *
 * Filter bar uses checkbox dropdowns (Select-all + per-item checkboxes).
 * Each activity section shows dashboards.md-specified KPIs for that activity type.
 *
 * KPIs per activity (dashboards.md §4-8):
 *   Land Acquisition   → Total Records | Authenticated | Pending | SLA Breaches
 *   Utility Shifting   → Total Items   | Shifted       | Pending | SLA Breaches
 *   Forest Clearance   → Total Cases   | Cleared       | In Progress | SLA Breaches
 *   Drawing Approval   → Total Drawings | Approved | In Approval | Sent Back
 *   Tender Packaging   → Total Packages | Finalized | Pending | SLA Breaches
 *   Office Space       → Total Spaces  | Cleared   | Pending | SLA Breaches
 */

import { useMemo, useEffect, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  Col,
  Collapse,
  Divider,
  Dropdown,
  Progress,
  Row,
  Space,
  Spin,
  Statistic,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  DownOutlined,
  ExclamationCircleOutlined,
  FileOutlined,
  FilterOutlined,
  SendOutlined,
  SyncOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@stores/authStore';
import {
  fetchAccessibleScope,
  fetchCumulativeDashboard,
  fetchZoneDashboard,
  type AccessibleScopeDto,
  type CumulativeActivitySummaryDto,
  type ZoneProjectDto,
  type ZoneSummaryDto,
} from '@api/dashboard';
import { LandAcquisitionDashboard } from '@pages/projects/dashboards/LandAcquisitionDashboard';
import { UtilityShiftingDashboard } from '@pages/projects/dashboards/UtilityShiftingDashboard';
import { ForestClearanceDashboard } from '@pages/projects/dashboards/ForestClearanceDashboard';
import { DrawingApprovalDashboard } from '@pages/projects/dashboards/DrawingApprovalDashboard';
import { TenderOfficeDashboard } from '@pages/projects/dashboards/TenderOfficeDashboard';

const { Title, Text } = Typography;

// ── Checkbox dropdown (Select-all + per-item checkboxes) ──────────────────────

interface CheckboxDropdownOption {
  value: string;
  label: string;
}

interface CheckboxDropdownProps {
  label: string;
  options: CheckboxDropdownOption[];
  value: string[];
  onChange: (values: string[]) => void;
  disabled?: boolean;
}

function CheckboxDropdown({
  label,
  options,
  value,
  onChange,
  disabled = false,
}: CheckboxDropdownProps) {
  const [open, setOpen] = useState(false);

  const allSelected = options.length > 0 && value.length === options.length;
  const someSelected = value.length > 0 && value.length < options.length;
  const valueSet = useMemo(() => new Set(value), [value]);

  const handleAll = (checked: boolean) => {
    onChange(checked ? options.map((o) => o.value) : []);
  };

  const handleItem = (v: string, checked: boolean) => {
    if (checked) {
      onChange([...value, v]);
    } else {
      onChange(value.filter((id) => id !== v));
    }
  };

  const summaryText =
    allSelected ? 'All' : value.length === 0 ? 'None' : `${value.length} selected`;

  return (
    <Dropdown
      open={disabled ? false : open}
      // onOpenChange fires when clicking outside (close) or on the trigger (open/close).
      // We let it manage open/close freely; checkbox clicks are stopped below.
      onOpenChange={(v) => { if (!disabled) setOpen(v); }}
      trigger={['click']}
      dropdownRender={() => (
        // stopPropagation prevents checkbox/row clicks from bubbling to the
        // Dropdown overlay-click handler, which would close the panel.
        <div onClick={(e) => e.stopPropagation()}>
          <div
            style={{
              background: 'var(--ant-color-bg-elevated)',
              border: '1px solid var(--ant-color-border)',
              borderRadius: 6,
              boxShadow: '0 6px 16px rgba(0,0,0,.12)',
              minWidth: 220,
              maxWidth: 320,
              maxHeight: 340,
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {/* Select all */}
            <div
              style={{
                padding: '8px 12px',
                borderBottom: '1px solid var(--ant-color-border)',
                flexShrink: 0,
                cursor: 'pointer',
              }}
              onClick={() => handleAll(!allSelected)}
            >
              <Checkbox
                indeterminate={someSelected}
                checked={allSelected}
                onChange={(e) => handleAll(e.target.checked)}
              >
                <Text style={{ fontSize: 13, fontWeight: 500 }}>Select all</Text>
              </Checkbox>
            </div>

            {/* Scrollable items */}
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {options.map((opt) => (
                <div
                  key={opt.value}
                  style={{ padding: '5px 12px', cursor: 'pointer' }}
                  onClick={() => handleItem(opt.value, !valueSet.has(opt.value))}
                >
                  <Checkbox
                    checked={valueSet.has(opt.value)}
                    onChange={(e) => handleItem(opt.value, e.target.checked)}
                  >
                    <Text style={{ fontSize: 13 }}>{opt.label}</Text>
                  </Checkbox>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    >
      {/* No onClick here — Dropdown's trigger handles open/close */}
      <Button
        size="small"
        disabled={disabled}
        style={{ minWidth: 140, textAlign: 'left' }}
      >
        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
          <span>
            <Text type="secondary" style={{ fontSize: 12 }}>{label}: </Text>
            <Text style={{ fontSize: 12 }}>{summaryText}</Text>
          </span>
          <DownOutlined style={{ fontSize: 10 }} />
        </Space>
      </Button>
    </Dropdown>
  );
}

// ── Activity KPI definitions ───────────────────────────────────────────────────

interface KpiDef {
  label: string;
  getValue: (s: CumulativeActivitySummaryDto) => number;
  icon: React.ReactNode;
  color?: string;
  /** If true, this KPI gets a "/ total" percentage sub-line */
  showPct?: boolean;
  totalGetter?: (s: CumulativeActivitySummaryDto) => number;
}

interface ActivityDef {
  code: string;
  label: string;
  accentColor: string;
  kpis: KpiDef[];
  /** Primary KPI index (used for progress bar numerator) */
  progressNumerator: (s: CumulativeActivitySummaryDto) => number;
  progressDenominator: (s: CumulativeActivitySummaryDto) => number;
  progressLabel: string;
}

const ACTIVITIES: ActivityDef[] = [
  // §4 Land Acquisition
  {
    code: 'LAND_ACQUISITION',
    label: 'Land Acquisition',
    accentColor: '#52c41a',
    progressNumerator: (s) => s.authenticatedCount,
    progressDenominator: (s) => s.totalRecords,
    progressLabel: 'Records authenticated',
    kpis: [
      {
        label: 'Total Records',
        getValue: (s) => s.totalRecords,
        icon: <FileOutlined />,
      },
      {
        label: 'Authenticated',
        getValue: (s) => s.authenticatedCount,
        icon: <CheckCircleOutlined />,
        color: '#52c41a',
        showPct: true,
        totalGetter: (s) => s.totalRecords,
      },
      {
        label: 'Pending',
        getValue: (s) => s.totalRecords - s.authenticatedCount,
        icon: <ClockCircleOutlined />,
        color: '#fa8c16',
      },
      {
        label: 'SLA Breaches',
        getValue: (s) => s.slaBreachCount,
        icon: <ExclamationCircleOutlined />,
        color: '#ff4d4f',
      },
    ],
  },
  // §5 Utility Shifting
  {
    code: 'UTILITY_SHIFTING',
    label: 'Utility Shifting',
    accentColor: '#1677ff',
    progressNumerator: (s) => s.authenticatedCount,
    progressDenominator: (s) => s.totalRecords,
    progressLabel: 'Items shifted',
    kpis: [
      {
        label: 'Total Items',
        getValue: (s) => s.totalRecords,
        icon: <FileOutlined />,
      },
      {
        label: 'Shifted',
        getValue: (s) => s.authenticatedCount,
        icon: <CheckCircleOutlined />,
        color: '#52c41a',
        showPct: true,
        totalGetter: (s) => s.totalRecords,
      },
      {
        label: 'Pending',
        getValue: (s) => s.totalRecords - s.authenticatedCount,
        icon: <ClockCircleOutlined />,
        color: '#fa8c16',
      },
      {
        label: 'SLA Breaches',
        getValue: (s) => s.slaBreachCount,
        icon: <ExclamationCircleOutlined />,
        color: '#ff4d4f',
      },
    ],
  },
  // §6 Forest Clearance
  {
    code: 'FOREST_CLEARANCE',
    label: 'Forest Clearance',
    accentColor: '#389e0d',
    progressNumerator: (s) => s.authenticatedCount,
    progressDenominator: (s) => s.totalRecords,
    progressLabel: 'Cases cleared',
    kpis: [
      {
        label: 'Total Cases',
        getValue: (s) => s.totalRecords,
        icon: <FileOutlined />,
      },
      {
        label: 'Cleared',
        getValue: (s) => s.authenticatedCount,
        icon: <CheckCircleOutlined />,
        color: '#52c41a',
        showPct: true,
        totalGetter: (s) => s.totalRecords,
      },
      {
        label: 'In Progress',
        getValue: (s) => s.submittedCount + s.verifiedCount,
        icon: <SyncOutlined />,
        color: '#1677ff',
      },
      {
        label: 'SLA Breaches',
        getValue: (s) => s.slaBreachCount,
        icon: <ExclamationCircleOutlined />,
        color: '#ff4d4f',
      },
    ],
  },
  // §7 Drawing Approval — 5 KPIs per spec
  {
    code: 'DRAWING_APPROVAL',
    label: 'Drawing Approval',
    accentColor: '#9254de',
    progressNumerator: (s) => s.authenticatedCount,
    progressDenominator: (s) => s.totalRecords,
    progressLabel: 'Drawings approved',
    kpis: [
      {
        label: 'Total Drawings',
        getValue: (s) => s.totalRecords,
        icon: <FileOutlined />,
      },
      {
        label: 'Approved',
        getValue: (s) => s.authenticatedCount,
        icon: <CheckCircleOutlined />,
        color: '#52c41a',
        showPct: true,
        totalGetter: (s) => s.totalRecords,
      },
      {
        label: 'In Approval',
        getValue: (s) => s.submittedCount + s.verifiedCount,
        icon: <SyncOutlined />,
        color: '#1677ff',
      },
      {
        label: 'Sent Back',
        getValue: (s) => s.sentBackCount,
        icon: <SendOutlined style={{ transform: 'rotate(180deg)' }} />,
        color: '#fa8c16',
      },
      {
        label: 'SLA Breaches',
        getValue: (s) => s.slaBreachCount,
        icon: <ExclamationCircleOutlined />,
        color: '#ff4d4f',
      },
    ],
  },
  // §8 Tender Packaging
  {
    code: 'TENDER_PACKAGING',
    label: 'Tender Packaging',
    accentColor: '#fa8c16',
    progressNumerator: (s) => s.authenticatedCount,
    progressDenominator: (s) => s.totalRecords,
    progressLabel: 'Packages finalized',
    kpis: [
      {
        label: 'Total Packages',
        getValue: (s) => s.totalRecords,
        icon: <FileOutlined />,
      },
      {
        label: 'Finalized',
        getValue: (s) => s.authenticatedCount,
        icon: <CheckCircleOutlined />,
        color: '#52c41a',
        showPct: true,
        totalGetter: (s) => s.totalRecords,
      },
      {
        label: 'Pending',
        getValue: (s) => s.totalRecords - s.authenticatedCount,
        icon: <ClockCircleOutlined />,
        color: '#fa8c16',
      },
      {
        label: 'SLA Breaches',
        getValue: (s) => s.slaBreachCount,
        icon: <ExclamationCircleOutlined />,
        color: '#ff4d4f',
      },
    ],
  },
  // §8 Temporary Office Space
  {
    code: 'TEMPORARY_OFFICE_SPACE',
    label: 'Temporary Office Space',
    accentColor: '#08979c',
    progressNumerator: (s) => s.authenticatedCount,
    progressDenominator: (s) => s.totalRecords,
    progressLabel: 'Spaces cleared',
    kpis: [
      {
        label: 'Total Spaces',
        getValue: (s) => s.totalRecords,
        icon: <FileOutlined />,
      },
      {
        label: 'Cleared',
        getValue: (s) => s.authenticatedCount,
        icon: <CheckCircleOutlined />,
        color: '#52c41a',
        showPct: true,
        totalGetter: (s) => s.totalRecords,
      },
      {
        label: 'Pending',
        getValue: (s) => s.totalRecords - s.authenticatedCount,
        icon: <ClockCircleOutlined />,
        color: '#fa8c16',
      },
      {
        label: 'SLA Breaches',
        getValue: (s) => s.slaBreachCount,
        icon: <ExclamationCircleOutlined />,
        color: '#ff4d4f',
      },
    ],
  },
];

// ── Per-activity detail dashboard (shown when a single project is selected) ───

interface ActivityDetailProps {
  activityTypeCode: string;
  projectId: string;
}

function ActivityDetailDashboard({ activityTypeCode, projectId }: ActivityDetailProps) {
  if (activityTypeCode === 'LAND_ACQUISITION')
    return <LandAcquisitionDashboard projectId={projectId} />;
  if (activityTypeCode === 'UTILITY_SHIFTING')
    return <UtilityShiftingDashboard projectId={projectId} />;
  if (activityTypeCode === 'FOREST_CLEARANCE')
    return <ForestClearanceDashboard projectId={projectId} />;
  if (activityTypeCode === 'DRAWING_APPROVAL')
    return <DrawingApprovalDashboard projectId={projectId} />;
  if (activityTypeCode === 'TENDER_PACKAGING')
    return <TenderOfficeDashboard projectId={projectId} activityTypeCode="TENDER_PACKAGING" />;
  if (activityTypeCode === 'TEMPORARY_OFFICE_SPACE')
    return <TenderOfficeDashboard projectId={projectId} activityTypeCode="TEMPORARY_OFFICE_SPACE" />;
  return null;
}

// ── KPI card for one activity ─────────────────────────────────────────────────

interface ActivityKpiCardProps {
  def: ActivityDef;
  summary: CumulativeActivitySummaryDto | undefined;
  loading: boolean;
  /** Set when exactly one project is selected — enables the detail drill-down. */
  singleProjectId: string | null;
}

function ActivityKpiCard({ def, summary, loading, singleProjectId }: ActivityKpiCardProps) {
  const total = summary?.totalRecords ?? 0;
  const slaBreaches = summary?.slaBreachCount ?? 0;

  const numerator = summary ? def.progressNumerator(summary) : 0;
  const denominator = summary ? def.progressDenominator(summary) : 0;
  const pct = denominator > 0 ? Math.round((numerator / denominator) * 100) : 0;

  // Columns span: 5 KPIs → xs:12 sm:{ flex: '20%' }; 4 KPIs → xs:12 sm:6
  const colSpan = def.kpis.length === 5 ? undefined : 6;
  const colFlex = def.kpis.length === 5 ? '20%' : undefined;

  return (
    <Card
      size="small"
      style={{ borderLeft: `4px solid ${def.accentColor}`, marginBottom: 16 }}
      title={
        <Space>
          <span style={{ color: def.accentColor, fontWeight: 700 }}>{def.label}</span>
          {slaBreaches > 0 && (
            <Tag color="red" icon={<ExclamationCircleOutlined />}>
              {slaBreaches} SLA breach{slaBreaches !== 1 ? 'es' : ''}
            </Tag>
          )}
        </Space>
      }
    >
      <Spin spinning={loading}>
        {total === 0 && !loading ? (
          <Text type="secondary" style={{ fontSize: 13 }}>
            No records yet.
          </Text>
        ) : (
          <>
            <Row gutter={[24, 16]} style={{ marginBottom: 12 }}>
              {def.kpis.map((kpi) => {
                const val = summary ? kpi.getValue(summary) : 0;
                const pctVal =
                  kpi.showPct && kpi.totalGetter && summary
                    ? kpi.totalGetter(summary) > 0
                      ? Math.round((val / kpi.totalGetter(summary)) * 100)
                      : 0
                    : null;
                const effectiveColor =
                  kpi.color === '#ff4d4f' && val === 0
                    ? undefined
                    : kpi.color === '#fa8c16' && val === 0
                      ? undefined
                      : kpi.color;

                return (
                  <Col key={kpi.label} xs={12} sm={colSpan} flex={colFlex}>
                    <Statistic
                      title={
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {kpi.label}
                        </Text>
                      }
                      value={val}
                      prefix={
                        <span style={{ color: effectiveColor ?? 'var(--ant-color-text-secondary)' }}>
                          {kpi.icon}
                        </span>
                      }
                      suffix={
                        pctVal !== null ? (
                          <Text type="secondary" style={{ fontSize: 13 }}>
                            {' '}({pctVal}%)
                          </Text>
                        ) : undefined
                      }
                      valueStyle={{
                        fontSize: 22,
                        fontWeight: 700,
                        color: effectiveColor,
                      }}
                    />
                  </Col>
                );
              })}
            </Row>

            {denominator > 0 && (
              <div>
                <div
                  style={{
                    marginBottom: 4,
                    display: 'flex',
                    justifyContent: 'space-between',
                  }}
                >
                  <Text style={{ fontSize: 12 }} type="secondary">
                    {def.progressLabel}
                  </Text>
                  <Text style={{ fontSize: 12 }}>{pct}%</Text>
                </div>
                <Progress
                  percent={pct}
                  strokeColor={def.accentColor}
                  showInfo={false}
                  size="small"
                  style={{ marginBottom: 0 }}
                />
              </div>
            )}

            {/* Detail drill-down — only when a single project is in scope */}
            {singleProjectId ? (
              <Collapse
                ghost
                size="small"
                style={{ marginTop: 12 }}
                items={[{
                  key: 'detail',
                  label: <Text type="secondary" style={{ fontSize: 12 }}>Details</Text>,
                  children: (
                    <ActivityDetailDashboard
                      activityTypeCode={def.code}
                      projectId={singleProjectId}
                    />
                  ),
                }]}
              />
            ) : (
              total > 0 && (
                <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 10 }}>
                  Select a single project to see detailed breakdown.
                </Text>
              )
            )}
          </>
        )}
      </Spin>
    </Card>
  );
}

// ── Filter bar ────────────────────────────────────────────────────────────────

interface FilterBarProps {
  scope: AccessibleScopeDto;
  selectedZoneIds: string[];
  selectedProjectIds: string[];
  onZoneChange: (ids: string[]) => void;
  onProjectChange: (ids: string[]) => void;
  projectCount: number | undefined;
}

function FilterBar({
  scope,
  selectedZoneIds,
  selectedProjectIds,
  onZoneChange,
  onProjectChange,
  projectCount,
}: FilterBarProps) {
  const zoneOptions: CheckboxDropdownOption[] = scope.zones.map((z) => ({
    value: z.id,
    label: `${z.code} — ${z.name}`,
  }));

  // Narrow project options to selected zones for PAN_INDIA users.
  const visibleProjects = useMemo(() => {
    if (scope.zoneFilterEnabled && selectedZoneIds.length < scope.zones.length) {
      const zoneSet = new Set(selectedZoneIds);
      return scope.projects.filter((p) => zoneSet.has(p.zoneId));
    }
    return scope.projects;
  }, [scope.projects, scope.zones.length, scope.zoneFilterEnabled, selectedZoneIds]);

  const projectOptions: CheckboxDropdownOption[] = visibleProjects.map((p) => ({
    value: p.id,
    label: p.projectCode ? `${p.projectCode} — ${p.name}` : p.name,
  }));

  return (
    <Card
      size="small"
      style={{ marginBottom: 16 }}
      styles={{ body: { padding: '10px 16px' } }}
    >
      <Space align="center" wrap size={12}>
        <Space size={4}>
          <FilterOutlined style={{ color: 'var(--ant-color-text-secondary)', fontSize: 13 }} />
          <Text type="secondary" style={{ fontSize: 13 }}>
            Filters
          </Text>
        </Space>

        <CheckboxDropdown
          label="Zone"
          options={zoneOptions}
          value={selectedZoneIds}
          onChange={onZoneChange}
          disabled={!scope.zoneFilterEnabled}
        />

        <CheckboxDropdown
          label="Projects"
          options={projectOptions}
          value={selectedProjectIds}
          onChange={onProjectChange}
        />

        {projectCount !== undefined && (
          <Badge
            count={projectCount}
            style={{
              backgroundColor: 'var(--ant-color-primary)',
              fontSize: 11,
            }}
            overflowCount={999}
          >
            <Text type="secondary" style={{ fontSize: 12, paddingRight: 8 }}>
              projects
            </Text>
          </Badge>
        )}
      </Space>
    </Card>
  );
}

// ── Zone / PAN India projects section ────────────────────────────────────────

const LIFECYCLE_LABELS: Record<string, string> = {
  DRAFT:                   'Draft',
  AWAITING_CAO_ALLOCATION: 'Awaiting CAO/C',
  AWAITING_CEC_ASSIGNMENT: 'Awaiting CE/C',
  ACTIVE:                  'Active',
  CLOSED:                  'Closed',
  CANCELLED:               'Cancelled',
};

const LIFECYCLE_COLORS: Record<string, string> = {
  DRAFT:                   'default',
  AWAITING_CAO_ALLOCATION: 'orange',
  AWAITING_CEC_ASSIGNMENT: 'gold',
  ACTIVE:                  'green',
  CLOSED:                  'default',
  CANCELLED:               'red',
};

const PROJECT_COLUMNS: ColumnsType<ZoneProjectDto & { zoneLabel?: string }> = [
  {
    title: 'Code',
    dataIndex: 'projectCode',
    key: 'code',
    width: 100,
    render: (v: string | null) => v ?? <Text type="secondary">—</Text>,
  },
  { title: 'Name', dataIndex: 'name', key: 'name', ellipsis: true },
  {
    title: 'Division',
    dataIndex: 'divisionName',
    key: 'division',
    width: 110,
    ellipsis: true,
    render: (v: string | null) => v ?? <Text type="secondary">—</Text>,
  },
  {
    title: 'Status',
    dataIndex: 'lifecycleState',
    key: 'state',
    width: 120,
    render: (s: string) => (
      <Tag color={LIFECYCLE_COLORS[s] ?? 'default'} style={{ fontSize: 11, margin: 0 }}>
        {LIFECYCLE_LABELS[s] ?? s.replace(/_/g, ' ')}
      </Tag>
    ),
  },
  {
    title: 'Days since RB',
    dataIndex: 'daysSinceRbRecommendation',
    key: 'rbDays',
    width: 110,
    sorter: (a, b) =>
      (a.daysSinceRbRecommendation ?? 0) - (b.daysSinceRbRecommendation ?? 0),
    render: (v: number | null) =>
      v !== null ? (
        <Text style={{ color: v > 365 ? '#ff4d4f' : undefined }}>{v}d</Text>
      ) : (
        <Text type="secondary">—</Text>
      ),
  },
  {
    title: 'SLA',
    dataIndex: 'slaBreachCount',
    key: 'sla',
    width: 60,
    sorter: (a, b) => a.slaBreachCount - b.slaBreachCount,
    render: (v: number) =>
      v > 0 ? (
        <Tag color="red" style={{ fontSize: 11, margin: 0 }}>
          {v}
        </Tag>
      ) : (
        <Text type="secondary" style={{ fontSize: 11 }}>
          0
        </Text>
      ),
  },
  {
    title: 'Drawings in approval',
    dataIndex: 'drawingsInApproval',
    key: 'drawings',
    width: 140,
    sorter: (a, b) => a.drawingsInApproval - b.drawingsInApproval,
    render: (v: number) =>
      v > 0 ? <Text style={{ color: '#9254de' }}>{v}</Text> : <Text type="secondary">0</Text>,
  },
];

function ZoneCard({ zone }: { zone: ZoneSummaryDto }) {
  const projects = zone.projects ?? [];
  const header = (
    <Space>
      <Text strong style={{ fontSize: 13 }}>
        {zone.zoneCode} — {zone.zoneName}
      </Text>
      <Tag color="blue" style={{ fontSize: 11, margin: 0 }}>
        {zone.projectsActive} active
      </Tag>
      {zone.projectsWithSlaBreaches > 0 && (
        <Tag color="red" style={{ fontSize: 11, margin: 0 }}>
          {zone.projectsWithSlaBreaches} SLA breach{zone.projectsWithSlaBreaches !== 1 ? 'es' : ''}
        </Tag>
      )}
      {zone.totalDrawingsInApproval > 0 && (
        <Tag color="purple" style={{ fontSize: 11, margin: 0 }}>
          {zone.totalDrawingsInApproval} drawings in approval
        </Tag>
      )}
    </Space>
  );

  return (
    <Collapse
      size="small"
      style={{ marginBottom: 8 }}
      items={[{
        key: zone.zoneId,
        label: header,
        children: (
          <Table<ZoneProjectDto>
            size="small"
            dataSource={projects}
            columns={PROJECT_COLUMNS}
            rowKey="projectId"
            pagination={{ pageSize: 10, showSizeChanger: false, size: 'small',
              hideOnSinglePage: true }}
            scroll={{ x: 700 }}
          />
        ),
      }]}
    />
  );
}

function ZoneSection({ currentUser }: { currentUser: unknown }) {
  const { data: zoneData, isLoading, isError } = useQuery({
    queryKey: ['dashboard', 'zone'],
    queryFn: fetchZoneDashboard,
    enabled: !!currentUser,
    staleTime: 60_000,
    retry: 1,
  });

  if (isLoading) return <Spin size="small" style={{ display: 'block', margin: '16px 0' }} />;
  if (isError) return null; // silently hide — user may lack DASHBOARD.VIEW.ZONE
  if (!zoneData || zoneData.zones.length === 0) return null;

  return (
    <div style={{ marginTop: 8 }}>
      <Divider orientation="left" style={{ fontSize: 13, margin: '16px 0 12px' }}>
        Projects by Zone
      </Divider>
      {zoneData.zones.map((z) => (
        <ZoneCard key={z.zoneId} zone={z} />
      ))}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { currentUser } = useAuthStore();

  // ── Accessible scope ───────────────────────────────────────────────────────
  const {
    data: scope,
    isLoading: scopeLoading,
    error: scopeError,
  } = useQuery({
    queryKey: ['dashboard', 'accessible-scope'],
    queryFn: fetchAccessibleScope,
    enabled: !!currentUser,
    staleTime: 60_000,
  });

  // ── Filter state ───────────────────────────────────────────────────────────
  const [selectedZoneIds, setSelectedZoneIds] = useState<string[]>([]);
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  const [filtersInitialized, setFiltersInitialized] = useState(false);

  useEffect(() => {
    if (scope && !filtersInitialized) {
      setSelectedZoneIds(scope.zones.map((z) => z.id));
      setSelectedProjectIds(scope.projects.map((p) => p.id));
      setFiltersInitialized(true);
    }
  }, [scope, filtersInitialized]);

  const handleZoneChange = (ids: string[]) => {
    setSelectedZoneIds(ids);
    if (scope) {
      const zoneSet = new Set(ids.length > 0 ? ids : scope.zones.map((z) => z.id));
      setSelectedProjectIds(
        scope.projects.filter((p) => zoneSet.has(p.zoneId)).map((p) => p.id),
      );
    }
  };

  // ── Query params (empty = all, avoids huge IN clauses) ────────────────────
  const queryZoneIds = useMemo((): string[] => {
    if (!scope || !filtersInitialized) return [];
    return selectedZoneIds.length === scope.zones.length ? [] : selectedZoneIds;
  }, [scope, selectedZoneIds, filtersInitialized]);

  const queryProjectIds = useMemo((): string[] => {
    if (!scope || !filtersInitialized) return [];
    const zoneSet = new Set(
      selectedZoneIds.length > 0 ? selectedZoneIds : scope.zones.map((z) => z.id),
    );
    const visibleCount = scope.projects.filter((p) => zoneSet.has(p.zoneId)).length;
    return selectedProjectIds.length === visibleCount ? [] : selectedProjectIds;
  }, [scope, selectedZoneIds, selectedProjectIds, filtersInitialized]);

  // ── Cumulative data ────────────────────────────────────────────────────────
  const {
    data: cumulative,
    isLoading: cumulativeLoading,
    error: cumulativeError,
  } = useQuery({
    queryKey: ['dashboard', 'cumulative', queryZoneIds, queryProjectIds],
    queryFn: () => fetchCumulativeDashboard(queryZoneIds, queryProjectIds),
    enabled: !!currentUser && filtersInitialized,
    staleTime: 30_000,
  });

  const summaryByActivity = useMemo(() => {
    const map: Record<string, CumulativeActivitySummaryDto> = {};
    cumulative?.summaries.forEach((s) => {
      map[s.activityTypeCode] = s;
    });
    return map;
  }, [cumulative]);

  // When the filter resolves to exactly one project, pass it to cards for detail drill-down.
  const singleProjectId = useMemo((): string | null => {
    if (!scope || !filtersInitialized) return null;
    // Determine the effective project set (mirrors queryProjectIds logic but returns ids, not empty=[all])
    const zoneSet = new Set(
      selectedZoneIds.length > 0 ? selectedZoneIds : scope.zones.map((z) => z.id),
    );
    const visibleProjects = scope.projects.filter((p) => zoneSet.has(p.zoneId));
    const effectiveIds =
      selectedProjectIds.length === visibleProjects.length
        ? visibleProjects.map((p) => p.id)
        : selectedProjectIds;
    return effectiveIds.length === 1 ? effectiveIds[0] : null;
  }, [scope, filtersInitialized, selectedZoneIds, selectedProjectIds]);

  // ── Render ─────────────────────────────────────────────────────────────────

  if (!currentUser) {
    return (
      <div style={{ padding: 24 }}>
        <Alert type="warning" message="Please log in to view the dashboard." />
      </div>
    );
  }

  if (scopeLoading) {
    return (
      <div style={{ padding: 48, textAlign: 'center' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (scopeError) {
    return (
      <div style={{ padding: 24 }}>
        <Alert
          type="error"
          message="Failed to load dashboard"
          description={(scopeError as Error).message}
        />
      </div>
    );
  }

  if (!scope) return null;

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>
          Dashboard
        </Title>
      </div>

      {filtersInitialized && (
        <FilterBar
          scope={scope}
          selectedZoneIds={selectedZoneIds}
          selectedProjectIds={selectedProjectIds}
          onZoneChange={handleZoneChange}
          onProjectChange={setSelectedProjectIds}
          projectCount={cumulative?.projectCount}
        />
      )}

      {cumulativeError && (
        <Alert
          type="error"
          message="Failed to load activity data"
          description={(cumulativeError as Error).message}
          style={{ marginBottom: 16 }}
        />
      )}

      {ACTIVITIES.map((def) => (
        <ActivityKpiCard
          key={def.code}
          def={def}
          summary={summaryByActivity[def.code]}
          loading={cumulativeLoading}
          singleProjectId={singleProjectId}
        />
      ))}

      <ZoneSection currentUser={currentUser} />
    </div>
  );
}
