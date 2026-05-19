import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Layout, Spin } from 'antd';

import { TopBar } from '@components/shell/TopBar';
import { Sidebar } from '@components/shell/Sidebar';

// Placeholder pages for v1 scaffolding; real implementations land per docs/phasing.md
import { HomePage } from '@pages/Home';

// Phase 1.9: Record Edit Page (code-split; RJSF is heavy)
const RecordEditPage = lazy(() => import('@pages/records/RecordEditPage'));

const { Sider, Content, Header } = Layout;

export default function App() {
  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header style={{ padding: 0, height: 56, lineHeight: '56px' }}>
        <TopBar />
      </Header>
      <Layout>
        <Sider width={240} collapsible breakpoint="lg" collapsedWidth={64}>
          <Sidebar />
        </Sider>
        <Content style={{ padding: 24 }}>
          <Suspense fallback={<Spin style={{ margin: 40 }} />}>
            <Routes>
              <Route path="/" element={<Navigate to="/projects" replace />} />
              <Route path="/projects/*" element={<HomePage />} />
              <Route path="/records/:recordId/edit" element={<RecordEditPage />} />
              <Route path="/inbox" element={<HomePage />} />
              <Route path="/dashboard" element={<HomePage />} />
              <Route path="/admin/*" element={<HomePage />} />
              <Route path="*" element={<HomePage />} />
            </Routes>
          </Suspense>
        </Content>
      </Layout>
    </Layout>
  );
}
