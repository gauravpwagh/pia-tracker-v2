import { useMemo } from 'react';
import { Badge, Menu } from 'antd';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import {
  IconBuildingBridge2,
  IconInbox,
  IconLayoutDashboard,
  IconReportAnalytics,
  IconShieldCog,
} from '@tabler/icons-react';
// Opened in a new tab (Grafana is a separate app with its own login) rather
// than through client-side routing — see the onClick special-case below.
const GRAFANA_URL = '/grafana/';
import { useAuthStore } from '@stores/authStore';
import { fetchInbox } from '@api/inbox';

const NAV_ICON_SIZE = 16;

/** Wraps a Tabler icon so Ant Design Menu treats it like an anticon element. */
function navIcon(icon: React.ReactNode) {
  return <span className="anticon">{icon}</span>;
}

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
  const canViewLogs = useMemo(
    () => currentUser?.permissions.includes('SYSTEM_LOG.READ') ?? false,
    [currentUser],
  );

  const selectedKey = location.pathname.split('/')[1] || 'projects';

  // ── Menu items ─────────────────────────────────────────────────────────────
  const items = useMemo(() => {
    const base = [
      { key: 'dashboard', icon: navIcon(<IconLayoutDashboard size={NAV_ICON_SIZE} />), label: t('sidebar.dashboard') },
      {
        key: 'inbox',
        icon: navIcon(<IconInbox size={NAV_ICON_SIZE} />),
        label: (
          <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            {t('sidebar.inbox')}
            {awaitingCount > 0 && (
              <Badge
                count={awaitingCount}
                size="small"
                style={{ backgroundColor: '#fff', color: '#000', boxShadow: '0 0 0 1px var(--ant-color-border) inset' }}
              />
            )}
          </span>
        ),
      },
      { key: 'projects', icon: navIcon(<IconBuildingBridge2 size={NAV_ICON_SIZE} />), label: t('sidebar.projects') },
      { key: 'reports', icon: navIcon(<IconReportAnalytics size={NAV_ICON_SIZE} />), label: t('sidebar.reports') },
    ];

    if (isAdmin) {
      base.push(
        { type: 'divider' } as never,
        {
          key: 'admin',
          icon: navIcon(<IconShieldCog size={NAV_ICON_SIZE} />),
          label: t('sidebar.admin'),
          children: [
            { key: 'admin/users', label: t('sidebar.adminUsers') },
            { key: 'admin/forms', label: t('sidebar.adminForms') },
            { key: 'admin/feature-flags', label: t('sidebar.adminFeatureFlags') },
            ...(canViewLogs ? [{ key: 'admin/logs', label: t('sidebar.adminLogs') }] : []),
          ],
        } as never,
      );
    }

    return base;
  }, [awaitingCount, isAdmin, canViewLogs, t]);

  return (
    <Menu
      mode="inline"
      theme="dark"
      selectedKeys={[selectedKey]}
      style={{ height: '100%', borderRight: 0, background: '#1047ae' }}
      onClick={({ key }) => {
        if (key === 'admin/logs') {
          window.open(GRAFANA_URL, '_blank', 'noopener,noreferrer');
          return;
        }
        navigate(`/${key}`);
      }}
      items={items}
    />
  );
}
