import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConfigProvider, theme as antdTheme, App as AntApp } from 'antd';
import { I18nextProvider } from 'react-i18next';

import App from './App';
import { i18n } from './i18n/i18n';
import { tokens } from './theme/tokens';
import { useThemeStore } from './stores/themeStore';

import './theme/global.css';
import './theme/print.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 0,
    },
  },
});

function Root() {
  const mode = useThemeStore((s) => s.effectiveMode());
  const palette = mode === 'dark' ? tokens.dark : tokens.light;

  return (
    <I18nextProvider i18n={i18n}>
      <ConfigProvider
        theme={{
          algorithm: mode === 'dark' ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
          token: { ...tokens.shared, ...palette },
          cssVar: true,
          hashed: false,
          components: {
            Layout: {
              // Sider + collapse trigger use the IRPSM blue chrome.
              siderBg:      '#1047ae',
              triggerBg:    '#0d3a90',
              triggerColor: '#ffffff',
            },
            Menu: {
              // Dark sidebar menu on the #1047ae Sider.
              darkItemBg:            '#1047ae',
              darkSubMenuItemBg:     '#0d3a90',
              darkItemSelectedBg:    '#2a63d6',
              darkItemHoverBg:       '#1a54c4',
              darkItemColor:         'rgba(255,255,255,0.85)',
              darkItemSelectedColor: '#ffffff',
            },
          },
        }}
      >
        <AntApp>
          <QueryClientProvider client={queryClient}>
            <BrowserRouter basename={import.meta.env.BASE_URL}>
              <App />
            </BrowserRouter>
          </QueryClientProvider>
        </AntApp>
      </ConfigProvider>
    </I18nextProvider>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
