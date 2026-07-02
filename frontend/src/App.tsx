import React, { lazy, Suspense, useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Layout, Spin } from 'antd';

import { TopBar } from '@components/shell/TopBar';
import { Sidebar } from '@components/shell/Sidebar';
import { useAuthStore } from '@stores/authStore';

import { HomePage } from '@pages/Home';

const LoginPage    = lazy(() => import('@pages/login/LoginPage'));
const LoginSearchPage = lazy(() => import('@pages/login/LoginSearchPage'));
const ProjectsPage = lazy(() => import('@pages/projects/ProjectsPage'));
const ProjectWorkspace = lazy(() => import('@pages/projects/ProjectWorkspace'));
const RecordEditPage = lazy(() => import('@pages/records/RecordEditPage'));
const InboxPage    = lazy(() => import('@pages/inbox/InboxPage'));
const DashboardPage = lazy(() => import('@pages/dashboard/DashboardPage'));

const { Sider, Content, Header } = Layout;

function ScrollPage({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ height: '100%', overflowY: 'auto', overflowX: 'hidden' }}>
      {children}
    </div>
  );
}

/** Redirects to /login if the user has no active session. Session is already
 *  resolved by App before this renders, so currentUser is authoritative. */
function RequireAuth({ children }: { children: React.ReactNode }) {
  const currentUser = useAuthStore((s) => s.currentUser);
  const location = useLocation();

  if (!currentUser) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}

/** The main app shell (TopBar + Sidebar + content). */
function AppShell() {
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
          style={{ background: '#1047ae', borderRight: 'none' }}
        >
          <Sidebar />
        </Sider>
        <Content style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <Routes>
            <Route path="/" element={<Navigate to="/projects" replace />} />
            <Route path="/projects/*" element={<ProjectsPage />} />
            <Route path="/records/:recordId/edit" element={<RecordEditPage />} />
            <Route path="/inbox" element={<ScrollPage><InboxPage /></ScrollPage>} />
            <Route path="/dashboard" element={<ScrollPage><DashboardPage /></ScrollPage>} />
            <Route path="/admin/*" element={<HomePage />} />
            <Route path="*" element={<HomePage />} />
          </Routes>
        </Content>
      </Layout>
    </Layout>
  );
}

export default function App() {
  const { checkSession } = useAuthStore();

  // Resolve existing session on app load before rendering anything.
  const [checked, setChecked] = React.useState(false);
  useEffect(() => {
    void checkSession().finally(() => setChecked(true));
  }, [checkSession]);

  if (!checked) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <Suspense fallback={<Spin style={{ margin: 40 }} />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/login/search" element={<LoginSearchPage />} />
        <Route
          path="/workspace/:projectCode"
          element={
            <RequireAuth>
              <ProjectWorkspace />
            </RequireAuth>
          }
        />
        <Route
          path="/*"
          element={
            <RequireAuth>
              <AppShell />
            </RequireAuth>
          }
        />
      </Routes>
    </Suspense>
  );
}
