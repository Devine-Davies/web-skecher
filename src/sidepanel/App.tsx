import React, { useEffect, useState } from 'react';
import {
  AI_PROVIDER_CATALOG,
  COMPLEXITY_PRESETS,
  DEFAULT_USER_SETTINGS,
  DIAGRAM_STYLE_OPTIONS,
  SAMPLE_SOURCE_DOCUMENT,
} from '@/shared/constants';
import type {
  ActiveTabMetadata,
  AIProviderId,
  ComplexityLevel,
  DiagramType,
  GenerationStageId,
  OutputDestination,
  SavedDiagram,
  SourceDocument,
  UserSettings,
} from '@/shared/types';
import {
  deleteSavedDiagram,
  loadLastExtractedDocument,
  loadSavedDiagrams,
  loadUserSettings,
  renameSavedDiagram,
  saveLastExtractedDocument,
  saveUserSettings,
} from '@/core/storage';
import {
  createDocumentFromPastedText,
  DEFAULT_MODEL_TOKEN_BUDGET,
  estimateTokenCount,
  evaluateTabUrlSupport,
  prepareDocumentForContextBudget,
} from '@/core/extraction';
import { runDiagramGenerationFlow } from '@/core/ai/generation';
import { requestEndpointAccess } from '@/core/security/host-permissions';
import { extractFromActiveTab, getActiveTabMetadata, openEditorTab } from '@/background/tabs';
import { Header } from './components/Header';
import { StageProgress } from './components/StageProgress';
import { RecentDiagramsList } from './components/RecentDiagramsList';
import { OnboardingView } from './pages/OnboardingView';
import { SettingsView } from './pages/SettingsView';

export const App: React.FC = () => {
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_USER_SETTINGS);
  const [activeView, setActiveView] = useState<'main' | 'settings' | 'onboarding'>('main');
  const [tabMeta, setTabMeta] = useState<ActiveTabMetadata>({
    url: SAMPLE_SOURCE_DOCUMENT.url,
    title: SAMPLE_SOURCE_DOCUMENT.title,
    domain: 'www.smashingmagazine.com',
    supported: true,
  });
  const [sourceDoc, setSourceDoc] = useState<SourceDocument>(SAMPLE_SOURCE_DOCUMENT);
  const [showContentPreview, setShowContentPreview] = useState<boolean>(false);
  const [showManualPaste, setShowManualPaste] = useState<boolean>(false);
  const [pastedTitle, setPastedTitle] = useState<string>('');
  const [pastedText, setPastedText] = useState<string>('');
  const [selectedText, setSelectedText] = useState<string>('');

  const [providerId, setProviderId] = useState<AIProviderId>('openai');
  const [profileId, setProfileId] = useState<string>(
    DEFAULT_USER_SETTINGS.activeProfileId ?? ''
  );
  const [modelId, setModelId] = useState<string>('gpt-4o-mini');
  const [diagramType, setDiagramType] = useState<DiagramType>('flowchart');
  const [complexity, setComplexity] = useState<ComplexityLevel>('simple');
  const [outputDestination, setOutputDestination] =
    useState<OutputDestination>('local_excalidraw');
  const [additionalInstructions, setAdditionalInstructions] = useState<string>('');

  const [awaitingApproval, setAwaitingApproval] = useState<boolean>(false);
  const [rememberProviderApproval, setRememberProviderApproval] =
    useState<boolean>(false);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [activeStage, setActiveStage] = useState<GenerationStageId | null>(null);
  const [completedStages, setCompletedStages] = useState<GenerationStageId[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [recentDiagrams, setRecentDiagrams] = useState<SavedDiagram[]>([]);

  useEffect(() => {
    let mounted = true;
    async function init() {
      const [loadedSettings, loadedDiagrams, loadedDoc, activeTab] =
        await Promise.all([
          loadUserSettings(),
          loadSavedDiagrams(),
          loadLastExtractedDocument(),
          getActiveTabMetadata(),
        ]);

      if (!mounted) return;
      setSettings(loadedSettings);
      setProviderId(loadedSettings.activeProviderId);
      setProfileId(
        loadedSettings.activeProfileId ?? loadedSettings.profiles[0]?.id ?? ''
      );
      setModelId(loadedSettings.activeModelId);
      setDiagramType(loadedSettings.defaultDiagramType);
      setComplexity(loadedSettings.defaultComplexity);
      setOutputDestination(loadedSettings.defaultOutputDestination);
      setRecentDiagrams(loadedDiagrams);
      setSourceDoc(loadedDoc);
      setSelectedText(loadedDoc.selectedText ?? '');
      setTabMeta(activeTab);

      if (!loadedSettings.onboardingCompleted) {
        setActiveView('onboarding');
      }

      if (
        typeof chrome !== 'undefined' &&
        Boolean(chrome.tabs?.query) &&
        activeTab.supported
      ) {
        try {
          const liveDoc = await extractFromActiveTab();
          const prepared = prepareDocumentForContextBudget(
            liveDoc,
            DEFAULT_MODEL_TOKEN_BUDGET
          );
          if (mounted) {
            setSourceDoc(prepared);
            setTabMeta(evaluateTabUrlSupport(prepared.url, prepared.title));
            await saveLastExtractedDocument(prepared);
          }
        } catch {
          // Keep stored document if live tab extraction is blocked
        }
      }
    }
    init();

    const handleTabActivated = () => {
      void handleExtractPage();
    };
    const handleTabUpdated = (
      _tabId: number,
      changeInfo: chrome.tabs.TabChangeInfo
    ) => {
      if (changeInfo.status === 'complete') {
        void handleExtractPage();
      }
    };

    if (typeof chrome !== 'undefined' && chrome.tabs) {
      chrome.tabs.onActivated?.addListener(handleTabActivated);
      chrome.tabs.onUpdated?.addListener(handleTabUpdated);
    }

    return () => {
      mounted = false;
      if (typeof chrome !== 'undefined' && chrome.tabs) {
        chrome.tabs.onActivated?.removeListener(handleTabActivated);
        chrome.tabs.onUpdated?.removeListener(handleTabUpdated);
      }
    };
  }, []);

  useEffect(() => {
    const isDark =
      settings.theme === 'dark' ||
      (settings.theme === 'system' &&
        typeof window !== 'undefined' &&
        window.matchMedia?.('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', isDark);
  }, [settings.theme]);

  const currentProviderCatalog =
    AI_PROVIDER_CATALOG.find((p) => p.id === providerId) ??
    AI_PROVIDER_CATALOG[0];

  const activeProfile =
    settings.profiles.find((profile) => profile.id === profileId) ??
    settings.profiles.find((profile) => profile.providerId === providerId) ??
    settings.profiles[0];
  const hasApiKey =
    providerId === 'copilot' ||
    providerId === 'ollama' ||
    (providerId === 'custom' &&
      Boolean(activeProfile?.approvedEndpoint === activeProfile?.baseUrl)) ||
    Boolean(activeProfile?.apiKey?.trim());

  const handleToggleTheme = async () => {
    const nextTheme = settings.theme === 'dark' ? 'light' : 'dark';
    const updated = await saveUserSettings({ ...settings, theme: nextTheme });
    setSettings(updated);
  };

  const handleExtractPage = async () => {
    setErrorMessage(null);
    const latestMeta = await getActiveTabMetadata();
    setTabMeta(latestMeta);
    try {
      const rawDoc = await extractFromActiveTab();
      const prepared = prepareDocumentForContextBudget(
        rawDoc,
        DEFAULT_MODEL_TOKEN_BUDGET
      );
      setSourceDoc(prepared);
      setTabMeta(evaluateTabUrlSupport(prepared.url, prepared.title));
      setShowManualPaste(false);
      await saveLastExtractedDocument(prepared);
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Unable to extract active page.'
      );
      setShowManualPaste(true);
    }
  };

  const handleApplyPastedText = async () => {
    if (!pastedText.trim()) {
      setErrorMessage('Please enter or paste article text before applying.');
      return;
    }
    setErrorMessage(null);
    const manualDoc = createDocumentFromPastedText(
      pastedText.trim(),
      pastedTitle.trim() || 'Pasted Article Content'
    );
    const prepared = prepareDocumentForContextBudget(
      manualDoc,
      DEFAULT_MODEL_TOKEN_BUDGET
    );
    setSourceDoc(prepared);
    await saveLastExtractedDocument(prepared);
    setShowManualPaste(false);
  };

  const handlePrimaryVisualiseClick = () => {
    if (isGenerating) return;
    setErrorMessage(null);

    const providerAlreadyApproved =
      (settings.approvedProfiles ?? []).includes(activeProfile?.id ?? '') ||
      (providerId !== 'custom' &&
        providerId !== 'ollama' &&
        (settings.approvedProviders ?? []).includes(providerId));
    if (settings.requireDataSharingConfirmation && !providerAlreadyApproved) {
      setAwaitingApproval(true);
      return;
    }

    void executeGeneration();
  };

  const executeGeneration = async () => {
    const providerNeedsNetwork =
      providerId === 'ollama' ||
      providerId === 'copilot' ||
      (providerId === 'custom' &&
        activeProfile?.approvedEndpoint === activeProfile?.baseUrl) ||
      Boolean(activeProfile?.apiKey?.trim());
    if (providerNeedsNetwork) {
      const endpoint =
        (providerId === 'ollama' ||
        providerId === 'custom' ||
        providerId === 'copilot'
          ? activeProfile?.baseUrl
          : undefined) ||
        AI_PROVIDER_CATALOG.find((provider) => provider.id === providerId)
          ?.defaultBaseUrl ||
        (providerId === 'anthropic'
          ? 'https://api.anthropic.com'
          : providerId === 'copilot'
            ? 'http://localhost:4317'
            : 'https://api.openai.com');
      if (!(await requestEndpointAccess(endpoint))) {
        setErrorMessage(
          'Chrome did not grant network access to the selected provider. Allow this host and retry.'
        );
        return;
      }
    }
    setAwaitingApproval(false);
    setIsGenerating(true);
    setCompletedStages([]);
    setActiveStage('reading_webpage');

    try {
      if (rememberProviderApproval) {
        const currentApproved = settings.approvedProfiles ?? [];
        if (activeProfile && !currentApproved.includes(activeProfile.id)) {
          const updatedSettings = await saveUserSettings({
            ...settings,
            approvedProfiles: [...currentApproved, activeProfile.id],
          });
          setSettings(updatedSettings);
        }
      }

      const docToUse: SourceDocument = selectedText.trim()
        ? {
            ...sourceDoc,
            selectedText: selectedText.trim(),
          }
        : sourceDoc;

      const saved = await runDiagramGenerationFlow({
        sourceDocument: docToUse,
        providerId,
        modelId,
        providerProfileId: activeProfile?.id,
        apiKey: activeProfile?.apiKey,
        baseUrl:
          providerId === 'ollama' || providerId === 'custom' || providerId === 'copilot'
            ? activeProfile?.baseUrl
            : undefined,
        approvedEndpoint:
          activeProfile?.approvedEndpoint === activeProfile?.baseUrl
            ? activeProfile.approvedEndpoint
            : undefined,
        additionalHeaders: activeProfile?.additionalHeaders,
        timeoutMs: activeProfile?.timeoutMs,
        diagramType,
        complexity,
        additionalInstructions,
        onStageChange: (stage) => {
          setActiveStage(stage);
          setCompletedStages((prev) =>
            prev.includes(stage) ? prev : [...prev, stage]
          );
        },
      });

      const [updatedList, latestDoc] = await Promise.all([
        loadSavedDiagrams(),
        loadLastExtractedDocument(),
      ]);
      setRecentDiagrams(updatedList);
      setSourceDoc(latestDoc);
      setActiveStage(null);
      await openEditorTab(saved.id);
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Failed to generate diagram.'
      );
      setActiveStage(null);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDeleteDiagram = async (id: string) => {
    const updated = await deleteSavedDiagram(id);
    setRecentDiagrams(updated);
  };

  const handleRenameDiagram = async (id: string, newTitle: string) => {
    const updated = await renameSavedDiagram(id, newTitle);
    setRecentDiagrams(updated);
  };

  return (
    <div className="min-h-screen w-full max-w-[440px] mx-auto flex flex-col bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <Header
        connectionOk={hasApiKey}
        providerName={currentProviderCatalog.name}
        activeView={activeView}
        theme={settings.theme}
        onSelectView={setActiveView}
        onToggleTheme={handleToggleTheme}
      />

      {activeView === 'onboarding' && (
        <OnboardingView
          settings={settings}
          onComplete={async (updated) => {
            const saved = await saveUserSettings(updated);
            setSettings(saved);
            setProviderId(saved.activeProviderId);
            setProfileId(saved.activeProfileId ?? saved.profiles[0]?.id ?? '');
            setModelId(saved.activeModelId);
            setDiagramType(saved.defaultDiagramType);
            setComplexity(saved.defaultComplexity);
            setActiveView('main');
          }}
        />
      )}

      {activeView === 'settings' && (
        <SettingsView
          settings={settings}
          onSave={async (updated) => {
            const saved = await saveUserSettings(updated);
            setSettings(saved);
            setProviderId(saved.activeProviderId);
            setProfileId(saved.activeProfileId ?? saved.profiles[0]?.id ?? '');
            setModelId(saved.activeModelId);
            setDiagramType(saved.defaultDiagramType);
            setComplexity(saved.defaultComplexity);
          }}
          onReopenOnboarding={() => setActiveView('onboarding')}
        />
      )}

      {activeView === 'main' && (
        <main className="flex-1 space-y-3.5 p-3.5">
          {/* Current Page Section */}
          <section
            aria-label="Current page details"
            className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900 space-y-2"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  <span>{tabMeta.domain}</span>
                  <span>•</span>
                  <span
                    className={
                      tabMeta.supported
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-amber-600 dark:text-amber-400'
                    }
                  >
                    {tabMeta.supported ? 'Extracted & Ready' : 'Unsupported URL'}
                  </span>
                </div>
                <h1 className="mt-0.5 truncate text-xs font-semibold text-slate-900 dark:text-slate-100">
                  {sourceDoc.title || tabMeta.title}
                </h1>
              </div>

              <button
                type="button"
                onClick={handleExtractPage}
                className="shrink-0 rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Refresh Page
              </button>
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
              <span>
                {sourceDoc.sections.length} sections • {sourceDoc.wordCount} words (~
                {estimateTokenCount(sourceDoc)} tokens)
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowManualPaste((v) => !v)}
                  className="font-medium text-slate-600 hover:underline dark:text-slate-300"
                >
                  {showManualPaste ? 'Close Paste' : 'Paste Text'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowContentPreview((v) => !v)}
                  className="font-medium text-brand-600 hover:underline dark:text-brand-100"
                >
                  {showContentPreview ? 'Hide Preview' : 'Content Preview'}
                </button>
              </div>
            </div>

            {!tabMeta.supported && tabMeta.unsupportedReason && (
              <div
                role="status"
                className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-800 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200"
              >
                {tabMeta.unsupportedReason}
              </div>
            )}

            {sourceDoc.hierarchicalSummarisationUsed && (
              <div
                role="status"
                aria-label="Hierarchical summarisation notice"
                className="rounded-lg border border-indigo-200 bg-indigo-50 p-2 text-[11px] text-indigo-800 dark:border-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-200"
              >
                <strong>Hierarchical summarisation applied:</strong> Condensed from{' '}
                {sourceDoc.originalWordCount ?? sourceDoc.wordCount} words to{' '}
                {sourceDoc.wordCount} words across {sourceDoc.sections.length} semantic
                sections without dropping section references.
              </div>
            )}

            {showManualPaste && (
              <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-2.5 dark:border-slate-800 dark:bg-slate-800/60">
                <input
                  type="text"
                  aria-label="Manual article title"
                  value={pastedTitle}
                  onChange={(e) => setPastedTitle(e.target.value)}
                  placeholder="Optional title for pasted text…"
                  className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900"
                />
                <textarea
                  rows={3}
                  aria-label="Paste article text manually"
                  value={pastedText}
                  onChange={(e) => setPastedText(e.target.value)}
                  placeholder="Paste webpage or document text here when a page restricts extraction…"
                  className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900"
                />
                <button
                  type="button"
                  onClick={() => void handleApplyPastedText()}
                  className="rounded-lg bg-brand-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-brand-700"
                >
                  Use Pasted Content
                </button>
              </div>
            )}

            {showContentPreview && (
              <div className="max-h-40 overflow-y-auto rounded-lg border border-slate-100 bg-slate-50 p-2 text-xs space-y-1.5 dark:border-slate-800 dark:bg-slate-800/60">
                {sourceDoc.sections.map((sec) => (
                  <div key={sec.id}>
                    {sec.heading && (
                      <div className="font-semibold text-slate-800 dark:text-slate-200">
                        [{sec.id}] {sec.heading}{' '}
                        <span className="text-[10px] font-normal uppercase text-slate-400">
                          ({sec.type})
                        </span>
                      </div>
                    )}
                    <p className="whitespace-pre-line text-[11px] text-slate-600 dark:text-slate-300">
                      {sec.text}
                    </p>
                  </div>
                ))}
              </div>
            )}

            <div>
              <label
                htmlFor="selected-text-input"
                className="block text-[11px] font-medium text-slate-600 dark:text-slate-300"
              >
                Optional selected-text focus
              </label>
              <input
                id="selected-text-input"
                type="text"
                value={selectedText}
                onChange={(e) => setSelectedText(e.target.value)}
                placeholder="Highlight text on the page or paste an excerpt…"
                className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs dark:border-slate-700 dark:bg-slate-800"
              />
            </div>
          </section>

          {/* Generation Options */}
          <section
            aria-label="Diagram generation options"
            className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900 space-y-3"
          >
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
              Generation Options
            </h2>

            <div className="grid grid-cols-2 gap-2">
              <div className="col-span-2">
                <label
                  htmlFor="gen-profile"
                  className="block text-[11px] font-medium text-slate-700 dark:text-slate-200"
                >
                  Saved Provider Profile
                </label>
                <select
                  id="gen-profile"
                  value={activeProfile?.id ?? ''}
                  onChange={(e) => {
                    const selected = settings.profiles.find(
                      (profile) => profile.id === e.target.value
                    );
                    if (selected) {
                      setProfileId(selected.id);
                      setProviderId(selected.providerId);
                      setModelId(selected.modelId);
                    }
                  }}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-800"
                >
                  {settings.profiles.map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  htmlFor="gen-provider"
                  className="block text-[11px] font-medium text-slate-700 dark:text-slate-200"
                >
                  AI Provider
                </label>
                <select
                  id="gen-provider"
                  value={providerId}
                  onChange={(e) => {
                    const next = e.target.value as AIProviderId;
                    setProviderId(next);
                    const found = AI_PROVIDER_CATALOG.find((p) => p.id === next);
                    const profile = settings.profiles.find(
                      (candidate) => candidate.providerId === next
                    );
                    if (profile) {
                      setProfileId(profile.id);
                      setModelId(profile.modelId);
                    } else if (found) {
                      setModelId(found.defaultModel);
                    }
                  }}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-800"
                >
                  {AI_PROVIDER_CATALOG.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="gen-model"
                  className="block text-[11px] font-medium text-slate-700 dark:text-slate-200"
                >
                  AI Model
                </label>
                {providerId === 'ollama' || providerId === 'custom' ? (
                  <>
                    <input
                      id="gen-model"
                      list="gen-model-options"
                      value={modelId}
                      onChange={(e) => setModelId(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-800"
                    />
                    <datalist id="gen-model-options">
                      {currentProviderCatalog.models.map((model) => (
                        <option key={model.id} value={model.id} />
                      ))}
                    </datalist>
                  </>
                ) : (
                  <select
                    id="gen-model"
                    value={modelId}
                    onChange={(e) => setModelId(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-800"
                  >
                    {currentProviderCatalog.models.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            <div>
              <span className="block text-[11px] font-medium text-slate-700 dark:text-slate-200">
                Diagram Style
              </span>
              <div className="mt-1 grid grid-cols-2 gap-1.5">
                {DIAGRAM_STYLE_OPTIONS.map((style) => (
                  <button
                    key={style.id}
                    type="button"
                    onClick={() => setDiagramType(style.id)}
                    title={style.description}
                    className={`rounded-lg border px-2 py-1.5 text-xs font-medium transition ${
                      diagramType === style.id
                        ? 'border-brand-600 bg-brand-50 text-brand-700 dark:bg-brand-600 dark:text-white'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
                    }`}
                  >
                    {style.label}
                  </button>
                ))}
              </div>
            </div>

            <div
              className={
                diagramType === 'infographic'
                  ? 'grid grid-cols-1 gap-2'
                  : 'grid grid-cols-2 gap-2'
              }
            >
              {diagramType !== 'infographic' && (
                <div>
                  <label
                    htmlFor="gen-complexity"
                    className="block text-[11px] font-medium text-slate-700 dark:text-slate-200"
                  >
                    Complexity Level
                  </label>
                  <select
                    id="gen-complexity"
                    value={complexity}
                    onChange={(e) =>
                      setComplexity(e.target.value as ComplexityLevel)
                    }
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-800"
                  >
                    {COMPLEXITY_PRESETS.map((preset) => (
                      <option key={preset.id} value={preset.id}>
                        {preset.label} ({preset.targetNodes} nodes)
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label
                  htmlFor="gen-destination"
                  className="block text-[11px] font-medium text-slate-700 dark:text-slate-200"
                >
                  Output Destination
                </label>
                <select
                  id="gen-destination"
                  value={outputDestination}
                  onChange={(e) =>
                    setOutputDestination(e.target.value as OutputDestination)
                  }
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-800"
                >
                  <option value="local_excalidraw">Excalidraw (Local)</option>
                  <option value="remote_mcp">MCP preview (local output only)</option>
                </select>
              </div>
            </div>
            {outputDestination === 'remote_mcp' && (
              <div
                role="status"
                className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-800 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200"
              >
                Remote MCP Apps are not hosted by this extension. The editable
                local Excalidraw scene is always created and remains the output.
              </div>
            )}

            <div>
              <label
                htmlFor="gen-instructions"
                className="block text-[11px] font-medium text-slate-700 dark:text-slate-200"
              >
                Additional Instructions (optional)
              </label>
              <textarea
                id="gen-instructions"
                rows={2}
                value={additionalInstructions}
                onChange={(e) => setAdditionalInstructions(e.target.value)}
                placeholder="e.g., Focus on when to replace a library with a native browser API"
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-800"
              />
            </div>

            {/* Data-Sharing Confirmation Gate */}
            {awaitingApproval && (
              <div
                role="dialog"
                aria-label="Confirm content sharing"
                className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs space-y-2 dark:border-amber-700 dark:bg-amber-950/50"
              >
                <div className="font-semibold text-amber-900 dark:text-amber-200">
                  Review before generating diagram
                </div>
                <ul className="space-y-0.5 text-[11px] text-amber-800 dark:text-amber-300">
                  <li>
                    <strong>Source URL:</strong> {sourceDoc.url}
                  </li>
                  <li>
                    <strong>Content size:</strong> {sourceDoc.wordCount} words (~
                    {estimateTokenCount(sourceDoc)} tokens)
                  </li>
                  <li>
                    <strong>Destination:</strong> {currentProviderCatalog.name} ({modelId})
                  </li>
                  <li>
                    <strong>MCP server receives content:</strong>{' '}
                    No. This extension does not call MCP tools during generation;
                    page content is sent only to the selected AI provider.
                  </li>
                </ul>
                <div className="max-h-28 overflow-y-auto rounded border border-amber-200 bg-white/80 p-2 text-[11px] text-slate-700 dark:border-amber-800 dark:bg-slate-900 dark:text-slate-200">
                  <div className="font-semibold text-slate-900 dark:text-slate-100">
                    Content Preview ({sourceDoc.sections.length} sections):
                  </div>
                  {sourceDoc.sections.slice(0, 3).map((sec) => (
                    <div key={sec.id} className="mt-1 truncate">
                      [{sec.id}] {sec.heading ? `${sec.heading}: ` : ''}
                      {sec.text}
                    </div>
                  ))}
                </div>
                <label className="flex items-center gap-1.5 text-[11px] text-amber-900 dark:text-amber-200">
                  <input
                    type="checkbox"
                    checked={rememberProviderApproval}
                    onChange={(e) =>
                      setRememberProviderApproval(e.target.checked)
                    }
                  />
                  Remember approval for {currentProviderCatalog.name}
                </label>
                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => void executeGeneration()}
                    className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
                  >
                    Confirm & Generate
                  </button>
                  <button
                    type="button"
                    onClick={() => setAwaitingApproval(false)}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {errorMessage && (
              <div
                role="alert"
                className="rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-700 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-300"
              >
                {errorMessage}
              </div>
            )}

            {/* Primary Actions */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={isGenerating}
                onClick={handlePrimaryVisualiseClick}
                className="flex-1 rounded-xl bg-brand-600 py-2.5 text-xs font-semibold text-white shadow hover:bg-brand-700 disabled:opacity-50"
              >
                {isGenerating ? 'Visualising…' : 'Visualise Page'}
              </button>
              <button
                type="button"
                onClick={() => void openEditorTab(recentDiagrams[0]?.id)}
                className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                Full Editor
              </button>
            </div>
          </section>

          {/* Staged Progress Indicator */}
          <StageProgress
            activeStage={activeStage}
            completedStages={completedStages}
          />

          {/* Recent Diagrams */}
          <RecentDiagramsList
            diagrams={recentDiagrams}
            onOpenDiagram={(id) => void openEditorTab(id)}
            onDeleteDiagram={(id) => void handleDeleteDiagram(id)}
            onRenameDiagram={(id, title) => void handleRenameDiagram(id, title)}
          />
        </main>
      )}
    </div>
  );
};
