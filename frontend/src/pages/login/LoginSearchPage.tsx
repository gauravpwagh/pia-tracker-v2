/**
 * LoginSearchPage — browse/search the full officer list.
 *
 * Split out of LoginPage so the main sign-in screen stays a plain
 * username/password form. Picking (or double-clicking) an officer here sends
 * their id back to /login via route state, where it pre-fills the username
 * field — the actual selectUser() call still happens on /login's Sign in.
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Avatar, Input, List, Space, Tag, Typography } from 'antd';
import { ArrowLeftOutlined, SearchOutlined } from '@ant-design/icons';
import { useAuthStore } from '@stores/authStore';
import type { UserSummary } from '@api/auth';

import irLogo from '../../assets/images/IRLOGO_new.png';

const BLUE_DARK = '#0d3b8c';
const BLUE = '#1565c0';

const { Text } = Typography;

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

export default function LoginSearchPage() {
  const navigate = useNavigate();
  const { users, loadUsers } = useAuthStore();
  const [search, setSearch] = useState('');

  useEffect(() => { void loadUsers(); }, [loadUsers]);

  const filtered = users.filter((u) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    const zoneName = (u.primaryZoneName ?? '').toLowerCase();
    const zoneMatch = zoneName === q;
    return (
      u.name.toLowerCase().includes(q) ||
      zoneMatch ||
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

  const pickUser = (u: UserSummary) => {
    navigate('/login', { state: { selectedUserId: u.id } });
  };

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
          renderItem={(u) => (
            <List.Item
              onClick={() => pickUser(u)}
              style={{ padding: '8px 16px', cursor: 'pointer', transition: 'background 0.12s' }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--ant-color-bg-text-hover)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
            >
              <Space size={10} style={{ width: '100%' }}>
                <Avatar size={32} style={{
                  background: 'var(--ant-color-bg-text-hover)',
                  color: 'var(--ant-color-text-secondary)',
                  fontWeight: 700, fontSize: 12, flexShrink: 0,
                }}>
                  {getInitials(u.name)}
                </Avatar>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{
                      fontSize: 13, color: 'var(--ant-color-text)',
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
          )}
        />
      </div>
    ));
  }

  return (
    <div style={{ height: '100vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', background: 'var(--ant-color-bg-layout)' }}>
      <header
        style={{
          display: 'flex', alignItems: 'center', gap: 16, padding: '10px 24px',
          background: `linear-gradient(90deg, ${BLUE_DARK} 0%, ${BLUE} 100%)`, color: '#fff',
        }}
      >
        <img src={irLogo} alt="Indian Railways" height={40} />
        <div style={{ fontSize: 18, fontWeight: 700 }}>Search officers</div>
      </header>

      <div style={{ flex: 1, minHeight: 0, display: 'flex', justifyContent: 'center', padding: 24 }}>
        <div style={{ width: '100%', maxWidth: 520, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <button
              type="button"
              onClick={() => navigate('/login')}
              style={{ display: 'flex', alignItems: 'center', gap: 6, border: 'none', background: 'none', cursor: 'pointer', color: BLUE, fontSize: 13, fontWeight: 600, padding: 0 }}
            >
              <ArrowLeftOutlined /> Back to sign in
            </button>
          </div>

          <div style={{ background: 'var(--ant-color-bg-container)', border: '1px solid var(--ant-color-border)', borderRadius: 12, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--ant-color-border-secondary)', flexShrink: 0 }}>
              <Input
                prefix={<SearchOutlined style={{ color: 'var(--ant-color-text-quaternary)' }} />}
                placeholder="Search by name, designation or zone…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                allowClear
                autoFocus
              />
            </div>

            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
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
                        padding: '5px 16px', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
                        textTransform: 'uppercase', color: 'var(--ant-color-warning)',
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
        </div>
      </div>
    </div>
  );
}
