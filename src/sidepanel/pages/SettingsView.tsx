import React, { useEffect, useState } from 'react';
import {
  AI_PROVIDER_CATALOG,
  COMPLEXITY_PRESETS,
  DIAGRAM_STYLE_OPTIONS,
} from '@/shared/constants';
import type {
  AIProviderId,
  ComplexityLevel,
  DiagramType,
  StorageUsageStats,
  ThemeMode,
  UserSettings,
} from '@/shared/types';
import { createAIProvider } from '@/core/ai/providers';
import { testMCPConnection } from '@/core/mcp/client';
import { clearAllStoredData, getStorageUsageStats } from '@/core/storage';

export interface SettingsViewProps {
  settings: UserSettings;
  onSave: (updated: UserSettings) => void;
  onReopenOnboarding: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  settings,
  onSave,
  onReopenOnboarding,
}) => {
  const [providerId, setProviderId] = useState<AIProviderId>(
    settings.activeProviderId
  );
  const [modelId, setModelId] = useState<string>(settings.activeModelId);
  const [apiKey, setApiKey] = useState<string>(
    settings.profiles[0]?.apiKey ?? ''
  );
  const [defaultDiagramType, setDefaultDiagramType] = useState<DiagramType>(
    settings.defaultDiagramType
  );
  const [defaultComplexity, setDefaultComplexity] = useState<ComplexityLevel>(
    settings.defaultComplexity
  );
  const [theme, setTheme] = useState<ThemeMode>(settings.theme);
  const [requireConfirm, setRequireConfirm] = useState<boolean>(
    settings.requireDataSharingConfirmation
  );
  const [persistCredentialsLocally, setPersistCredentialsLocally] =
    useState<boolean>(Boolean(settings.persistCredentialsLocally));
  const [timeoutSeconds, setTimeoutSeconds] = useState<number>(
    Math.round((settings.profiles[0]?.timeoutMs ?? 30000) / 1000)
  );
  const [mcpEndpoint, setMcpEndpoint] = useState<string>(
    settings.mcpConnections[0]?.endpoint ?? 'https://mcp.excalidraw.com'
  );
  const [mcpEnabled, setMcpEnabled] = useState<boolean>(
    settings.mcpConnections[0]?.enabled ?? false
  );
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [storageStats, setStorageStats] = useState<StorageUsageStats | null>(
    null
  );
  const [confirmClearAll, setConfirmClearAll] = useState<boolean>(false);

  useEffect(() => {
    void getStorageUsageStats().then((stats) => setStorageStats(stats));
  }, []);

  const selectedProvider =
    AI_PROVIDER_CATALOG.find((p) => p.id === providerId) ??
    AI_PROVIDER_CATALOG[0];

  const handleProviderChange = (nextId: AIProviderId) => {
    setProviderId(nextId);
    const catalog = AI_PROVIDER_CATALOG.find((p) => p.id === nextId);
    if (catalog) {
      setModelId(catalog.defaultModel);
    }
  };

  const handleTestProvider = async () => {
    setStatusMessage('Testing connection to AI provider…');
    const provider = createAIProvider(providerId, { apiKey, modelId });
    const res = await provider.validateConfig();

    const updated: UserSettings = {
      ...settings,
      activeProviderId: providerId,
      activeModelId: modelId,
      defaultDiagramType,
      defaultComplexity,
      theme,
      requireDataSharingConfirmation: requireConfirm,
      persistCredentialsLocally,
      profiles: settings.profiles.map((p, idx) =>
        idx === 0
          ? {
              ...p,
              providerId,
              modelId,
              apiKey: apiKey.trim(),
              timeoutMs: Math.max(5, timeoutSeconds) * 1000,
            }
          : p
      ),
    };
    onSave(updated);
    setStatusMessage(res.message);
  };

  const handleTestMcp = async () => {
    const conn = settings.mcpConnections[0] ?? {
      id: 'excalidraw-mcp-preset',
      name: 'Excalidraw MCP',
      endpoint: mcpEndpoint,
      transport: 'streamable-http' as const,
      enabled: mcpEnabled,
      status: 'disconnected' as const,
      allowedTools: ['read_me', 'create_view'],
      authMode: 'none' as const,
    };
    const res = await testMCPConnection({ ...conn, endpoint: mcpEndpoint });
    setStatusMessage(res.message);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const updated: UserSettings = {
      ...settings,
      activeProviderId: providerId,
      activeModelId: modelId,
      defaultDiagramType,
      defaultComplexity,
      theme,
      requireDataSharingConfirmation: requireConfirm,
      persistCredentialsLocally,
      profiles: settings.profiles.map((p, idx) =>
        idx === 0
          ? {
              ...p,
              providerId,
              modelId,
              apiKey: apiKey.trim(),
              timeoutMs: Math.max(5, timeoutSeconds) * 1000,
            }
          : p
      ),
      mcpConnections: settings.mcpConnections.map((c, idx) =>
        idx === 0
          ? {
              ...c,
              endpoint: mcpEndpoint.trim(),
              enabled: mcpEnabled,
            }
          : c
      ),
    };
    onSave(updated);
    setStatusMessage('Settings saved locally.');
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 p-3.5">
      <div className="flex items-center justify-between">
        <h1 className="text-sm font-bold text-slate-900 dark:text-slate-100">
          Extension Settings
        </h1>
        <button
          type="button"
          onClick={onReopenOnboarding}
          className="text-xs font-medium text-brand-600 hover:underline dark:text-brand-100"
        >
          Revisit Onboarding Wizard
        </button>
      </div>

      {statusMessage && (
        <div
          role="status"
          className="rounded-lg border border-brand-200 bg-brand-50 p-2.5 text-xs text-brand-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
        >
          {statusMessage}
        </div>
      )}

      <section className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm dark:border-slate-800 dark:bg-slate-900 space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
          AI Provider Configuration
        </h2>

        <div>
          <label
            htmlFor="settings-provider"
            className="block text-xs font-medium text-slate-700 dark:text-slate-200"
          >
            Active Provider
          </label>
          <select
            id="settings-provider"
            value={providerId}
            onChange={(e) =>
              handleProviderChange(e.target.value as AIProviderId)
            }
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
            htmlFor="settings-model"
            className="block text-xs font-medium text-slate-700 dark:text-slate-200"
          >
            Model
          </label>
          <select
            id="settings-model"
            value={modelId}
            onChange={(e) => setModelId(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-800"
          >
            {selectedProvider.models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="settings-api-key"
            className="block text-xs font-medium text-slate-700 dark:text-slate-200"
          >
            API Key
          </label>
          <input
            id="settings-api-key"
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-..."
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-800"
          />
        </div>

        <div>
          <label
            htmlFor="settings-timeout"
            className="block text-xs font-medium text-slate-700 dark:text-slate-200"
          >
            Request Timeout (seconds)
          </label>
          <input
            id="settings-timeout"
            type="number"
            min={5}
            max={120}
            value={timeoutSeconds}
            onChange={(e) => setTimeoutSeconds(Number(e.target.value) || 30)}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-800"
          />
        </div>

        <label className="flex items-start gap-2 text-xs text-slate-700 dark:text-slate-200">
          <input
            type="checkbox"
            checked={persistCredentialsLocally}
            onChange={(e) => setPersistCredentialsLocally(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            Remember API key across browser restarts (unchecked = session-only).
            <span className="block text-[11px] text-slate-500 dark:text-slate-400">
              Note: Ordinary Chrome extension local storage is not a hardware secret vault. Keys are never synced across browsers.
            </span>
          </span>
        </label>

        <button
          type="button"
          onClick={handleTestProvider}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          Test AI Connection
        </button>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm dark:border-slate-800 dark:bg-slate-900 space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
          MCP Server Connection (Optional)
        </h2>

        <div>
          <label
            htmlFor="settings-mcp-endpoint"
            className="block text-xs font-medium text-slate-700 dark:text-slate-200"
          >
            Remote MCP Endpoint
          </label>
          <input
            id="settings-mcp-endpoint"
            type="url"
            value={mcpEndpoint}
            onChange={(e) => setMcpEndpoint(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-800"
          />
        </div>

        <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-200">
          <input
            type="checkbox"
            checked={mcpEnabled}
            onChange={(e) => setMcpEnabled(e.target.checked)}
          />
          Enable remote MCP adapter alongside local Excalidraw renderer
        </label>

        <button
          type="button"
          onClick={handleTestMcp}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          Test MCP Endpoint
        </button>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm dark:border-slate-800 dark:bg-slate-900 space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
          Defaults & Privacy
        </h2>

        <div className="grid grid-cols-3 gap-2">
          <div>
            <label
              htmlFor="settings-default-type"
              className="block text-xs font-medium text-slate-700 dark:text-slate-200"
            >
              Diagram
            </label>
            <select
              id="settings-default-type"
              value={defaultDiagramType}
              onChange={(e) =>
                setDefaultDiagramType(e.target.value as DiagramType)
              }
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-800"
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
              htmlFor="settings-default-complexity"
              className="block text-xs font-medium text-slate-700 dark:text-slate-200"
            >
              Complexity
            </label>
            <select
              id="settings-default-complexity"
              value={defaultComplexity}
              onChange={(e) =>
                setDefaultComplexity(e.target.value as ComplexityLevel)
              }
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-800"
            >
              {COMPLEXITY_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="settings-theme"
              className="block text-xs font-medium text-slate-700 dark:text-slate-200"
            >
              Theme
            </label>
            <select
              id="settings-theme"
              value={theme}
              onChange={(e) => setTheme(e.target.value as ThemeMode)}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-800"
            >
              <option value="system">System</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </div>
        </div>

        <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-200">
          <input
            type="checkbox"
            checked={requireConfirm}
            onChange={(e) => setRequireConfirm(e.target.checked)}
          />
          Require content preview approval before sending page text to AI
        </label>

        {(settings.approvedProviders?.length ?? 0) > 0 && (
          <div className="flex items-center justify-between rounded-lg bg-slate-100 px-2.5 py-1.5 text-[11px] dark:bg-slate-800">
            <span>
              Remembered approvals: {settings.approvedProviders?.join(', ')}
            </span>
            <button
              type="button"
              onClick={() => {
                onSave({ ...settings, approvedProviders: [] });
                setStatusMessage('Cleared remembered provider approvals.');
              }}
              className="font-semibold text-brand-600 hover:underline dark:text-brand-100"
            >
              Reset
            </button>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm dark:border-slate-800 dark:bg-slate-900 space-y-2.5">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
          Local Storage & Data Management
        </h2>
        <div className="text-xs text-slate-600 dark:text-slate-300">
          {storageStats
            ? `${storageStats.diagramCount} saved diagrams • ${storageStats.formattedSize} used in local storage`
            : 'Calculating local storage usage…'}
        </div>

        {!confirmClearAll ? (
          <button
            type="button"
            onClick={() => setConfirmClearAll(true)}
            className="rounded-lg border border-rose-300 px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-300 dark:hover:bg-slate-800"
          >
            Clear All Stored Data
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={async () => {
                await clearAllStoredData();
                const updatedStats = await getStorageUsageStats();
                setStorageStats(updatedStats);
                setConfirmClearAll(false);
                setStatusMessage('All local diagrams, documents, and credentials cleared.');
              }}
              className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700"
            >
              Confirm Clear All Data
            </button>
            <button
              type="button"
              onClick={() => setConfirmClearAll(false)}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 dark:border-slate-700 dark:text-slate-200"
            >
              Cancel
            </button>
          </div>
        )}
      </section>

      <button
        type="submit"
        className="w-full rounded-xl bg-brand-600 py-2.5 text-xs font-semibold text-white shadow hover:bg-brand-700"
      >
        Save Settings
      </button>
    </form>
  );
};
