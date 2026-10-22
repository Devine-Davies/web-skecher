import React from 'react';
import type { ThemeMode } from '@/shared/types';

export interface HeaderProps {
  connectionOk: boolean;
  connectionLabel: string;
  providerName: string;
  activeView: 'main' | 'settings' | 'onboarding';
  theme: ThemeMode;
  onSelectView: (view: 'main' | 'settings' | 'onboarding') => void;
  onToggleTheme: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  connectionOk,
  connectionLabel,
  providerName,
  activeView,
  theme,
  onSelectView,
  onToggleTheme,
}) => {
  return (
    <header className="sidepanel-header sticky top-0 z-10 px-4 py-4 backdrop-blur">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => onSelectView('main')}
          className="flex min-w-0 items-center gap-2.5 text-left rounded-md"
          aria-label="Visualise Page home"
        >
          <div className="app-mark flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white shadow-sm">
            <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><rect x="8" y="3" width="8" height="6" rx="1.5"/><path d="M12 9v4M5 13h14M5 13v3m14-3v3"/><rect x="2" y="16" width="6" height="5" rx="1.5"/><rect x="16" y="16" width="6" height="5" rx="1.5"/></svg>
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold leading-tight">
              Visualise Page
            </div>
            <div className="mt-1 flex items-center gap-1.5 text-[10px] text-slate-500 dark:text-slate-400" role="status">
              <span
                className={`inline-block h-2 w-2 rounded-full ${
                  connectionOk ? 'bg-emerald-500' : 'bg-amber-500'
                }`}
                aria-hidden="true"
              />
              <span>
                {providerName} · {connectionLabel}
              </span>
            </div>
          </div>
        </button>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onToggleTheme}
            className="icon-button"
            aria-label="Toggle colour theme"
            title={`Theme: ${theme}`}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
              {theme === 'dark' ? <><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2"/></> : <path d="M20 15A8 8 0 0 1 9 4a8 8 0 1 0 11 11Z"/>}
            </svg>
          </button>

          <button
            type="button"
            onClick={() =>
              onSelectView(activeView === 'settings' ? 'main' : 'settings')
            }
            className="icon-button"
            aria-pressed={activeView === 'settings'}
            aria-label="Open settings"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="m9 3-.5 3-2 1-3-.5-2 4 2.5 2v2L1.5 17l2 4 3-.5 2 1L9 24h5l.5-2.5 2-1 3 .5 2-4-2.5-2v-2l2.5-2-2-4-3 .5-2-1L14 3Z" transform="translate(1 -1) scale(.9)"/><circle cx="12" cy="12" r="3"/></svg>
          </button>
        </div>
      </div>
    </header>
  );
};
