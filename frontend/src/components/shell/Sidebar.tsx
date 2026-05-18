import { Menu } from 'antd';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  HomeOutlined,
  InboxOutlined,
  AppstoreOutlined,
  BarChartOutlined,
  SettingOutlined,
} from '@ant-design/icons';

/**
 * Sidebar — shell left nav. v1 stub.
 *
 * Per docs/ui.md § 1, this is role-aware: items appear/hide by the current
 * user's permissions. Role gating is wired in sub-phase 1.12. For now, all
 * items render so the shell is navigable.
 */
export function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation('nav');

  const selectedKey = location.pathname.split('/')[1] || 'projects';

  return (
    <Menu
      mode="inline"
      theme="dark"
      selectedKeys={[selectedKey]}
      style={{ height: '100%', borderRight: 0 }}
      onClick={({ key }) => navigate(`/${key}`)}
      items={[
        { key: 'dashboard', icon: <HomeOutlined />, label: t('sidebar.dashboard') },
        { key: 'inbox', icon: <InboxOutlined />, label: t('sidebar.inbox') },
        { key: 'projects', icon: <AppstoreOutlined />, label: t('sidebar.projects') },
        { key: 'reports', icon: <BarChartOutlined />, label: t('sidebar.reports') },
        { type: 'divider' },
        {
          key: 'admin',
          icon: <SettingOutlined />,
          label: t('sidebar.admin'),
          children: [
            { key: 'admin/users', label: t('sidebar.adminUsers') },
            { key: 'admin/forms', label: t('sidebar.adminForms') },
            { key: 'admin/feature-flags', label: t('sidebar.adminFeatureFlags') },
          ],
        },
      ]}
    />
  );
}
