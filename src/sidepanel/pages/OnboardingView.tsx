import React, { useState } from 'react';
import {
  AI_PROVIDER_CATALOG,
  COMPLEXITY_PRESETS,
  DIAGRAM_STYLE_OPTIONS,
} from '@/shared/constants';
import type {
  AIProviderId,
  ComplexityLevel,
  DiagramType,
  UserSettings,
} from '@/shared/types';
import { createAIProvider } from '@/core/ai/providers';

export interface OnboardingViewProps {
  settings: UserSettings;
  onComplete: (updated: UserSettings) => void;
}

export const OnboardingView: React.FC<OnboardingViewProps> = ({
  settings,
  onComplete,
}) => {
  const [providerId, setProviderId] = useState<AIProviderId>(
    settings.activeProviderId
  );
  const [apiKey, setApiKey] = useState<string>(
    settings.profiles[0]?.apiKey ?? ''
  );
  const [defaultDiagramType, setDefaultDiagramType] = useState<DiagramType>(
    settings.defaultDiagramType
  );
  const [defaultComplexity, setDefaultComplexity] = useState<ComplexityLevel>(
    settings.defaultComplexity
  );
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testSuccess, setTestSuccess] = useState<boolean | null>(null);

  const selectedProvider =
    AI_PROVIDER_CATALOG.find((p) => p.id === providerId) ??
    AI_PROVIDER_CATALOG[0];

  const handleTestConnection = async () => {
    setTestResult('Testing connection…');
    const provider = createAIProvider(providerId, {
      apiKey,
      modelId: selectedProvider.defaultModel,
    });
    const res = await provider.validateConfig();
    setTestSuccess(res.ok);
    setTestResult(res.message);
  };

  const handleFinish = (e: React.FormEvent) => {
    e.preventDefault();
    const updatedProfiles = settings.profiles.map((p, idx) =>
      idx === 0
        ? {
            ...p,
            providerId,
            modelId: selectedProvider.defaultModel,
            apiKey: apiKey.trim(),
          }
        : p
    );

    onComplete({
      ...settings,
      onboardingCompleted: true,
      activeProviderId: providerId,
      activeModelId: selectedProvider.defaultModel,
      defaultDiagramType,
      defaultComplexity,
      profiles: updatedProfiles,
    });
  };

  return (
    <form onSubmit={handleFinish} className="space-y-4 p-3.5">
      <div className="rounded-xl border border-brand-100 bg-brand-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-900">
        <span className="inline-block rounded-full bg-brand-600 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
          Welcome
        </span>
        <h1 className="mt-1.5 text-base font-bold text-slate-900 dark:text-slate-100">
          Turn webpages into editable Excalidraw diagrams
        </h1>
        <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
          Visualise Page extracts readable article content, identifies key concepts
          using your chosen AI provider, and renders an editable Excalidraw canvas.
        </p>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm dark:border-slate-800 dark:bg-slate-900 space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
          1. Select AI Provider & Credentials
        </h2>

        <div>
          <label
            htmlFor="onboarding-provider"
            className="block text-xs font-medium text-slate-700 dark:text-slate-200"
          >
            AI Provider
          </label>
          <select
            id="onboarding-provider"
            value={providerId}
            onChange={(e) => setProviderId(e.target.value as AIProviderId)}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-800"
          >
            {AI_PROVIDER_CATALOG.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.tier})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="onboarding-api-key"
            className="block text-xs font-medium text-slate-700 dark:text-slate-200"
          >
            API Key (Bring your own key — stored locally)
          </label>
          <input
            id="onboarding-api-key"
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-..."
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-800"
          />
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            Credentials are never synced across browsers or embedded in diagrams.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleTestConnection}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Test Provider Configuration
          </button>
        </div>

        {testResult && (
          <div
            role="status"
            className={`rounded-lg p-2 text-xs ${
              testSuccess
                ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                : 'bg-amber-50 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
            }`}
          >
            {testResult}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm dark:border-slate-800 dark:bg-slate-900 space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
          2. Default Diagram Preferences
        </h2>

        <div className="grid grid-cols-2 gap-2.5">
          <div>
            <label
              htmlFor="onboarding-diagram-type"
              className="block text-xs font-medium text-slate-700 dark:text-slate-200"
            >
              Default Diagram Type
            </label>
            <select
              id="onboarding-diagram-type"
              value={defaultDiagramType}
              onChange={(e) =>
                setDefaultDiagramType(e.target.value as DiagramType)
              }
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-800"
            >
              {DIAGRAM_STYLE_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="onboarding-complexity"
              className="block text-xs font-medium text-slate-700 dark:text-slate-200"
            >
              Default Complexity
            </label>
            <select
              id="onboarding-complexity"
              value={defaultComplexity}
              onChange={(e) =>
                setDefaultComplexity(e.target.value as ComplexityLevel)
              }
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-800"
            >
              {COMPLEXITY_PRESETS.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.label} ({preset.targetNodes} nodes)
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
          3. Privacy & Data-Sharing Behaviour
        </h2>
        <ul className="mt-1.5 list-disc space-y-1 pl-4 text-xs text-slate-600 dark:text-slate-300">
          <li>Local-first: diagrams and settings stay in your browser by default.</li>
          <li>You can preview extracted article text before sending it to an AI provider.</li>
          <li>Form inputs, passwords, and unrelated tabs are never accessed or transmitted.</li>
        </ul>
      </section>

      <button
        type="submit"
        className="w-full rounded-xl bg-brand-600 py-2.5 text-xs font-semibold text-white shadow hover:bg-brand-700"
      >
        Finish Onboarding
      </button>
    </form>
  );
};
