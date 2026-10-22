import React from 'react';
import type { ThemeMode } from '@/shared/types';

export interface HeaderProps {
  connectionOk: boolean;
  providerName: string;
  activeView: 'main' | 'settings' | 'onboarding';
  theme: ThemeMode;
  onSelectView: (view: 'main' | 'settings' | 'onboarding') => void;
  onToggleTheme: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  connectionOk,
  providerName,
  activeView,
  theme,
  onSelectView,
  onToggleTheme,
}) => {
  return (
    <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-3.5 py-2.5 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => onSelectView('main')}
          className="flex items-center gap-2 text-left rounded-md focus:outline-none"
          aria-label="Visualise Page home"
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-white font-bold shadow-sm">
            VP
          </div>
          <div>
            <div className="text-sm font-semibold leading-tight text-slate-900 dark:text-slate-100">
              Visualise Page
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
              <span
                className={`inline-block h-2 w-2 rounded-full ${
                  connectionOk ? 'bg-emerald-500' : 'bg-amber-500'
                }`}
                aria-hidden="true"
              />
              <span>
                {providerName}: {connectionOk ? 'Connected' : 'Local Preview / Key Optional'}
              </span>
            </div>
          </div>
        </button>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onToggleTheme}
            className="rounded-md px-2 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            aria-label="Toggle colour theme"
            title={`Theme: ${theme}`}
          >
            {theme === 'dark' ? 'Dark' : 'Light'}
          </button>

          <button
            type="button"
            onClick={() =>
              onSelectView(activeView === 'settings' ? 'main' : 'settings')
            }
            className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition ${
              activeView === 'settings'
                ? 'bg-brand-600 text-white'
                : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800'
            }`}
            aria-label="Open settings"
          >
            Settings
          </button>
        </div>
      </div>
    </header>
  );
};
