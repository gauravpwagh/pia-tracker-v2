import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  AutoComplete,
  Button,
  Input,
  Space,
  Typography,
} from 'antd';
import { LockOutlined, SearchOutlined, UserOutlined } from '@ant-design/icons';
import { useAuthStore } from '@stores/authStore';
import type { UserSummary } from '@api/auth';

import emblem from '../../assets/images/emblem.png';
import irLogo from '../../assets/images/IRLOGO_new.png';
import crisLogo from '../../assets/images/CRISLOGO.png';
import slide1 from '../../assets/images/loginimg1.jpg';
import slide2 from '../../assets/images/loginimg2.jpg';
import slide3 from '../../assets/images/loginimg4.jpg';
import slide4 from '../../assets/images/loginimg5.jpg';
import slide5 from '../../assets/images/loginimg6.jpg';
import slide6 from '../../assets/images/loginimg9.jpg';

const SLIDES = [slide1, slide2, slide3, slide4, slide5, slide6];

// Blue palette for the IRPSM-style chrome (independent of the app's navy theme tokens)
const BLUE_DARK = '#0d3b8c';
const BLUE = '#1565c0';
const BLUE_LIGHT = '#1e88e5';

const { Text } = Typography;

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { users, loadUsers, login, currentUser } = useAuthStore();
  const [usernameInput, setUsernameInput] = useState('');
  const [password, setPassword] = useState('');
  const [selectedUser, setSelectedUser] = useState<UserSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [slide, setSlide] = useState(0);

  useEffect(() => { void loadUsers(); }, [loadUsers]);

  // Auto-rotate the photo panel
  useEffect(() => {
    const id = setInterval(() => setSlide((s) => (s + 1) % SLIDES.length), 5000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (currentUser) navigate('/home', { replace: true });
  }, [currentUser, navigate]);

  // Coming back from /login/search with a picked officer — pre-fill the username field.
  useEffect(() => {
    const state = location.state as { selectedUserId?: string } | null;
    if (state?.selectedUserId && users.length > 0) {
      const u = users.find((x) => x.id === state.selectedUserId);
      if (u) {
        setSelectedUser(u);
        setUsernameInput(u.name);
      }
      // Clear the route state so it doesn't re-apply on a later back-nav.
      navigate(location.pathname, { replace: true, state: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state, users]);

  const options = useMemo(() => {
    const q = usernameInput.trim().toLowerCase();
    const matches = q
      ? users.filter((u) => u.name.toLowerCase().includes(q))
      : users;
    return matches.slice(0, 20).map((u) => ({
      value: u.name,
      key: u.id,
      label: (
        <div>
          <div style={{ fontSize: 13 }}>{u.name}</div>
          <div style={{ fontSize: 11, color: 'var(--ant-color-text-secondary)' }}>
            {u.designationShortLabel} · {u.primaryZoneName ?? 'System'}
          </div>
        </div>
      ),
    }));
  }, [usernameInput, users]);

  const handleUsernameChange = (value: string) => {
    setUsernameInput(value);
    setError(null);
    // If what's typed no longer exactly matches the previously selected user, clear the selection —
    // the username field must resolve to a real officer before Sign in is enabled.
    if (selectedUser && value !== selectedUser.name) setSelectedUser(null);
  };

  const handleUsernameSelect = (_value: string, option: { key: string }) => {
    const u = users.find((x) => x.id === option.key) ?? null;
    setSelectedUser(u);
    if (u) setUsernameInput(u.name);
  };

  // Username sent to the backend: the picked officer's email, or whatever the user
  // typed (their HRMS id or email). The initial password is the HRMS id.
  const username = selectedUser ? selectedUser.email : usernameInput.trim();
  const canSignIn = !!username && !!password;

  const handleSignIn = async () => {
    if (!canSignIn) {
      setError('Enter your username (HRMS ID or email) and password.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await login(username, password);
      // Wipe any cached data from a previous session (e.g. the prior user's project
      // list) so the new user doesn't see stale rows until a manual refresh.
      queryClient.clear();
      navigate('/home', { replace: true });
    } catch {
      setError('Invalid username or password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        height: '100vh',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--ant-color-bg-layout)',
      }}
    >
      {/* Top header bar — emblem + Indian Railways + CRIS, IRPSM style */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          padding: '2px 24px',
          background: `linear-gradient(90deg, ${BLUE_DARK} 0%, ${BLUE} 100%)`,
          color: '#fff',
          boxShadow: '0 2px 8px rgba(13,59,140,0.35)',
          fontFamily: '"Times New Roman", Times, serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <img src={irLogo} alt="Indian Railways" height={70} />
          <div style={{ lineHeight: 1.2 }}>
            <div style={{marginLeft: 20, fontSize: 30, fontWeight: 800, letterSpacing: '0.04em' }}> IRPSM : Indian Railways Projects Sanctions &amp; Management</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <img src={crisLogo} alt="CRIS" height={45} />
          <img src={emblem} alt="Government of India" height={70} style={{ filter: 'brightness(0) invert(1)' }} />
        </div>
      </header>

      {/* Responsive rules — hide the photo panel on narrow viewports */}
      <style>{`
        .irpsm-body { flex: 1; display: flex; }
        .irpsm-photo { flex: 0 0 65%; max-width: 65%; }
        .irpsm-signin { flex: 0 0 35%; max-width: 35%; }
        @media (max-width: 900px) {
          .irpsm-photo { display: none !important; }
          .irpsm-signin { flex: 1 1 100%; max-width: 100%; }
        }
        /* Darker hint text + darker input borders */
        .irpsm-fields input::placeholder { color: #595959 !important; opacity: 1; }
        .irpsm-fields .ant-input-affix-wrapper { border-color: #8c8c8c !important; }
        .irpsm-fields .ant-input-affix-wrapper:hover { border-color: ${BLUE} !important; }
      `}</style>

      {/* Split body: photo panel + sign-in panel */}
      <div className="irpsm-body">

        {/* Left — rotating railway photo panel (60%) */}
        <div
          className="irpsm-photo"
          style={{
            position: 'relative',
            minHeight: 360,
            overflow: 'hidden',
            background: BLUE_DARK,
          }}
        >
          {SLIDES.map((src, i) => (
            <div
              key={src}
              style={{
                position: 'absolute',
                inset: 0,
                backgroundImage: `url(${src})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                opacity: i === slide ? 1 : 0,
                transition: 'opacity 1s ease-in-out',
              }}
            />
          ))}
          {/* Blue gradient overlay + welcome text */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'linear-gradient(to top, rgba(0,0,0,0.25), transparent)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'flex-end',
              padding: '40px 44px',
              color: '#fff',
            }}
          >
            <div style={{ fontSize: 30, fontWeight: 800, lineHeight: 1.15, textShadow: '0 2px 12px rgba(0,0,0,0.4)' }}>
              Pre-Investment Activities
            </div>
            <div style={{ fontSize: 15, fontWeight: 400, marginTop: 12, maxWidth: 460, opacity: 0.95, textShadow: '0 1px 6px rgba(0,0,0,0.4)' }}>
              Track land acquisition, clearances, utility shifting and tender packaging
              across railway construction projects — one structured system.
            </div>
            {/* Slide dots */}
            <div style={{ display: 'flex', gap: 8, marginTop: 28 }}>
              {SLIDES.map((src, i) => (
                <button
                  key={src}
                  onClick={() => setSlide(i)}
                  aria-label={`Slide ${i + 1}`}
                  style={{
                    width: i === slide ? 26 : 10,
                    height: 10,
                    borderRadius: 6,
                    border: 'none',
                    cursor: 'pointer',
                    padding: 0,
                    background: i === slide ? '#fff' : 'rgba(255,255,255,0.5)',
                    transition: 'all 0.3s',
                  }}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Right — sign-in panel (40%) */}
        <div
          className="irpsm-signin"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
            background: 'var(--ant-color-bg-layout)',
          }}
        >
          <div style={{ width: '100%', maxWidth: 420 }}>

        {/* Welcome heading */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 34,  fontFamily: '"Times New Roman", Times, serif', fontWeight: 800, color: BLUE, lineHeight: 1.2 }}>
            Welcome to IRPSM
          </div>
          <div style={{ fontSize: 22,  fontFamily: '"Times New Roman", Times, serif', fontWeight: 500, color: 'var(--ant-color-text-secondary)', marginTop: 4 }}>
            Pre-Investment Activities
          </div>
        </div>

        {/* Card */}
        <div
          style={{
            background: 'var(--ant-color-bg-container)',
            border: '1px solid var(--ant-color-border)',
            borderRadius: 12,
            overflow: 'hidden',
            boxShadow: '0 10px 30px rgba(13,59,140,0.12)',
          }}
        >
          {/* Blue accent strip */}
          <div style={{ height: 4, background: `linear-gradient(90deg, ${BLUE_DARK}, ${BLUE_LIGHT})` }} />
          {/* Sign in form */}
          <div style={{ padding: '24px 24px 20px' }}>
            <Space direction="vertical" size={12} style={{ width: '100%' }} className="irpsm-fields">
              <AutoComplete
                value={usernameInput}
                options={options}
                onChange={handleUsernameChange}
                onSelect={handleUsernameSelect}
                style={{ width: '100%' }}
                filterOption={false}
              >
                <Input
                  prefix={<UserOutlined style={{ color: 'var(--ant-color-text-tertiary)' }} />}
                  placeholder="Username"
                  size="large"
                  style={{ borderColor: '#8c8c8c' }}
                />
              </AutoComplete>
              <Input.Password
                prefix={<LockOutlined style={{ color: 'var(--ant-color-text-tertiary)' }} />}
                placeholder="Password"
                size="large"
                style={{ borderColor: '#8c8c8c' }}
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(null); }}
                onPressEnter={() => void handleSignIn()}
              />
              <Button
                type="primary"
                block
                size="large"
                disabled={!canSignIn}
                loading={loading}
                onClick={() => void handleSignIn()}
                style={{ marginTop: 4 }}
              >
                Sign in
              </Button>
              <Text type="secondary" style={{ fontSize: 11, textAlign: 'center', display: 'block' }}>
                First-time sign-in: your password is your HRMS ID or IRPSM login ID.
              </Text>
            </Space>

            {error && (
              <Text type="danger" style={{ fontSize: 12, display: 'block', textAlign: 'center', marginTop: 10 }}>
                {error}
              </Text>
            )}

            <div style={{ textAlign: 'center', marginTop: 14 }}>
              <Button
                type="link"
                size="small"
                icon={<SearchOutlined />}
                onClick={() => navigate('/login/search')}
                style={{ padding: 0, fontSize: 12 }}
              >
                Search officers
              </Button>
            </div>
          </div>
        </div>

        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <Text type="secondary" style={{ fontSize: 13 }}>
            Indian Railways · PIA Tracker · Production environment
          </Text>
        </div>
          </div>
        </div>
      </div>
    </div>
  );
}
