import { Card, Typography, Space, Tag } from 'antd';
import { useLocation } from 'react-router-dom';

const { Title, Paragraph, Text } = Typography;

/**
 * HomePage — placeholder for every route at v1.
 *
 * Real pages land per docs/phasing.md. This stub renders the current path
 * and a friendly note so the shell is verifiably alive.
 */
export function HomePage() {
  const location = useLocation();
  return (
    <Card style={{ maxWidth: 760, margin: '40px auto' }}>
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Title level={3} style={{ margin: 0 }}>
          PIA Tracker — skeleton
        </Title>
        <Paragraph>
          The application shell is up. Routes, pages, and features land per the plan in{' '}
          <Text code>docs/phasing.md</Text>.
        </Paragraph>
        <Space>
          <Tag color="blue">Current path</Tag>
          <Text code>{location.pathname}</Text>
        </Space>
        <Paragraph type="secondary" style={{ fontSize: 13, marginTop: 16 }}>
          See <Text code>CLAUDE.md</Text> for project orientation, then <Text code>docs/</Text> for
          architecture, database, workflow, permissions, forms, dashboards, UI, API, security,
          testing, deployment, and phasing.
        </Paragraph>
      </Space>
    </Card>
  );
}
