import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge, Button, Dropdown, Select, Space, Typography } from 'antd';
import { BellOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useThemeStore } from '@stores/themeStore';
import { useAuthStore } from '@stores/authStore';
import {
  fetchNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  type NotificationDto,
} from '@api/notifications';
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
  const mode = useThemeStore((s) => s.effectiveMode());
  const logoSrc = mode === 'dark' ? '/logo-dark.svg' : '/logo.svg';
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { currentUser, users, loadUsers, selectUser, logout, checkSession } = useAuthStore();

  useEffect(() => {
    void checkSession();
    void loadUsers();
  }, [checkSession, loadUsers]);

  const userOptions = users.map((u) => ({
    value: u.id,
    label: `${u.name} (${u.designationCode})`,
  }));

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
    <Space
      align="center"
      style={{
        height: 56,
        padding: '0 16px',
        width: '100%',
        justifyContent: 'space-between',
        borderBottom: '1px solid var(--ant-color-border)',
        background: 'var(--ant-color-bg-container)',
      }}
    >
      <img src={logoSrc} alt="PIA Tracker" height={32} />

      <Space align="center" size={12}>
        {/* Role picker — dev/beta dummy auth */}
        {users.length > 0 && (
          <Select
            placeholder="Select user…"
            style={{ minWidth: 200, maxWidth: 280 }}
            value={currentUser?.userId ?? undefined}
            options={userOptions}
            onChange={(value: string) => void selectUser(value)}
            size="small"
          />
        )}

        {/* Notification bell */}
        {currentUser && (
          <Dropdown
            menu={{ items: notifDropdownItems }}
            trigger={['click']}
            overlayStyle={{ maxHeight: 480, overflow: 'auto', minWidth: 340 }}
          >
            <Badge count={unreadCount} size="small" offset={[-2, 2]}>
              <Button
                icon={<BellOutlined />}
                type="text"
                size="small"
                aria-label="Notifications"
              />
            </Badge>
          </Dropdown>
        )}

        {/* Current user display */}
        {currentUser ? (
          <Space align="center" size={8}>
            <Text style={{ fontSize: 13 }}>
              {currentUser.name}
              <Text type="secondary" style={{ fontSize: 12, marginLeft: 6 }}>
                ({currentUser.designationCode})
              </Text>
            </Text>
            <Button size="small" onClick={() => void logout()}>
              Logout
            </Button>
          </Space>
        ) : (
          <Text type="secondary" style={{ fontSize: 13 }}>
            Not logged in
          </Text>
        )}
      </Space>
    </Space>
  );
}
