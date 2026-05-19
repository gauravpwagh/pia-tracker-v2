import { useMemo } from 'react';
import { Badge, Menu } from 'antd';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import {
  HomeOutlined,
  InboxOutlined,
  AppstoreOutlined,
  BarChartOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import { useAuthStore } from '@stores/authStore';
import { fetchInbox } from '@api/inbox';

/**
 * Sidebar — shell left nav.
 *
 * Role-aware (Phase 1.12):
 *   - Inbox badge shows the count of items awaiting the current user's action.
 *   - The Admin sub-menu is hidden unless the current user has USER.READ or
 *     ROLE.MANAGE permissions (i.e. ROLE_ADMIN / ROLE_SUPER_ADMIN only).
 */
export function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation('nav');
  const currentUser = useAuthStore((s) => s.currentUser);

  // ── Inbox badge count ──────────────────────────────────────────────────────
  const { data: inboxData } = useQuery({
    queryKey: ['inbox'],
    queryFn: fetchInbox,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    // Only fetch when a user is logged in
    enabled: !!currentUser,
  });
  const awaitingCount = inboxData?.awaiting.length ?? 0;

  // ── Role-aware admin visibility ────────────────────────────────────────────
  const isAdmin = useMemo(
    () =>
      currentUser?.permissions.some((p) =>
        ['USER.READ', 'ROLE.MANAGE', 'FORM_DEFINITION.READ'].includes(p),
      ) ?? false,
    [currentUser],
  );

  const selectedKey = location.pathname.split('/')[1] || 'projects';

  // ── Menu items ─────────────────────────────────────────────────────────────
  const items = useMemo(() => {
    const base = [
      { key: 'dashboard', icon: <HomeOutlined />, label: t('sidebar.dashboard') },
      {
        key: 'inbox',
        icon: <InboxOutlined />,
        label: (
          <Badge count={awaitingCount} size="small" offset={[4, -2]}>
            {t('sidebar.inbox')}
          </Badge>
        ),
      },
      { key: 'projects', icon: <AppstoreOutlined />, label: t('sidebar.projects') },
      { key: 'reports', icon: <BarChartOutlined />, label: t('sidebar.reports') },
    ];

    if (isAdmin) {
      base.push(
        { type: 'divider' } as never,
        {
          key: 'admin',
          icon: <SettingOutlined />,
          label: t('sidebar.admin'),
          children: [
            { key: 'admin/users', label: t('sidebar.adminUsers') },
            { key: 'admin/forms', label: t('sidebar.adminForms') },
            { key: 'admin/feature-flags', label: t('sidebar.adminFeatureFlags') },
          ],
        } as never,
      );
    }

    return base;
  }, [awaitingCount, isAdmin, t]);

  return (
    <Menu
      mode="inline"
      theme="dark"
      selectedKeys={[selectedKey]}
      style={{ height: '100%', borderRight: 0 }}
      onClick={({ key }) => navigate(`/${key}`)}
      items={items}
    />
  );
}
