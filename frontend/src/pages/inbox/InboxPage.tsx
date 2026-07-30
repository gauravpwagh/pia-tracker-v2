/**
 * InboxPage — items pending the current user's action.
 *
 * Three tabs:
 *   Awaiting action  — sections whose current state requires the caller's role,
 *                      plus project-lifecycle approval gates (CAO/C allocation,
 *                      CE/C Dy CE/C assignment, EDGS/C-I draft submission).
 *   In progress      — sections the caller created that are being reviewed upstream.
 *   SLA breached     — subset of "awaiting" where the SLA has been exceeded.
 *
 * Clicking a record/section row navigates to the record edit page at the
 * section's tab; clicking a project-approval row navigates to the project
 * workspace, where the allocate/assign action lives.
 */

import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Badge,
  Button,
  Space,
  Spin,
  Table,
  Tabs,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { WarningOutlined } from '@ant-design/icons';
import { fetchInbox, type InboxItem } from '@api/inbox';
import { useAuthStore } from '@stores/authStore';

const { Title } = Typography;

// ── State-code colour mapping (matches section dots in RecordEditPage) ─────────

const STATE_COLORS: Record<string, string> = {
  DRAFT: 'default',
  SUBMITTED_FOR_VERIFICATION: 'processing',
  VERIFIED: 'success',
  AUTHENTICATED: 'purple',
  SENT_BACK_TO_DYCE: 'warning',
  SENT_BACK_TO_NODAL: 'warning',
  AWAITING_CAO_ALLOCATION: 'processing',
  AWAITING_CEC_ASSIGNMENT: 'processing',
};

// ── Action-column config ────────────────────────────────────────────────────
//
// Buttons navigate to where the action actually lives (the record's edit page,
// or the project workspace's assign modal) rather than firing the workflow
// transition inline from the row — mirrors ProjectsPage's row "Action" button
// (#19), and means an officer can't authenticate/verify a record blind
// without opening it first.

/** stateCode -> label for the record/section-level next action. */
const RECORD_ACTION_LABEL: Record<string, string> = {
  DRAFT: 'Submit',
  SENT_BACK_TO_DYCE: 'Resubmit',
  SUBMITTED_FOR_VERIFICATION: 'Verify',
  SENT_BACK_TO_NODAL: 'Re-verify',
  VERIFIED: 'Authenticate',
};

/** stateCode -> label + which ProjectWorkspace assign modal to open for project-lifecycle gates. */
const PROJECT_ACTION: Record<string, { label: string; assign: 'ce' | 'dy' }> = {
  AWAITING_CAO_ALLOCATION: { label: 'Allocate CE/C', assign: 'ce' },
  AWAITING_CEC_ASSIGNMENT: { label: 'Assign Dy CE/C', assign: 'dy' },
};

// ── Table columns ─────────────────────────────────────────────────────────────

function useColumns(t: ReturnType<typeof useTranslation>['t']): ColumnsType<InboxItem> {
  const navigate = useNavigate();
  const currentUser = useAuthStore((s) => s.currentUser);
  const canAllocate = currentUser?.permissions.includes('PROJECT.ALLOCATE') ?? false;
  const canAssignDyce = currentUser?.permissions.includes('PROJECT.ASSIGN_DYCE') ?? false;

  const openRecord = (row: InboxItem) =>
    navigate(
      // project_code is assigned at a later administrative step and is often null —
      // ProjectWorkspace resolves the :projectCode param by code OR id, so id always works.
      `/workspace/${row.projectCode || row.projectId}`,
      row.entityType === 'PROJECT'
        ? undefined
        : { state: { openRecord: { activityTypeCode: row.activityTypeCode, recordId: row.recordId } } },
    );

  return [
    {
      title: t('inbox.table.project'),
      dataIndex: 'projectName',
      key: 'projectName',
      render: (name: string, row: InboxItem) => (
        <a onClick={() => openRecord(row)}>{name}</a>
      ),
    },
    {
      title: t('inbox.table.activity'),
      dataIndex: 'activityName',
      key: 'activityName',
      render: (name: string | null, row: InboxItem) =>
        row.entityType === 'PROJECT' ? t('inbox.table.projectApproval') : name,
    },
    {
      title: t('inbox.table.record'),
      key: 'recordName',
      render: (_: unknown, row: InboxItem) =>
        row.entityType === 'PROJECT' ? '—' : (row.recordName ?? row.recordSubtype ?? '—'),
    },
    {
      title: t('inbox.table.section'),
      dataIndex: 'sectionCode',
      key: 'sectionCode',
      render: (code: string | null) => code?.toUpperCase() ?? '—',
    },
    {
      title: t('inbox.table.state'),
      dataIndex: 'stateLabel',
      key: 'stateLabel',
      render: (label: string, row: InboxItem) => (
        <Space>
          <Tag color={STATE_COLORS[row.stateCode] ?? 'default'}>{label}</Tag>
          {row.isSlaBreached && (
            <WarningOutlined style={{ color: '#ff4d4f' }} title={t('inbox.table.slaBreach')} />
          )}
        </Space>
      ),
    },
    {
      title: t('inbox.table.daysPending'),
      dataIndex: 'daysPending',
      key: 'daysPending',
      align: 'right',
      sorter: (a: InboxItem, b: InboxItem) => a.daysPending - b.daysPending,
      render: (days: number) => days === 0 ? t('inbox.table.today') : `${days}d`,
    },
    {
      title: t('inbox.table.action'),
      key: 'action',
      width: 130,
      fixed: 'right' as const,
      render: (_: unknown, row: InboxItem) => {
        if (row.entityType === 'PROJECT') {
          const cfg = PROJECT_ACTION[row.stateCode];
          const allowed = cfg && (cfg.assign === 'ce' ? canAllocate : canAssignDyce);
          if (!allowed) return null;
          return (
            <Button
              size="small"
              type="primary"
              style={{ background: '#1565c0', borderColor: '#1565c0' }}
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/workspace/${row.projectCode || row.projectId}?view=overview&assign=${cfg.assign}`);
              }}
            >
              {cfg.label}
            </Button>
          );
        }
        const label = RECORD_ACTION_LABEL[row.stateCode];
        if (!label) return null;
        return (
          <Button
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              openRecord(row);
            }}
          >
            {label}
          </Button>
        );
      },
    },
  ];
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function InboxPage() {
  const { t } = useTranslation('nav');
  const columns = useColumns(t);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['inbox'],
    queryFn: fetchInbox,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
        <Spin size="large" />
      </div>
    );
  }

  if (isError) {
    return <div style={{ padding: '16px 24px' }}><Alert type="error" message={t('inbox.loadFailed')} showIcon /></div>;
  }

  const awaiting   = data?.awaiting   ?? [];
  const inProgress = data?.inProgress ?? [];
  const slaBreached = data?.slaBreached ?? [];

  const tabItems = [
    {
      key: 'awaiting',
      label: (
        <Badge count={awaiting.length} offset={[8, 0]} size="small" color="blue">
          {t('inbox.tabs.awaiting')}
        </Badge>
      ),
      children: (
        <Table<InboxItem>
          rowKey="instanceId"
          columns={columns}
          dataSource={awaiting}
          size="small"
          pagination={{ pageSize: 20 }}
          scroll={{ x: 'max-content' }}
        />
      ),
    },
    {
      key: 'inProgress',
      label: (
        <Badge count={inProgress.length} offset={[8, 0]} size="small" color="blue">
          {t('inbox.tabs.inProgress')}
        </Badge>
      ),
      children: (
        <Table<InboxItem>
          rowKey="instanceId"
          columns={columns}
          dataSource={inProgress}
          size="small"
          pagination={{ pageSize: 20 }}
          scroll={{ x: 'max-content' }}
        />
      ),
    },
    {
      key: 'slaBreached',
      label: (
        <Badge count={slaBreached.length} offset={[8, 0]} size="small" color="orange">
          {t('inbox.tabs.slaBreached')}
        </Badge>
      ),
      children: (
        <Table<InboxItem>
          rowKey="instanceId"
          columns={columns}
          dataSource={slaBreached}
          size="small"
          pagination={{ pageSize: 20 }}
          scroll={{ x: 'max-content' }}
        />
      ),
    },
  ];

  return (
    <div style={{ padding: '16px 24px' }}>
      <Title level={4} style={{ margin: '0 0 16px' }}>
        {t('sidebar.inbox')}
      </Title>
      <Tabs defaultActiveKey="awaiting" items={tabItems} />
    </div>
  );
}
