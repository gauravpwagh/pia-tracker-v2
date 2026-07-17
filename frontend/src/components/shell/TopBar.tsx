import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Avatar, Badge, Button, Dropdown, Space, Tooltip, Typography } from 'antd';
import {
  BellOutlined,
  DownOutlined,
  HomeOutlined,
  LaptopOutlined,
  LogoutOutlined,
  MoonOutlined,
  QuestionCircleOutlined,
  SunOutlined,
  UserOutlined,
} from '@ant-design/icons';
import irLogo from '../../assets/images/IRLOGO_new.png';

// IRPSM chrome palette — matches the login page header (independent of theme tokens)
const BAR_GRADIENT = 'linear-gradient(90deg, #0d3b8c 0%, #1565c0 100%)';
const BAR_TEXT = '#ffffff';
const BAR_TEXT_DIM = 'rgba(255,255,255,0.75)';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useThemeStore } from '@stores/themeStore';
import { useAuthStore } from '@stores/authStore';
import {
  fetchNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  type NotificationDto,
} from '@api/notifications';
import { fetchZones } from '@api/projects';
import { logout as apiLogout } from '@api/auth';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(relativeTime);

const { Text } = Typography;

/**
 * TopBar — shell header.
 *
 * Per docs/ui.md § 1: logo, app title, role switcher (dummy auth), notification
 * bell, user avatar dropdown.
 *
 * The role-picker (Select) is only meaningful in dev/beta where the auth
 * endpoints are available. In prod the /api/v1/auth/* endpoints do not exist,
 * so loadUsers() returns an empty list silently.
 *
 * The notification bell polls every 30 s and shows an unread-count badge.
 * Clicking a notification marks it read and navigates to the link URL.
 */
export function TopBar() {
  const { mode: storedMode, setMode, effectiveMode } = useThemeStore();
  const mode = effectiveMode();

  const themeMenuItems = [
    {
      key: 'light',
      label: (
        <Space><SunOutlined /> Light</Space>
      ),
    },
    {
      key: 'dark',
      label: (
        <Space><MoonOutlined /> Dark</Space>
      ),
    },
    {
      key: 'system',
      label: (
        <Space><LaptopOutlined /> System</Space>
      ),
    },
  ];
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { currentUser, users } = useAuthStore();

  useEffect(() => {
    // users list is needed only to resolve the zone name label
    // loadUsers is called from LoginPage; here we only need it if not yet loaded
  }, []);

  // ── Notifications ─────────────────────────────────────────────────────────

  const { data: notifData } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => fetchNotifications(20),
    enabled: !!currentUser,
    refetchInterval: 30_000,
  });

  const markReadMutation = useMutation({
    mutationFn: (id: string) => markNotificationRead(id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const markAllReadMutation = useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const handleNotificationClick = (notif: NotificationDto) => {
    if (!notif.isRead) markReadMutation.mutate(notif.id);
    if (notif.linkUrl) navigate(notif.linkUrl);
  };

  const unreadCount = notifData?.unreadCount ?? 0;
  const notifications = notifData?.notifications ?? [];

  // ── Zones (cached — shared with ProjectsPage) ─────────────────────────────
  const { data: zonesData } = useQuery({
    queryKey: ['zones'],
    queryFn: fetchZones,
    staleTime: 10 * 60 * 1000,
  });

  // Resolve display strings for the current user
  const matchedUser = users.find((u) => u.id === currentUser?.userId);
  const designationLabel = matchedUser?.designationShortLabel ?? currentUser?.designationCode ?? '';

  const primaryZoneName = zonesData?.find((z) => z.id === currentUser?.primaryZoneId)?.shortName ?? '';
  const initials = currentUser
    ? currentUser.name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()
    : '';

  const notifDropdownItems = [
    {
      key: 'header',
      label: (
        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
          <Text strong>Notifications</Text>
          {unreadCount > 0 && (
            <Button
              type="link"
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                markAllReadMutation.mutate();
              }}
            >
              Mark all read
            </Button>
          )}
        </Space>
      ),
      disabled: true,
      style: { cursor: 'default' },
    },
    ...(notifications.length === 0
      ? [
          {
            key: 'empty',
            label: (
              <Text type="secondary" style={{ fontSize: 13 }}>
                No notifications
              </Text>
            ),
            disabled: true,
          },
        ]
      : notifications.map((n) => ({
          key: n.id,
          label: (
            <div
              style={{
                maxWidth: 320,
                opacity: n.isRead ? 0.6 : 1,
                borderLeft: n.isRead ? 'none' : '3px solid var(--ant-color-primary)',
                paddingLeft: n.isRead ? 0 : 8,
              }}
              onClick={() => handleNotificationClick(n)}
            >
              <div style={{ fontWeight: n.isRead ? 'normal' : 600, fontSize: 13 }}>
                {n.title}
              </div>
              <div style={{ fontSize: 12, color: 'var(--ant-color-text-secondary)' }}>
                {dayjs(n.createdAt).fromNow()}
              </div>
            </div>
          ),
        }))),
  ];

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        height: 56,
        padding: '0 16px',
        width: '100%',
        justifyContent: 'space-between',
        background: BAR_GRADIENT,
        overflow: 'hidden',
      }}
    >
      {/* Brand block — IR logo + stacked wordmark, vertically centred in 56 px bar.
          Not clickable: it must NOT route to the project list (use the Home button for that). */}
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 12, height: 56, minWidth: 0, flex: 1 }}
      >
        <img src={irLogo} alt="Indian Railways" height={42} style={{ display: 'block', flexShrink: 0 }} />
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', lineHeight: 1, minWidth: 0 }}>
          <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: '0.02em', color: BAR_TEXT, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            IRPSM : Indian Railways Projects Sanctions &amp; Management
          </span>
          <span style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.06em', color: BAR_TEXT_DIM, lineHeight: 1.4 }}>
            Pre Investment Activities
          </span>
        </div>
      </div>

      <Space align="center" size={12} style={{ flexShrink: 0 }}>
        {/* Home — back to the project list */}
        <Button
          icon={<HomeOutlined />}
          style={{ height: 40, color: BAR_TEXT, background: 'transparent', border: '1px solid rgba(255,255,255,0.75)' }}
          onClick={() => navigate('/projects')}
        >
          Home
        </Button>

        {/* Theme toggle */}
        <Tooltip title="Switch theme">
          <Dropdown
            menu={{
              items: themeMenuItems,
              selectedKeys: [storedMode],
              onClick: ({ key }) => setMode(key as 'light' | 'dark' | 'system'),
            }}
            trigger={['click']}
          >
            <Button
              icon={mode === 'dark' ? <MoonOutlined /> : <SunOutlined />}
              type="text"
              size="small"
              aria-label="Switch theme"
              style={{ color: BAR_TEXT }}
            />
          </Dropdown>
        </Tooltip>

        {/* Notification bell */}
        {currentUser && (
          <Dropdown
            menu={{ items: notifDropdownItems }}
            trigger={['click']}
            overlayStyle={{ maxHeight: 480, overflow: 'auto', minWidth: 340 }}
          >
            <Badge count={unreadCount} size="small" offset={[-2, 2]} color="blue">
              <Button
                icon={<BellOutlined />}
                type="text"
                size="small"
                aria-label="Notifications"
                style={{ color: BAR_TEXT }}
              />
            </Badge>
          </Dropdown>
        )}

        {/* Current user display */}
        {currentUser ? (
          <Dropdown
            trigger={['click']}
            menu={{
              items: [
                {
                  key: 'profile',
                  icon: <UserOutlined />,
                  label: 'My Profile',
                  onClick: () => navigate('/profile'),
                },
                {
                  key: 'help',
                  icon: <QuestionCircleOutlined />,
                  label: 'Help',
                  onClick: () => navigate('/help'),
                },
                { type: 'divider' },
                {
                  key: 'logout',
                  icon: <LogoutOutlined />,
                  label: 'Logout',
                  danger: true,
                  // End the PIA session server-side, then land on PIA's own login page. Uses the
                  // raw API logout (not the store's) so currentUser isn't nulled before the
                  // full-page redirect commits.
                  onClick: () => void apiLogout().finally(() => { window.location.href = '/login'; }),
                },
              ],
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                cursor: 'pointer',
                padding: '4px 8px',
                borderRadius: 8,
                transition: 'background 0.15s',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.12)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
            >
              <Avatar
                size={34}
                style={{
                  background: 'rgba(255,255,255,0.18)',
                  color: '#fff',
                  fontWeight: 700,
                  fontSize: 13,
                  flexShrink: 0,
                }}
              >
                {initials}
              </Avatar>
              <div style={{ lineHeight: 1.3, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: BAR_TEXT, whiteSpace: 'nowrap' }}>
                  {currentUser.name}
                </div>
                <div style={{ fontSize: 11, color: BAR_TEXT_DIM, whiteSpace: 'nowrap' }}>
                  {designationLabel}{primaryZoneName ? ` · ${primaryZoneName}` : ''}
                </div>
              </div>
              <DownOutlined style={{ fontSize: 10, color: BAR_TEXT_DIM, flexShrink: 0 }} />
            </div>
          </Dropdown>
        ) : (
          <Text style={{ fontSize: 13, color: BAR_TEXT_DIM }}>
            Not logged in
          </Text>
        )}
      </Space>
    </div>
  );
}
