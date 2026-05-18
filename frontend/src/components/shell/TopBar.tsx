import { Space, Typography } from 'antd';
import { useThemeStore } from '@stores/themeStore';

const { Text } = Typography;

/**
 * TopBar — shell header. v1 stub.
 *
 * Per docs/ui.md § 1: logo, app title, role switcher (dummy auth), notification
 * bell, user avatar dropdown. Implemented as part of sub-phase 1.3 (dummy auth
 * landing). For now, a minimal placeholder so the shell renders.
 */
export function TopBar() {
  const mode = useThemeStore((s) => s.effectiveMode());
  const logoSrc = mode === 'dark' ? '/logo-dark.svg' : '/logo.svg';

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
      <Text type="secondary" style={{ fontSize: 13 }}>
        v0.1.0 — skeleton
      </Text>
    </Space>
  );
}
