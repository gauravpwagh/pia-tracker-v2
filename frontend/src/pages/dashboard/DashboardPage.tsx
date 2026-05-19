/**
 * DashboardPage — KPI strip for a project's activity summaries.
 *
 * Route: /dashboard?projectId={uuid}
 *
 * Reads from GET /api/v1/dashboard/projects/{projectId}.
 * Displays one stat card per activity type with breakdown of states.
 * Requires DASHBOARD.VIEW.PROJECT (or higher) permission.
 */

import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Alert,
  Card,
  Col,
  Flex,
  Row,
  Spin,
  Statistic,
  Tag,
  Typography,
} from 'antd';
import dayjs from 'dayjs';
import { fetchProjectDashboard, type ActivitySummaryDto } from '@api/dashboard';

const { Title, Text } = Typography;

// ── KPI card ──────────────────────────────────────────────────────────────────

function ActivityKpiCard({ summary }: { summary: ActivitySummaryDto }) {
  const label = summary.activityTypeCode
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <Card
      size="small"
      title={label}
      extra={
        <Text type="secondary" style={{ fontSize: 11 }}>
          Updated {dayjs(summary.updatedAt).fromNow()}
        </Text>
      }
      style={{ marginBottom: 16 }}
    >
      <Row gutter={[12, 8]}>
        <Col span={8}>
          <Statistic title="Total" value={summary.totalRecords} />
        </Col>
        <Col span={8}>
          <Statistic
            title="Authenticated"
            value={summary.authenticatedCount}
            valueStyle={{ color: '#722ed1' }}
          />
        </Col>
        <Col span={8}>
          <Statistic
            title="Verified"
            value={summary.verifiedCount}
            valueStyle={{ color: '#52c41a' }}
          />
        </Col>
      </Row>

      <Flex wrap="wrap" gap={6} style={{ marginTop: 12 }}>
        {summary.draftCount > 0 && (
          <Tag>{summary.draftCount} Draft</Tag>
        )}
        {summary.submittedCount > 0 && (
          <Tag color="processing">{summary.submittedCount} Submitted</Tag>
        )}
        {summary.verifiedCount > 0 && (
          <Tag color="success">{summary.verifiedCount} Verified</Tag>
        )}
        {summary.authenticatedCount > 0 && (
          <Tag color="purple">{summary.authenticatedCount} Authenticated</Tag>
        )}
        {summary.sentBackCount > 0 && (
          <Tag color="warning">{summary.sentBackCount} Sent Back</Tag>
        )}
      </Flex>
    </Card>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get('projectId');

  const { data, isLoading, error } = useQuery({
    queryKey: ['dashboard', 'project', projectId],
    queryFn: () => fetchProjectDashboard(projectId!),
    enabled: !!projectId,
    refetchInterval: 60_000,
  });

  if (!projectId) {
    return (
      <Alert
        type="info"
        message="Select a project to view its dashboard"
        description="Use the project list to navigate to a specific project's dashboard."
      />
    );
  }

  if (isLoading) {
    return (
      <Flex justify="center" align="center" style={{ minHeight: 300 }}>
        <Spin size="large" tip="Loading dashboard…" />
      </Flex>
    );
  }

  if (error) {
    return (
      <Alert
        type="error"
        message="Dashboard failed to load"
        description={String(error)}
      />
    );
  }

  const summaries = data?.summaries ?? [];

  return (
    <div style={{ padding: '24px 0' }}>
      <Title level={4} style={{ marginBottom: 24 }}>
        Project Activity Dashboard
      </Title>

      {summaries.length === 0 ? (
        <Alert
          type="info"
          message="No activity data yet"
          description="Activity summaries will appear here once records have been submitted through the workflow."
        />
      ) : (
        summaries.map((s) => (
          <ActivityKpiCard key={s.activityTypeCode} summary={s} />
        ))
      )}
    </div>
  );
}
