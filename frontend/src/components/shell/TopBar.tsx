import { useEffect } from 'react';
import { Button, Select, Space, Typography } from 'antd';
import { useThemeStore } from '@stores/themeStore';
import { useAuthStore } from '@stores/authStore';

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
 */
export function TopBar() {
  const mode = useThemeStore((s) => s.effectiveMode());
  const logoSrc = mode === 'dark' ? '/logo-dark.svg' : '/logo.svg';

  const { currentUser, users, loadUsers, selectUser, logout, checkSession } = useAuthStore();

  useEffect(() => {
    void checkSession();
    void loadUsers();
  }, [checkSession, loadUsers]);

  const userOptions = users.map((u) => ({
    value: u.id,
    label: `${u.name} (${u.designationCode})`,
  }));

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
