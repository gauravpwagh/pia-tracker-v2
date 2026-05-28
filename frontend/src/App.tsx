import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Layout, Spin } from 'antd';

import { TopBar } from '@components/shell/TopBar';
import { Sidebar } from '@components/shell/Sidebar';

// Placeholder pages for v1 scaffolding; real implementations land per docs/phasing.md
import { HomePage } from '@pages/Home';

// Phase 1.7+: Projects list + create
const ProjectsPage = lazy(() => import('@pages/projects/ProjectsPage'));

// Phase 1.9: Record Edit Page (code-split; RJSF is heavy)
const RecordEditPage = lazy(() => import('@pages/records/RecordEditPage'));

// Phase 1.12: Inbox page
const InboxPage = lazy(() => import('@pages/inbox/InboxPage'));

// Phase 1.14: Dashboard page
const DashboardPage = lazy(() => import('@pages/dashboard/DashboardPage'));

const { Sider, Content, Header } = Layout;

export default function App() {
  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header style={{ padding: 0, height: 56, lineHeight: '56px' }}>
        <TopBar />
      </Header>
      <Layout style={{ height: 'calc(100vh - 56px)', overflow: 'hidden' }}>
        <Sider
          width={240}
          collapsible
          breakpoint="lg"
          collapsedWidth={64}
          style={{ background: 'var(--ant-color-bg-container)', borderRight: '1px solid var(--ant-color-border)' }}
        >
          <Sidebar />
        </Sider>
        <Content style={{ padding: 24, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <Suspense fallback={<Spin style={{ margin: 40 }} />}>
            <Routes>
              <Route path="/" element={<Navigate to="/projects" replace />} />
              <Route path="/projects/*" element={<ProjectsPage />} />
              <Route path="/records/:recordId/edit" element={<RecordEditPage />} />
              <Route path="/inbox" element={<InboxPage />} />
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/admin/*" element={<HomePage />} />
              <Route path="*" element={<HomePage />} />
            </Routes>
          </Suspense>
        </Content>
      </Layout>
    </Layout>
  );
}
