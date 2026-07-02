/**
 * InboxPage — items pending the current user's action.
 *
 * Three tabs:
 *   Awaiting action  — sections whose current state requires the caller's role.
 *   In progress      — sections the caller created that are being reviewed upstream.
 *   SLA breached     — subset of "awaiting" where the SLA has been exceeded.
 *
 * Clicking any row navigates to the record edit page at the section's tab.
 */

import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Badge,
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

const { Title } = Typography;

// ── State-code colour mapping (matches section dots in RecordEditPage) ─────────

const STATE_COLORS: Record<string, string> = {
  DRAFT: 'default',
  SUBMITTED_FOR_VERIFICATION: 'processing',
  VERIFIED: 'success',
  AUTHENTICATED: 'purple',
  SENT_BACK_TO_DYCE: 'warning',
  SENT_BACK_TO_NODAL: 'warning',
};

// ── Table columns ─────────────────────────────────────────────────────────────

function useColumns(t: ReturnType<typeof useTranslation>['t']): ColumnsType<InboxItem> {
  const navigate = useNavigate();

  return [
    {
      title: t('inbox.table.project'),
      dataIndex: 'projectName',
      key: 'projectName',
      render: (name: string, row: InboxItem) => (
        <a onClick={() => navigate(`/records/${row.recordId}/edit`, { state: { returnPath: '/inbox' } })}>
          {name}
        </a>
      ),
    },
    {
      title: t('inbox.table.activity'),
      dataIndex: 'activityName',
      key: 'activityName',
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
