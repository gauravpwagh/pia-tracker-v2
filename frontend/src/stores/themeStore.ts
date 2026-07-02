import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { ThemeMode } from '@theme/tokens';

type StoredMode = ThemeMode | 'system';

interface ThemeStore {
  mode: StoredMode;
  setMode: (mode: StoredMode) => void;
  /** The effective mode, resolving 'system' against the OS preference. */
  effectiveMode: () => ThemeMode;
}

function detectSystemMode(): ThemeMode {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export const useThemeStore = create<ThemeStore>()(
  persist(
    (set, get) => ({
      mode: 'light',
      setMode: (mode) => set({ mode }),
      effectiveMode: () => {
        const m = get().mode;
        return m === 'system' ? detectSystemMode() : m;
      },
    }),
    { name: 'pia.theme' }
  )
);

// Live-update when the system preference changes (relevant for `mode === 'system'`)
if (typeof window !== 'undefined' && window.matchMedia) {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    // Trigger a re-render in subscribers; effectiveMode is computed lazily.
    useThemeStore.setState((s) => ({ ...s }));
  });
}
