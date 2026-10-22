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
  ProviderProfile,
  MCPConnection,
} from '@/shared/types';
import { createAIProvider } from '@/core/ai/providers';
import { testMCPConnection, type MCPTool } from '@/core/mcp/client';
import { clearAllStoredData, getStorageUsageStats } from '@/core/storage';
import { loadMCPSecret, saveMCPSecret } from '@/core/security/credentials';
import { requestEndpointAccess } from '@/core/security/host-permissions';

function parseAdditionalHeaders(value: string): Record<string, string> {
  const parsed: unknown = JSON.parse(value);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Additional headers must be a JSON object.');
  }
  const allowed = new Set([
    'x-organization-id',
    'x-project-id',
    'x-tenant-id',
    'x-request-id',
  ]);
  return Object.fromEntries(
    Object.entries(parsed).filter(
      ([name, headerValue]) =>
        allowed.has(name.toLowerCase()) &&
        typeof headerValue === 'string' &&
        !/[\r\n]/.test(headerValue)
    )
  );
}

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
  const initialProfile =
    settings.profiles.find((p) => p.id === settings.activeProfileId) ??
    settings.profiles[0];
  const [profiles, setProfiles] = useState<ProviderProfile[]>(settings.profiles);
  const [profileId, setProfileId] = useState<string>(
    initialProfile?.id ?? 'default-openai'
  );
  const [providerId, setProviderId] = useState<AIProviderId>(
    initialProfile?.providerId ?? settings.activeProviderId
  );
  const [modelId, setModelId] = useState<string>(
    initialProfile?.modelId ?? settings.activeModelId
  );
  const [apiKey, setApiKey] = useState<string>(
    initialProfile?.apiKey ?? ''
  );
  const [profileName, setProfileName] = useState<string>(
    initialProfile?.name ?? 'Default profile'
  );
  const [baseUrl, setBaseUrl] = useState<string>(
    initialProfile?.baseUrl ??
      AI_PROVIDER_CATALOG.find((p) => p.id === providerId)?.defaultBaseUrl ??
      ''
  );
  const [endpointApproved, setEndpointApproved] = useState<boolean>(
    Boolean(initialProfile?.approvedEndpoint === initialProfile?.baseUrl)
  );
  const [additionalHeadersJson, setAdditionalHeadersJson] = useState<string>(
    JSON.stringify(initialProfile?.additionalHeaders ?? {}, null, 2)
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
  const [mcpConnections, setMcpConnections] = useState<MCPConnection[]>(
    settings.mcpConnections
  );
  const [mcpId, setMcpId] = useState<string>(
    settings.mcpConnections[0]?.id ?? ''
  );
  const [mcpName, setMcpName] = useState<string>(
    settings.mcpConnections[0]?.name ?? 'MCP server'
  );
  const [mcpApproved, setMcpApproved] = useState<boolean>(
    Boolean(settings.mcpConnections[0]?.approved)
  );
  const [mcpAuthMode, setMcpAuthMode] = useState<'none' | 'bearer'>(
    settings.mcpConnections[0]?.authMode === 'bearer' ? 'bearer' : 'none'
  );
  const [mcpSecret, setMcpSecret] = useState<string>('');
  const [mcpTools, setMcpTools] = useState<MCPTool[]>([]);
  const [mcpAllowedTools, setMcpAllowedTools] = useState<string[]>(
    settings.mcpConnections[0]?.allowedTools ?? []
  );
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [storageStats, setStorageStats] = useState<StorageUsageStats | null>(
    null
  );
  const [confirmClearAll, setConfirmClearAll] = useState<boolean>(false);

  useEffect(() => {
    void getStorageUsageStats().then((stats) => setStorageStats(stats));
    if (mcpId) void loadMCPSecret(mcpId).then(setMcpSecret);
  }, []);

  const selectedProvider =
    AI_PROVIDER_CATALOG.find((p) => p.id === providerId) ??
    AI_PROVIDER_CATALOG[0];

  const handleProviderChange = (nextId: AIProviderId) => {
    setProviderId(nextId);
    const catalog = AI_PROVIDER_CATALOG.find((p) => p.id === nextId);
    if (catalog) {
      setModelId(catalog.defaultModel);
      setApiKey('');
      setBaseUrl(catalog.defaultBaseUrl ?? '');
      setEndpointApproved(false);
      setAdditionalHeadersJson('{}');
    }
  };

  const getUpdatedProfiles = (): ProviderProfile[] =>
    profiles.map((profile) =>
      profile.id === profileId
        ? {
            ...profile,
            name: profileName.trim() || selectedProvider.name,
            providerId,
            modelId,
            apiKey: apiKey.trim(),
            baseUrl: baseUrl.trim() || undefined,
            approvedEndpoint:
              endpointApproved && baseUrl.trim()
                ? baseUrl.trim()
                : undefined,
            additionalHeaders: parseAdditionalHeaders(additionalHeadersJson),
            timeoutMs: Math.max(5, timeoutSeconds) * 1000,
          }
        : profile
    );

  const handleTestProvider = async () => {
    setStatusMessage('Testing connection to AI provider…');
    const configuredBaseUrl =
      providerId === 'ollama' ||
      providerId === 'custom' ||
      providerId === 'copilot'
        ? baseUrl
        : '';
    const endpoint =
      configuredBaseUrl ||
      AI_PROVIDER_CATALOG.find((provider) => provider.id === providerId)
        ?.defaultBaseUrl ||
      (providerId === 'anthropic'
        ? 'https://api.anthropic.com'
        : providerId === 'copilot'
          ? 'http://localhost:4317'
          : 'https://api.openai.com');
    const hasLiveConfig =
      providerId === 'ollama' ||
      providerId === 'copilot' ||
      (providerId === 'custom' && endpointApproved) ||
      Boolean(apiKey.trim());
    if (
      hasLiveConfig &&
      !(await requestEndpointAccess(endpoint))
    ) {
      setStatusMessage(
        'Network permission was not granted. Approve this host in Chrome site permissions before testing.'
      );
      return;
    }
    let additionalHeaders: Record<string, string> = {};
    try {
      additionalHeaders = parseAdditionalHeaders(additionalHeadersJson);
    } catch {
      setStatusMessage('Additional headers must be a valid JSON object.');
      return;
    }
    const provider = createAIProvider(providerId, {
      apiKey,
      modelId,
      baseUrl: configuredBaseUrl || undefined,
      approvedEndpoint: endpointApproved ? baseUrl : undefined,
      additionalHeaders,
      timeoutMs: Math.max(5, timeoutSeconds) * 1000,
    });
    const res = await provider.validateConfig();

    const updated: UserSettings = {
      ...settings,
      activeProviderId: providerId,
      activeProfileId: profileId,
      activeModelId: modelId,
      defaultDiagramType,
      defaultComplexity,
      theme,
      requireDataSharingConfirmation: requireConfirm,
      persistCredentialsLocally,
      profiles: getUpdatedProfiles(),
    };
    onSave(updated);
    setStatusMessage(res.message);
  };

  const handleTestMcp = async () => {
    const conn = mcpConnections.find((connection) => connection.id === mcpId);
    if (!conn) {
      setStatusMessage('Create or select an MCP connection first.');
      return;
    }
    const approvedConnection: MCPConnection = {
      ...conn,
      name: mcpName.trim() || conn.name,
      endpoint: mcpEndpoint.trim(),
      enabled: mcpEnabled,
      approved: mcpApproved,
      approvedEndpoint: mcpApproved ? mcpEndpoint.trim() : undefined,
      authMode: mcpAuthMode,
      allowedTools: mcpAllowedTools,
      status: 'connecting',
    };
    if (!(await requestEndpointAccess(approvedConnection.endpoint))) {
      setStatusMessage(
        'Chrome did not grant access to this MCP endpoint. Connection was not tested.'
      );
      return;
    }
    const res = await testMCPConnection(approvedConnection, {
      authToken: mcpAuthMode === 'bearer' ? mcpSecret : undefined,
    });
    setMcpTools(res.discoveredTools);
    const savedConnection: MCPConnection = {
      ...approvedConnection,
      status: res.ok ? 'disconnected' : 'error',
    };
    const updatedConnections = mcpConnections.map((connection) =>
      connection.id === mcpId ? savedConnection : connection
    );
    setMcpConnections(updatedConnections);
    await saveMCPSecret(
      mcpId,
      mcpAuthMode === 'bearer' ? mcpSecret : '',
      Boolean(settings.persistCredentialsLocally)
    );
    onSave({ ...settings, mcpConnections: updatedConnections });
    setStatusMessage(res.message);
  };

  const handleSaveMcpSettings = async () => {
    const connection = mcpConnections.find((item) => item.id === mcpId);
    if (!connection) return;
    const updatedConnection: MCPConnection = {
      ...connection,
      name: mcpName.trim() || connection.name,
      endpoint: mcpEndpoint.trim(),
      enabled: mcpEnabled,
      approved: mcpApproved,
      approvedEndpoint: mcpApproved ? mcpEndpoint.trim() : undefined,
      authMode: mcpAuthMode,
      allowedTools: mcpAllowedTools,
      status: mcpEnabled ? connection.status : 'disconnected',
    };
    const updatedConnections = mcpConnections.map((item) =>
      item.id === mcpId ? updatedConnection : item
    );
    setMcpConnections(updatedConnections);
    await saveMCPSecret(
      mcpId,
      mcpAuthMode === 'bearer' ? mcpSecret : '',
      Boolean(settings.persistCredentialsLocally)
    );
    onSave({ ...settings, mcpConnections: updatedConnections });
    setStatusMessage('MCP connection settings saved.');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    let updatedProfiles: ProviderProfile[];
    try {
      updatedProfiles = getUpdatedProfiles();
    } catch {
      setStatusMessage('Additional headers must be a valid JSON object.');
      return;
    }
    const updated: UserSettings = {
      ...settings,
      activeProviderId: providerId,
      activeProfileId: profileId,
      activeModelId: modelId,
      defaultDiagramType,
      defaultComplexity,
      theme,
      requireDataSharingConfirmation: requireConfirm,
      persistCredentialsLocally,
      profiles: updatedProfiles,
      mcpConnections,
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

        <div className="flex gap-2">
          <div className="flex-1">
            <label
              htmlFor="settings-profile"
              className="block text-xs font-medium text-slate-700 dark:text-slate-200"
            >
              Saved profile
            </label>
            <select
              id="settings-profile"
              value={profileId}
              onChange={(e) => {
                const profile = profiles.find((p) => p.id === e.target.value);
                if (!profile) return;
                setProfileId(profile.id);
                setProfileName(profile.name);
                setProviderId(profile.providerId);
                setModelId(profile.modelId);
                setApiKey(profile.apiKey ?? '');
                setBaseUrl(
                  profile.baseUrl ??
                    AI_PROVIDER_CATALOG.find((p) => p.id === profile.providerId)
                      ?.defaultBaseUrl ??
                    ''
                );
                setEndpointApproved(
                  profile.approvedEndpoint === profile.baseUrl
                );
                setAdditionalHeadersJson(
                  JSON.stringify(profile.additionalHeaders ?? {}, null, 2)
                );
                setTimeoutSeconds(Math.round(profile.timeoutMs / 1000));
              }}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-800"
            >
              {profiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end gap-1">
            <button
              type="button"
              onClick={() => {
                const catalog = AI_PROVIDER_CATALOG.find((p) => p.id === 'openai')!;
                const id = `profile-${Date.now()}`;
                const profile: ProviderProfile = {
                  id,
                  name: `OpenAI profile ${profiles.length + 1}`,
                  providerId: 'openai',
                  modelId: catalog.defaultModel,
                  timeoutMs: 30000,
                };
                setProfiles((current) => [...current, profile]);
                setProfileId(id);
                setProfileName(profile.name);
                setProviderId(profile.providerId);
                setModelId(profile.modelId);
                setApiKey('');
                setBaseUrl('');
                setEndpointApproved(false);
                setAdditionalHeadersJson('{}');
                setTimeoutSeconds(30);
              }}
              className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs dark:border-slate-700"
            >
              Add
            </button>
            <button
              type="button"
              disabled={profiles.length <= 1}
              onClick={() => {
                const remaining = profiles.filter((p) => p.id !== profileId);
                if (!remaining.length) return;
                setProfiles(remaining);
                const profile = remaining[0];
                setProfileId(profile.id);
                setProfileName(profile.name);
                setProviderId(profile.providerId);
                setModelId(profile.modelId);
                setApiKey(profile.apiKey ?? '');
                setBaseUrl(profile.baseUrl ?? '');
                setEndpointApproved(
                  profile.approvedEndpoint === profile.baseUrl
                );
                setAdditionalHeadersJson(
                  JSON.stringify(profile.additionalHeaders ?? {}, null, 2)
                );
              }}
              className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs disabled:opacity-50 dark:border-slate-700"
            >
              Remove
            </button>
          </div>
        </div>

        <div>
          <label
            htmlFor="settings-profile-name"
            className="block text-xs font-medium text-slate-700 dark:text-slate-200"
          >
            Profile name
          </label>
          <input
            id="settings-profile-name"
            value={profileName}
            onChange={(e) => setProfileName(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-800"
          />
        </div>

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
          {providerId === 'ollama' || providerId === 'custom' ? (
            <>
              <input
                id="settings-model"
                list="settings-model-options"
                value={modelId}
                onChange={(e) => setModelId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-800"
              />
              <datalist id="settings-model-options">
                {selectedProvider.models.map((model) => (
                  <option key={model.id} value={model.id} />
                ))}
              </datalist>
            </>
          ) : (
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
          )}
        </div>

        {providerId !== 'ollama' && (
        <div>
          <label
            htmlFor="settings-api-key"
            className="block text-xs font-medium text-slate-700 dark:text-slate-200"
          >
            API Key (optional for custom endpoints)
          </label>
          <input
            id="settings-api-key"
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={providerId === 'anthropic' ? 'sk-ant-…' : 'API key'}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-800"
          />
        </div>
        )}

        {(providerId === 'ollama' || providerId === 'custom') && (
          <>
            <div>
              <label
                htmlFor="settings-base-url"
                className="block text-xs font-medium text-slate-700 dark:text-slate-200"
              >
                {providerId === 'ollama' ? 'Local Ollama URL' : 'Base URL'}
              </label>
              <input
                id="settings-base-url"
                type="url"
                value={baseUrl}
                onChange={(e) => {
                  setBaseUrl(e.target.value);
                  setEndpointApproved(false);
                }}
                placeholder={
                  providerId === 'ollama'
                    ? 'http://localhost:11434/v1'
                    : 'https://api.example.com/v1'
                }
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-800"
              />
            </div>
            {providerId === 'custom' && (
              <>
                <label className="flex items-start gap-2 text-xs text-slate-700 dark:text-slate-200">
                  <input
                    type="checkbox"
                    checked={endpointApproved}
                    onChange={(e) => setEndpointApproved(e.target.checked)}
                    className="mt-0.5"
                  />
                  <span>
                    I approve this exact public HTTPS endpoint. Page content
                    will be sent there only after the content preview approval.
                  </span>
                </label>
                <div>
                  <label
                    htmlFor="settings-extra-headers"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-200"
                  >
                    Optional organization/project/tenant/request headers (JSON)
                  </label>
                  <textarea
                    id="settings-extra-headers"
                    rows={2}
                    value={additionalHeadersJson}
                    onChange={(e) => setAdditionalHeadersJson(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-xs dark:border-slate-700 dark:bg-slate-800"
                  />
                  <p className="text-[11px] text-slate-500">
                    Only non-credential identifiers are accepted; authentication
                    headers and other overrides are rejected.
                  </p>
                </div>
              </>
            )}
          </>
        )}

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
          Remote MCP Connections (Optional)
        </h2>
        <p className="text-[11px] text-slate-500 dark:text-slate-400">
          Connections require explicit approval and public HTTPS. Tool schemas
          are discovered from the server; page content is never sent by the
          connection test. MCP Apps rendering is unsupported here, so local
          Excalidraw remains the editable output.
        </p>

        <div className="flex gap-2">
          <select
            aria-label="Saved MCP connection"
            value={mcpId}
            onChange={(e) => {
              const selected = mcpConnections.find(
                (connection) => connection.id === e.target.value
              );
              if (!selected) return;
              setMcpId(selected.id);
              setMcpName(selected.name);
              setMcpEndpoint(selected.endpoint);
              setMcpEnabled(selected.enabled);
              setMcpApproved(Boolean(selected.approved));
              setMcpAuthMode(
                selected.authMode === 'bearer' ? 'bearer' : 'none'
              );
              setMcpAllowedTools(selected.allowedTools);
              setMcpTools([]);
              void loadMCPSecret(selected.id).then(setMcpSecret);
            }}
            className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-800"
          >
            {mcpConnections.map((connection) => (
              <option key={connection.id} value={connection.id}>
                {connection.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => {
              const id = `mcp-${Date.now()}`;
              const connection: MCPConnection = {
                id,
                name: `MCP server ${mcpConnections.length + 1}`,
                endpoint: 'https://',
                transport: 'streamable-http',
                enabled: false,
                status: 'disconnected',
                allowedTools: [],
                authMode: 'none',
                approved: false,
              };
              setMcpConnections((current) => [...current, connection]);
              setMcpId(id);
              setMcpName(connection.name);
              setMcpEndpoint(connection.endpoint);
              setMcpEnabled(false);
              setMcpApproved(false);
              setMcpAuthMode('none');
              setMcpAllowedTools([]);
              setMcpTools([]);
              setMcpSecret('');
            }}
            className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs dark:border-slate-700"
          >
            Add
          </button>
          {mcpId && (
            <button
              type="button"
              onClick={() => {
                const updated = mcpConnections.filter(
                  (connection) => connection.id !== mcpId
                );
                setMcpConnections(updated);
                setMcpId(updated[0]?.id ?? '');
                setMcpTools([]);
                setMcpAllowedTools([]);
                void saveMCPSecret(mcpId, '');
                onSave({ ...settings, mcpConnections: updated });
                setStatusMessage('MCP connection removed.');
              }}
              className="rounded-lg border border-rose-300 px-2.5 py-1.5 text-xs text-rose-700 dark:border-rose-800 dark:text-rose-300"
            >
              Delete
            </button>
          )}
        </div>

        {mcpId && (
          <>
        <div>
          <label
            htmlFor="settings-mcp-name"
            className="block text-xs font-medium text-slate-700 dark:text-slate-200"
          >
            Connection name
          </label>
          <input
            id="settings-mcp-name"
            value={mcpName}
            onChange={(e) => setMcpName(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-800"
          />
        </div>

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
            onChange={(e) => {
              setMcpEndpoint(e.target.value);
              setMcpApproved(false);
              setMcpTools([]);
            }}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-800"
          />
        </div>

        <label className="flex items-start gap-2 text-xs text-slate-700 dark:text-slate-200">
          <input
            type="checkbox"
            checked={mcpApproved}
            onChange={(e) => setMcpApproved(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            I approve connecting to this exact endpoint. It can expose tools
            that may transmit data; every tool call requires separate
            per-request content consent.
          </span>
        </label>

        <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-200">
          <input
            type="checkbox"
            checked={mcpEnabled}
            onChange={(e) => setMcpEnabled(e.target.checked)}
          />
          Enable this connection for explicitly permitted tool calls
        </label>

        <div>
          <label
            htmlFor="settings-mcp-auth"
            className="block text-xs font-medium text-slate-700 dark:text-slate-200"
          >
            Authentication
          </label>
          <select
            id="settings-mcp-auth"
            value={mcpAuthMode}
            onChange={(e) =>
              setMcpAuthMode(e.target.value as 'none' | 'bearer')
            }
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-800"
          >
            <option value="none">None</option>
            <option value="bearer">Token header</option>
          </select>
          {mcpAuthMode === 'bearer' && (
            <input
              aria-label="MCP access token"
              type="password"
              value={mcpSecret}
              onChange={(e) => setMcpSecret(e.target.value)}
              placeholder="Token stored separately from connection settings"
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-800"
            />
          )}
          <p className="mt-1 text-[11px] text-slate-500">
            OAuth is not supported in this browser client.
          </p>
        </div>

        <div className="flex gap-2">
        <button
          type="button"
          onClick={handleTestMcp}
          disabled={!mcpApproved}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          Initialize & Discover Tools
        </button>
          <button
            type="button"
            onClick={() => void handleSaveMcpSettings()}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Save Connection
          </button>
        </div>

        {mcpTools.length > 0 && (
          <div className="space-y-2 rounded-lg border border-slate-200 p-2 dark:border-slate-700">
            <div className="text-xs font-semibold">Discovered tools & permissions</div>
            {mcpTools.map((tool) => (
              <div key={tool.name} className="rounded border border-slate-100 p-2 dark:border-slate-800">
                <label className="flex items-start gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={mcpAllowedTools.includes(tool.name)}
                    onChange={(e) =>
                      setMcpAllowedTools((current) =>
                        e.target.checked
                          ? [...new Set([...current, tool.name])]
                          : current.filter((name) => name !== tool.name)
                      )
                    }
                  />
                  <span>
                    <strong>{tool.name}</strong>
                    {tool.description ? ` — ${tool.description}` : ''}
                  </span>
                </label>
                <details className="mt-1">
                  <summary className="cursor-pointer text-[11px] text-slate-500">
                    Inspect input schema
                  </summary>
                  <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap text-[10px]">
                    {JSON.stringify(tool.inputSchema, null, 2)}
                  </pre>
                </details>
              </div>
            ))}
            <button
              type="button"
              onClick={() => void handleSaveMcpSettings()}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs dark:border-slate-700"
            >
              Save Tool Permissions
            </button>
          </div>
        )}
          </>
        )}
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

        {((settings.approvedProfiles?.length ?? 0) > 0 ||
          (settings.approvedProviders?.length ?? 0) > 0) && (
          <div className="flex items-center justify-between rounded-lg bg-slate-100 px-2.5 py-1.5 text-[11px] dark:bg-slate-800">
            <span>
              Remembered content-sharing approvals
            </span>
            <button
              type="button"
              onClick={() => {
                onSave({
                  ...settings,
                  approvedProviders: [],
                  approvedProfiles: [],
                });
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
