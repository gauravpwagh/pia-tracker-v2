/**
 * PIA Tracker — design tokens.
 *
 * Source of truth for colors, typography, spacing. Wired into Ant Design's
 * theme.token via ConfigProvider in main.tsx. CSS overrides are not allowed —
 * if you need a new value, add a token here.
 *
 * See docs/ui.md § 2 for the rationale.
 */

export const tokens = {
  light: {
    colorPrimary: '#1e3a5f',
    colorPrimaryHover: '#284a73',
    colorPrimaryActive: '#152c4a',
    colorBgBase: '#ffffff',
    colorBgLayout: '#f5f7fa',
    colorBgContainer: '#ffffff',
    colorBgElevated: '#ffffff',
    colorBgSpotlight: '#eaeff5',
    colorBorder: '#e1e8f0',
    colorBorderSecondary: '#eef2f7',
    colorText: '#1a2733',
    colorTextSecondary: '#5a6b7d',
    colorTextTertiary: '#8b9aab',
    colorTextQuaternary: '#b3bfca',
    colorSuccess: '#16a34a',
    colorSuccessBg: '#e8f5ee',
    colorSuccessBorder: '#a3d9bb',
    colorWarning: '#d97706',
    colorWarningBg: '#fbf0d9',
    colorWarningBorder: '#f1c98a',
    colorError: '#dc2626',
    colorErrorBg: '#fbe7e7',
    colorErrorBorder: '#f0a5a5',
    colorInfo: '#2563eb',
    colorInfoBg: '#e5edfa',
    colorInfoBorder: '#a4bef0',
  },

  dark: {
    colorPrimary: '#5b8dc7',
    colorPrimaryHover: '#7aa3d4',
    colorPrimaryActive: '#456f9d',
    colorBgBase: '#0f1419',
    colorBgLayout: '#1a2028',
    colorBgContainer: '#1f2731',
    colorBgElevated: '#26303c',
    colorBgSpotlight: '#2d3a4a',
    colorBorder: '#2d3a4a',
    colorBorderSecondary: '#222d3a',
    colorText: '#e8eef5',
    colorTextSecondary: '#a5b4c6',
    colorTextTertiary: '#6b7c91',
    colorTextQuaternary: '#4d5b6e',
    colorSuccess: '#22c55e',
    colorSuccessBg: '#1b3329',
    colorSuccessBorder: '#1f5234',
    colorWarning: '#f59e0b',
    colorWarningBg: '#33291a',
    colorWarningBorder: '#5c421e',
    colorError: '#ef4444',
    colorErrorBg: '#33201f',
    colorErrorBorder: '#5c2a2a',
    colorInfo: '#3b82f6',
    colorInfoBg: '#1b2740',
    colorInfoBorder: '#1f3962',
  },

  shared: {
    borderRadius: 6,
    borderRadiusLG: 8,
    borderRadiusSM: 4,
    fontFamily: `'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`,
    fontFamilyCode: `'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, Consolas, monospace`,
    fontSize: 14,
    fontSizeLG: 16,
    fontSizeSM: 13,
    fontSizeXL: 18,
    fontSizeHeading1: 30,
    fontSizeHeading2: 24,
    fontSizeHeading3: 20,
    fontSizeHeading4: 16,
    fontSizeHeading5: 14,
    lineHeight: 1.5,
    motionDurationFast: '0.1s',
    motionDurationMid: '0.2s',
    motionDurationSlow: '0.3s',
    sizeUnit: 4,
    sizeStep: 4,
    wireframe: false,
  },
};

export type ThemeMode = 'light' | 'dark';

export type ColorPalette = typeof tokens.light;
