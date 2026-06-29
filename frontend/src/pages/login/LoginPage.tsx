import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Avatar,
  Button,
  Divider,
  Input,
  List,
  Space,
  Tag,
  Typography,
} from 'antd';
import { LockOutlined, SearchOutlined, UserOutlined } from '@ant-design/icons';
import { useAuthStore } from '@stores/authStore';
import { useThemeStore } from '@stores/themeStore';
import type { UserSummary } from '@api/auth';

const { Text, Title } = Typography;

const DESIGNATION_ORDER = [
  'SUPER_ADMIN', 'ADMIN', 'EDGS_CI', 'CAO_C', 'CE_C', 'DY_CE_C',
  'CE_PLANNING', 'DY_CE_PLANNING', 'DY_CE_DESIGN', 'DY_CE', 'SR_DEN',
  'SR_DEN_CO', 'CBE', 'DY_CE_BRIDGE', 'CTE', 'DY_CE_TRACK', 'CPDE', 'PCE',
  'DY_CSTE', 'SR_DSTE', 'CSTE_CON', 'CSTE_OL', 'PSCTE', 'DY_CEE',
  'SR_DEE_TRD', 'CEE_CON', 'PCEE', 'SR_DOM', 'PCOM', 'SR_DCM', 'ADRM',
  'DRM', 'CTPM', 'PCSO', 'CRS', 'GM',
];

function getInitials(name: string) {
  return name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
}

export default function LoginPage() {
  const navigate = useNavigate();
  const { effectiveMode } = useThemeStore();
  const mode = effectiveMode();
  const logoSrc = mode === 'dark' ? '/logo-icon-dark.svg' : '/logo-icon.svg';

  const { users, loadUsers, selectUser, currentUser } = useAuthStore();
  const [search, setSearch] = useState('');
  const [selectedUser, setSelectedUser] = useState<UserSummary | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => { void loadUsers(); }, [loadUsers]);

  useEffect(() => {
    if (currentUser) navigate('/', { replace: true });
  }, [currentUser, navigate]);

  // When a user is selected, fill the username field
  const usernameValue = selectedUser ? selectedUser.name : '';

  const filtered = users.filter((u) => {
    const q = search.toLowerCase();
    return (
      u.name.toLowerCase().includes(q) ||
      (u.primaryZoneName ?? '').toLowerCase().includes(q) ||
      u.designationShortLabel.toLowerCase().includes(q) ||
      u.designationCode.toLowerCase().includes(q)
    );
  });

  function buildGroups(list: UserSummary[]) {
    const map = new Map<string, UserSummary[]>();
    for (const u of list) {
      const existing = map.get(u.designationCode) ?? [];
      existing.push(u);
      map.set(u.designationCode, existing);
    }
    const groups: Array<{ designation: string; label: string; users: UserSummary[] }> = [];
    for (const code of DESIGNATION_ORDER) {
      const g = map.get(code);
      if (g) groups.push({ designation: code, label: g[0].designationShortLabel, users: g });
    }
    for (const [code, g] of map) {
      if (!DESIGNATION_ORDER.includes(code))
        groups.push({ designation: code, label: g[0].designationShortLabel, users: g });
    }
    return groups;
  }

  const actualGroups = buildGroups(filtered.filter((u) => !u.isDemo));
  const demoGroups   = buildGroups(filtered.filter((u) =>  u.isDemo));

  function renderGroups(groups: Array<{ designation: string; label: string; users: UserSummary[] }>, isDemo: boolean) {
    return groups.map(({ designation, label, users: groupUsers }) => (
      <div key={(isDemo ? 'demo-' : '') + designation}>
        <div style={{
          padding: '5px 16px',
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--ant-color-text-quaternary)',
          background: 'var(--ant-color-bg-layout)',
          borderBottom: '1px solid var(--ant-color-border-secondary)',
        }}>
          {label}
        </div>
        <List
          dataSource={groupUsers}
          renderItem={(u) => {
            const isSelected = u.id === selectedUser?.id;
            return (
              <List.Item
                onClick={() => setSelectedUser(isSelected ? null : u)}
                onDoubleClick={() => { setSelectedUser(u); void handleSignIn(); }}
                style={{
                  padding: '8px 16px',
                  cursor: 'pointer',
                  background: isSelected ? 'var(--ant-color-primary-bg)' : 'transparent',
                  borderLeft: isSelected ? '3px solid var(--ant-color-primary)' : '3px solid transparent',
                  transition: 'background 0.12s',
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'var(--ant-color-bg-text-hover)';
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'transparent';
                }}
              >
                <Space size={10} style={{ width: '100%' }}>
                  <Avatar size={32} style={{
                    background: isSelected ? 'var(--ant-color-primary)' : 'var(--ant-color-bg-text-hover)',
                    color: isSelected ? '#fff' : 'var(--ant-color-text-secondary)',
                    fontWeight: 700, fontSize: 12, flexShrink: 0,
                  }}>
                    {getInitials(u.name)}
                  </Avatar>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{
                        fontSize: 13,
                        fontWeight: isSelected ? 600 : 400,
                        color: isSelected ? 'var(--ant-color-primary)' : 'var(--ant-color-text)',
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>
                        {u.name}
                      </span>
                      {isDemo && (
                        <Tag color="warning" style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px', margin: 0, flexShrink: 0 }}>
                          Demo
                        </Tag>
                      )}
                    </div>
                    <div style={{
                      fontSize: 11, color: 'var(--ant-color-text-secondary)',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>
                      {u.primaryZoneName ?? 'System'}
                    </div>
                  </div>
                </Space>
              </List.Item>
            );
          }}
        />
      </div>
    ));
  }

  const handleSignIn = async () => {
    if (!selectedUser) return;
    setLoading(true);
    try {
      await selectUser(selectedUser.id);
      navigate('/', { replace: true });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--ant-color-bg-layout)',
        padding: 24,
      }}
    >
      <div style={{ width: '100%', maxWidth: 420 }}>

        {/* Logo + App name */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
            <img src={logoSrc} alt="PIA Tracker" height={40} />
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '0.04em', color: 'var(--ant-color-text)', lineHeight: 1.1 }}>PIA</div>
              <div style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.12em', color: 'var(--ant-color-text-secondary)', lineHeight: 1.2 }}>TRACKER</div>
            </div>
          </div>
        </div>

        {/* Card */}
        <div
          style={{
            background: 'var(--ant-color-bg-container)',
            border: '1px solid var(--ant-color-border)',
            borderRadius: 12,
            overflow: 'hidden',
          }}
        >
          {/* Sign in form */}
          <div style={{ padding: '24px 24px 20px' }}>
            <Title level={5} style={{ margin: '0 0 20px 0', fontWeight: 600 }}>Sign in</Title>

            <Space direction="vertical" size={12} style={{ width: '100%' }}>
              <Input
                prefix={<UserOutlined style={{ color: 'var(--ant-color-text-quaternary)' }} />}
                placeholder="Username"
                size="large"
                value={usernameValue}
                readOnly
                style={{ cursor: 'default' }}
              />
              <Input.Password
                prefix={<LockOutlined style={{ color: 'var(--ant-color-text-quaternary)' }} />}
                placeholder="Password"
                size="large"
              />
              <Button
                type="primary"
                block
                size="large"
                disabled={!selectedUser}
                loading={loading}
                onClick={() => void handleSignIn()}
                style={{ marginTop: 4 }}
              >
                Sign in
              </Button>
            </Space>

            {!selectedUser && (
              <Text type="secondary" style={{ fontSize: 12, display: 'block', textAlign: 'center', marginTop: 10 }}>
                Select a user below to continue
              </Text>
            )}
          </div>

          <Divider style={{ margin: 0 }} />

          {/* User search */}
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--ant-color-border-secondary)' }}>
            <Input
              prefix={<SearchOutlined style={{ color: 'var(--ant-color-text-quaternary)' }} />}
              placeholder="Search by name, designation or zone…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              allowClear
              size="small"
            />
          </div>

          {/* User list */}
          <div style={{ maxHeight: 320, overflowY: 'auto' }}>
            {actualGroups.length === 0 && demoGroups.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center' }}>
                <Text type="secondary">No users found</Text>
              </div>
            ) : (
              <>
                {renderGroups(actualGroups, false)}
                {demoGroups.length > 0 && (
                  <>
                    <div style={{
                      padding: '5px 16px',
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      color: 'var(--ant-color-warning)',
                      background: 'var(--ant-color-warning-bg)',
                      borderTop: actualGroups.length > 0 ? '1px solid var(--ant-color-border)' : undefined,
                      borderBottom: '1px solid var(--ant-color-border-secondary)',
                    }}>
                      Demo Users
                    </div>
                    {renderGroups(demoGroups, true)}
                  </>
                )}
              </>
            )}
          </div>
        </div>

        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <Text type="secondary" style={{ fontSize: 11 }}>
            Indian Railways · PIA Tracker · Development environment
          </Text>
        </div>
      </div>
    </div>
  );
}
