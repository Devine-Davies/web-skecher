import React, { useEffect, useRef, useState } from 'react';
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
import { createAIProvider } from '@/core/ai/providers';
import { requestEndpointAccess } from '@/core/security/host-permissions';
import { getProviderApprovalKey } from '@/core/security/provider-approval';
import { extractFromActiveTab, getActiveTabMetadata, openEditorTab } from '@/background/tabs';
import { Header } from './components/Header';
import { StageProgress } from './components/StageProgress';
import { RecentDiagramsList } from './components/RecentDiagramsList';
import { OnboardingView } from './pages/OnboardingView';
import { SettingsView } from './pages/SettingsView';

const EMPTY_SOURCE: SourceDocument = {
  ...SAMPLE_SOURCE_DOCUMENT,
  title: '',
  url: '',
  sections: [],
  wordCount: 0,
  selectedText: '',
};

export const App: React.FC = () => {
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_USER_SETTINGS);
  const [activeView, setActiveView] = useState<'main' | 'settings' | 'onboarding'>('main');
  const [tabMeta, setTabMeta] = useState<ActiveTabMetadata>({
    url: '',
    title: 'Reading active page…',
    domain: '',
    supported: false,
  });
  const [pageDoc, setPageDoc] = useState<SourceDocument>(EMPTY_SOURCE);
  const [manualDoc, setManualDoc] = useState<SourceDocument | null>(null);
  const [pageReady, setPageReady] = useState(false);
  const [isExtracting, setIsExtracting] = useState(true);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const extractionRequest = useRef(0);
  const [showContentPreview, setShowContentPreview] = useState<boolean>(false);
  const [showManualPaste, setShowManualPaste] = useState<boolean>(false);
  const sourceDoc = showManualPaste ? manualDoc ?? EMPTY_SOURCE : pageDoc;
  const hasUsableSource =
    (showManualPaste ? Boolean(manualDoc) : pageReady) &&
    sourceDoc.sections.some((section) => section.text.trim());
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
  const [connection, setConnection] = useState({ ok: false, label: 'Not checked' });

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
      setTabMeta(activeTab);

      if (!loadedSettings.onboardingCompleted) {
        setActiveView('onboarding');
      }

      if (typeof chrome === 'undefined' || !chrome.tabs?.query) {
        setPageDoc(loadedDoc);
        setPageReady(true);
        setIsExtracting(false);
      } else {
        await handleExtractPage();
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
      extractionRequest.current += 1;
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
    settings.profiles.find(
      (profile) => profile.id === profileId && profile.providerId === providerId
    ) ?? settings.profiles.find((profile) => profile.providerId === providerId);
  const hasApiKey =
    providerId === 'copilot' ||
    providerId === 'ollama' ||
    (providerId === 'custom' &&
      Boolean(activeProfile?.baseUrl && activeProfile.approvedEndpoint === activeProfile.baseUrl)) ||
    Boolean(activeProfile?.apiKey?.trim());

  useEffect(() => {
    let cancelled = false;
    let checking = false;
    const check = async () => {
      if (checking) return;
      checking = true;
      if (!hasApiKey) {
        setConnection({ ok: false, label: 'Local preview' });
        checking = false;
        return;
      }
      setConnection({ ok: false, label: 'Checking…' });
      try {
        const baseUrl = providerId === 'copilot' || providerId === 'ollama' || providerId === 'custom'
          ? activeProfile?.baseUrl : undefined;
        const endpoint = baseUrl ||
          currentProviderCatalog.defaultBaseUrl ||
          (providerId === 'anthropic' ? 'https://api.anthropic.com' : 'https://api.openai.com');
        if (typeof chrome !== 'undefined' && chrome.permissions?.contains) {
          const url = new URL(endpoint);
          const allowed = await chrome.permissions.contains({
            origins: [`${url.protocol}//${url.hostname}/*`],
          });
          if (!allowed) {
            if (!cancelled) setConnection({ ok: false, label: 'Allow access in Settings' });
            return;
          }
        }
        const result = await createAIProvider(providerId, {
          ...activeProfile,
          baseUrl,
          modelId,
        }).validateConfig();
        if (!cancelled) {
          setConnection({ ok: result.ok, label: result.ok ? 'Connected' : 'Disconnected' });
        }
      } catch {
        if (!cancelled) setConnection({ ok: false, label: 'Disconnected' });
      } finally {
        checking = false;
      }
    };
    void check();
    const timer = window.setInterval(() => void check(), 30000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [providerId, modelId, activeProfile, hasApiKey, currentProviderCatalog]);

  useEffect(() => {
    setAwaitingApproval(false);
    setSelectedText(sourceDoc.selectedText ?? '');
  }, [sourceDoc]);

  const handleToggleTheme = async () => {
    const nextTheme = document.documentElement.classList.contains('dark') ? 'light' : 'dark';
    const updated = await saveUserSettings({ ...settings, theme: nextTheme });
    setSettings(updated);
  };

  const handleExtractPage = async () => {
    const request = ++extractionRequest.current;
    setPageReady(false);
    setPageDoc(EMPTY_SOURCE);
    setSourceError(null);
    setIsExtracting(true);
    setErrorMessage(null);
    try {
      const latestMeta = await getActiveTabMetadata();
      if (request !== extractionRequest.current) return;
      setTabMeta(latestMeta);
      if (!latestMeta.supported) {
        throw new Error(latestMeta.unsupportedReason || 'This page cannot be read. Paste text instead.');
      }
      const rawDoc = await extractFromActiveTab();
      const prepared = prepareDocumentForContextBudget(
        rawDoc,
        DEFAULT_MODEL_TOKEN_BUDGET
      );
      if (request !== extractionRequest.current) return;
      if (!prepared.sections.some((section) => section.text.trim())) {
        throw new Error('No readable text was found on this page. Paste text instead.');
      }
      setPageDoc(prepared);
      setPageReady(true);
      setTabMeta(evaluateTabUrlSupport(prepared.url, prepared.title));
      await saveLastExtractedDocument(prepared);
    } catch (err: unknown) {
      if (request !== extractionRequest.current) return;
      setSourceError(
        err instanceof Error ? err.message : 'Unable to extract active page.'
      );
    } finally {
      if (request === extractionRequest.current) setIsExtracting(false);
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
    setManualDoc(prepared);
    await saveLastExtractedDocument(prepared);
  };

  const handlePrimaryVisualiseClick = () => {
    if (isGenerating || !hasUsableSource) return;
    setErrorMessage(null);

    const approvalKey = getProviderApprovalKey(providerId, activeProfile);
    const providerAlreadyApproved = (settings.approvedProfiles ?? []).includes(
      approvalKey
    );
    if (settings.requireDataSharingConfirmation && !providerAlreadyApproved) {
      setAwaitingApproval(true);
      return;
    }

    void executeGeneration();
  };

  const executeGeneration = async () => {
    if (isGenerating || !hasUsableSource) return;
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
        const approvalKey = getProviderApprovalKey(providerId, activeProfile);
        if (!currentApproved.includes(approvalKey)) {
          const updatedSettings = await saveUserSettings({
            ...settings,
            approvedProfiles: [...currentApproved, approvalKey],
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
          activeProfile &&
          activeProfile.approvedEndpoint === activeProfile.baseUrl
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

      const updatedList = await loadSavedDiagrams();
      setRecentDiagrams(updatedList);
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
    <div className="sidepanel-shell min-h-screen w-full mx-auto flex flex-col">
      <Header
        connectionOk={connection.ok}
        connectionLabel={connection.label}
        providerName={providerId === 'copilot' ? 'Copilot CLI' : currentProviderCatalog.name}
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
        <main className="sidepanel-main flex-1 space-y-5 p-4">
          {/* Current Page Section */}
          <section
            aria-label="Current page details"
            className="source-section space-y-3"
          >
            <h2 className="section-label">Source</h2>
            <div className="segmented-control flex" aria-label="Source selection">
              <button type="button" aria-pressed={!showManualPaste}
                onClick={() => setShowManualPaste(false)}>This page</button>
              <button type="button" aria-pressed={showManualPaste}
                onClick={() => setShowManualPaste(true)}>Paste text</button>
            </div>
            <div className="source-summary flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  {showManualPaste ? 'Manual source' : tabMeta.domain || 'Active tab'}
                </div>
                <h1 className="mt-1 text-sm font-semibold break-words">
                  {hasUsableSource ? sourceDoc.title : showManualPaste ? 'Add your own text' : tabMeta.title}
                </h1>
                <p className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400" aria-live="polite">
                  {hasUsableSource
                    ? `${sourceDoc.sections.length} sections · ${sourceDoc.wordCount} words · ~${estimateTokenCount(sourceDoc)} tokens`
                    : showManualPaste ? 'Paste content below to get started' : isExtracting ? 'Reading page…' : 'No usable page content'}
                </p>
              </div>

              {!showManualPaste && (
              <button
                type="button"
                onClick={() => void handleExtractPage()}
                disabled={isExtracting}
                className="icon-button shrink-0"
                aria-label="Refresh Page"
                title="Refresh page"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5"/><path d="M6 7a7 7 0 0 1 12-1l2 6M4 12l2 6a7 7 0 0 0 12-1"/></svg>
              </button>
              )}
            </div>

            {hasUsableSource && (
              <div className="text-[11px]">
                <button
                  type="button"
                  onClick={() => setShowContentPreview((v) => !v)}
                  aria-expanded={showContentPreview}
                  className="font-medium text-brand-600 hover:underline dark:text-brand-100"
                >
                  {showContentPreview ? 'Hide Preview' : 'Content Preview'}
                </button>
              </div>
            )}

            {!showManualPaste && sourceError && (
              <div
                role="alert"
                className="source-warning"
              >
                <div className="flex items-center gap-2 font-semibold">
                  <span aria-hidden="true">⚠</span> Page unavailable
                </div>
                <p className="mt-1.5 leading-relaxed">{sourceError}</p>
                <button type="button" className="mt-3 font-semibold underline underline-offset-4"
                  onClick={() => setShowManualPaste(true)}>Paste text instead <span aria-hidden="true">→</span></button>
              </div>
            )}

            {hasUsableSource && sourceDoc.hierarchicalSummarisationUsed && (
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

            {hasUsableSource && showContentPreview && (
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

            {hasUsableSource && <details className="text-xs">
              <summary className="cursor-pointer text-slate-500 dark:text-slate-400">Selected-text focus</summary>
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
            </details>}
          </section>

          {/* Generation Options */}
          <section
            aria-label="Diagram generation options"
            className="diagram-card space-y-4"
          >
            <div className="flex items-center justify-between">
              <h2 className="section-label">Diagram</h2>
              <button type="button" className="icon-button" aria-label="Expand full editor"
                title="Open full editor" onClick={() => void openEditorTab(recentDiagrams[0]?.id)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M14 4h6v6M20 4l-7 7M10 20H4v-6M4 20l7-7"/></svg>
              </button>
            </div>
            <div>
              <span className="control-label">Type</span>
              <div className="diagram-types mt-2 grid grid-cols-4 gap-2">
                {DIAGRAM_STYLE_OPTIONS.map((style, index) => (
                  <button key={style.id} type="button" aria-pressed={diagramType === style.id}
                    onClick={() => setDiagramType(style.id)} title={style.description}
                    className="diagram-type">
                    <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                      {index === 0 ? <><rect x="10" y="3" width="12" height="7" rx="2"/><path d="M16 10v6M7 16h18M7 16v6M25 16v6"/><rect x="2" y="22" width="10" height="7" rx="2"/><rect x="20" y="22" width="10" height="7" rx="2"/></>
                        : index === 1 ? <><path d="M12 16H4m16 0h8M16 12V4m0 16v8M12 12L6 6m14 14 6 6M20 12l6-6"/><circle cx="16" cy="16" r="5"/><circle cx="4" cy="16" r="2"/><circle cx="28" cy="16" r="2"/><circle cx="16" cy="3" r="2"/></>
                        : index === 2 ? <><path d="m9 9 14 2M8 11l6 13m10-10-8 10"/><circle cx="7" cy="7" r="4"/><circle cx="25" cy="11" r="4"/><circle cx="15" cy="27" r="4"/></>
                        : <><rect x="4" y="3" width="24" height="26" rx="3"/><path d="M9 9h14M9 14h6m-6 5h6m5-5v10M9 24h6"/></>}
                    </svg>
                    <span>{style.id === 'concept_map' ? 'Concept' : style.label}</span>
                  </button>
                ))}
              </div>
            </div>
            {diagramType !== 'infographic' && (
              <div>
                <div className="flex flex-wrap items-center justify-between gap-1">
                  <span className="control-label">Detail</span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400" aria-live="polite">
                    {COMPLEXITY_PRESETS.find((preset) => preset.id === complexity)?.targetNodes} nodes
                  </span>
                </div>
                <div className="segmented-control mt-2 flex" aria-label="Detail level">
                  {COMPLEXITY_PRESETS.map((preset) => (
                    <button type="button" key={preset.id} aria-pressed={complexity === preset.id}
                      title={preset.behaviour} onClick={() => setComplexity(preset.id)}>
                      {preset.id === 'balanced' ? 'Standard' : preset.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div>
              <label htmlFor="gen-instructions" className="control-label">
                Instructions <span className="font-normal text-slate-500 dark:text-slate-400">(optional)</span>
              </label>
              <textarea id="gen-instructions" rows={2} value={additionalInstructions}
                onChange={(e) => setAdditionalInstructions(e.target.value)}
                placeholder="What should the diagram focus on?"
                className="mt-2 w-full rounded-lg border px-3 py-2 text-xs"/>
            </div>
            <details className="model-controls">
              <summary className="flex cursor-pointer items-center justify-between gap-2 text-xs">
                <span className="min-w-0"><span className="control-label block">Model</span>
                  <span className="mt-1 block break-words">{currentProviderCatalog.name} · {modelId}</span></span>
                <span className="change-link">Change</span>
              </summary>
            <div className="mt-3 grid grid-cols-2 gap-2">
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
                      setProfileId('');
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

            </details>
            <details>
              <summary className="flex cursor-pointer items-center justify-between gap-2 text-xs">
                <span><span className="control-label block">Output</span>
                  <span className="mt-1 block">{outputDestination === 'local_excalidraw' ? 'Excalidraw · Local editor' : 'MCP preview · Local output'}</span></span>
                <span className="change-link">Change</span>
              </summary>
              <div className="mt-3">
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
            </details>
            {outputDestination === 'remote_mcp' && (
              <div
                role="status"
                className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-800 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200"
              >
                Remote MCP Apps are not hosted by this extension. The editable
                local Excalidraw scene is always created and remains the output.
              </div>
            )}

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
                disabled={isGenerating || !hasUsableSource}
                onClick={handlePrimaryVisualiseClick}
                className="generate-button flex-1 rounded-xl py-3 text-sm font-semibold"
              >
                {isGenerating ? 'Visualising…' : 'Generate diagram'}
              </button>
            </div>
            {!hasUsableSource && <p className="text-center text-[11px] text-slate-500 dark:text-slate-400">Add page content or paste text to generate</p>}
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
