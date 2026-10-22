import React, { useEffect, useRef, useState } from 'react';
import {
  clearCrashRecoveryDraft,
  createInitialSampleDiagram,
  loadCrashRecoveryDraft,
  loadLastExtractedDocument,
  loadSavedDiagrams,
  loadUserSettings,
  restoreDiagramCheckpoint,
  saveCrashRecoveryDraft,
  saveDiagramRecord,
} from '@/core/storage';
import {
  applyPatchToSavedDiagram,
  createDiagramCheckpoint,
} from '@/core/diagrams/patches';
import {
  exportSceneToSvgString,
  renderDiagramToExcalidrawScene,
} from '@/core/diagrams/renderer';
import { exportToBlob, exportToSvg } from '@excalidraw/excalidraw';
import { createAIProvider } from '@/core/ai/providers';
import { SAMPLE_SOURCE_DOCUMENT } from '@/shared/constants';
import type {
  ExcalidrawElementStub,
  SavedDiagram,
  SourceDocument,
} from '@/shared/types';
import {
  buildExcalidrawElementsFromSpec,
  ExcalidrawEditor,
} from './ExcalidrawEditor';
import { RefinementPanel } from './components/RefinementPanel';

export const App: React.FC = () => {
  const [diagrams, setDiagrams] = useState<SavedDiagram[]>([]);
  const [currentDiagram, setCurrentDiagram] = useState<SavedDiagram>(
    createInitialSampleDiagram()
  );
  const [sourceDoc, setSourceDoc] = useState<SourceDocument>(
    SAMPLE_SOURCE_DOCUMENT
  );
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<string>('Saved locally');
  const [viewMode, setViewMode] = useState<'canvas' | 'outline'>('canvas');
  const [fitRequest, setFitRequest] = useState(0);
  const [showSource, setShowSource] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const controlsRef = useRef<HTMLDivElement>(null);
  const exportButtonRef = useRef<HTMLButtonElement>(null);
  const [splitRatio, setSplitRatio] = useState(50);
  const splitContainerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const [recoveryCandidate, setRecoveryCandidate] =
    useState<SavedDiagram | null>(null);
  const liveElementsRef = useRef<ExcalidrawElementStub[]>([]);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    async function init() {
      const [loadedDiagrams, loadedDoc, settings, crashDraft] =
        await Promise.all([
          loadSavedDiagrams(),
          loadLastExtractedDocument(),
          loadUserSettings(),
          loadCrashRecoveryDraft(),
        ]);

      const isDark =
        settings.theme === 'dark' ||
        (settings.theme === 'system' &&
          typeof window !== 'undefined' &&
          window.matchMedia?.('(prefers-color-scheme: dark)').matches);
      document.documentElement.classList.toggle('dark', isDark);

      setDiagrams(loadedDiagrams);
      setSourceDoc(loadedDoc);

      const params = new URLSearchParams(window.location.search);
      const requestedId = params.get('diagramId');
      const matched =
        loadedDiagrams.find((d) => d.id === requestedId) ?? loadedDiagrams[0];
      if (matched) {
        setCurrentDiagram(matched);
        if (
          crashDraft &&
          crashDraft.id === matched.id &&
          crashDraft.version > matched.version
        ) {
          setRecoveryCandidate(crashDraft);
        }
      }
    }
    void init();
  }, []);

  useEffect(() => {
    if (!exportOpen) return;
    const dismissOnOutsideClick = (event: PointerEvent) => {
      if (!controlsRef.current?.contains(event.target as Node)) setExportOpen(false);
    };
    const dismissOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setExportOpen(false);
        exportButtonRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', dismissOnOutsideClick);
    document.addEventListener('keydown', dismissOnEscape);
    return () => {
      document.removeEventListener('pointerdown', dismissOnOutsideClick);
      document.removeEventListener('keydown', dismissOnEscape);
    };
  }, [exportOpen]);

  const persistUpdatedSpec = async (
    nextSpec: SavedDiagram['spec'],
    statusLabel = 'Saved locally',
    isManualEdit = true
  ) => {
    const checkpoint = createDiagramCheckpoint(
      currentDiagram,
      `Before ${statusLabel.toLowerCase()}`
    );
    const updated: SavedDiagram = {
      ...currentDiagram,
      title: nextSpec.title,
      diagramType: nextSpec.type,
      spec: nextSpec,
      scene: renderDiagramToExcalidrawScene(
        nextSpec,
        currentDiagram.manualNodePositions
      ),
      hasManualEdits: isManualEdit || Boolean(currentDiagram.hasManualEdits),
      checkpoints: [checkpoint, ...(currentDiagram.checkpoints ?? [])].slice(
        0,
        15
      ),
      updatedAt: new Date().toISOString(),
      version: currentDiagram.version + 1,
    };
    setCurrentDiagram(updated);
    await saveCrashRecoveryDraft(updated);
    const list = await saveDiagramRecord(updated);
    await clearCrashRecoveryDraft();
    setDiagrams(list);
    setSaveStatus(`${statusLabel} (v${updated.version})`);
  };

  const handleUpdateTitle = async (newTitle: string) => {
    await persistUpdatedSpec(
      { ...currentDiagram.spec, title: newTitle },
      'Title updated'
    );
  };

  const handleUpdateNodeLabel = async (nodeId: string, newLabel: string) => {
    const nextNodes = currentDiagram.spec.nodes.map((n) =>
      n.id === nodeId ? { ...n, label: newLabel } : n
    );
    await persistUpdatedSpec(
      { ...currentDiagram.spec, nodes: nextNodes },
      'Node updated'
    );
  };

  const handleDeleteNode = async (nodeId: string) => {
    if (currentDiagram.spec.nodes.length <= 1) return;
    const nextNodes = currentDiagram.spec.nodes.filter((n) => n.id !== nodeId);
    const nextEdges = currentDiagram.spec.edges.filter(
      (e) => e.from !== nodeId && e.to !== nodeId
    );
    setSelectedNodeId(null);
    await persistUpdatedSpec(
      { ...currentDiagram.spec, nodes: nextNodes, edges: nextEdges },
      'Node removed'
    );
  };

  const handleApplyRefinement = async (instruction: string) => {
    const settings = await loadUserSettings();
    const profile =
      settings.profiles.find(
        (p) => p.id === currentDiagram.providerProfileId
      ) ??
      settings.profiles.find(
        (p) => p.providerId === currentDiagram.providerId
      );
    const provider = createAIProvider(currentDiagram.providerId, {
      apiKey: profile?.apiKey,
      modelId: currentDiagram.modelId,
      baseUrl:
        currentDiagram.providerId === 'ollama' ||
        currentDiagram.providerId === 'custom' ||
        currentDiagram.providerId === 'copilot'
          ? profile?.baseUrl
          : undefined,
      approvedEndpoint:
        profile && profile.approvedEndpoint === profile.baseUrl
          ? profile.approvedEndpoint
          : undefined,
      additionalHeaders: profile?.additionalHeaders,
      timeoutMs: profile?.timeoutMs,
    });
    const patch = await provider.refineDiagram({
      currentDiagram: currentDiagram.spec,
      currentVersion: currentDiagram.version,
      instruction,
      selectedNodeIds: selectedNodeId ? [selectedNodeId] : undefined,
      modelId: currentDiagram.modelId,
    });
    const updated = applyPatchToSavedDiagram({
      diagram: currentDiagram,
      patch,
      instruction,
    });
    setCurrentDiagram(updated);
    const list = await saveDiagramRecord(updated);
    setDiagrams(list);
    setSaveStatus(`AI refinement applied (v${updated.version})`);
  };

  const handleRestoreCheckpoint = async (checkpointVersion: number) => {
    const restored = await restoreDiagramCheckpoint(
      currentDiagram.id,
      checkpointVersion
    );
    if (restored) {
      setCurrentDiagram(restored);
      const list = await loadSavedDiagrams();
      setDiagrams(list);
      setSaveStatus(`Restored checkpoint v${checkpointVersion} (now v${restored.version})`);
    }
  };

  const triggerDownload = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getExportableElements = () => {
    try {
      return buildExcalidrawElementsFromSpec(currentDiagram.spec);
    } catch {
      return liveElementsRef.current.length > 0
        ? liveElementsRef.current
        : currentDiagram.scene.elements;
    }
  };

  const handleExportExcalidraw = () => {
    const exportScene = {
      ...currentDiagram.scene,
      elements:
        liveElementsRef.current.length > 0
          ? liveElementsRef.current
          : currentDiagram.scene.elements,
    };
    const blob = new Blob([JSON.stringify(exportScene, null, 2)], {
      type: 'application/json',
    });
    triggerDownload(blob, `${currentDiagram.id}.excalidraw`);
  };

  const handleExportSvg = async () => {
    try {
      const elements = getExportableElements();
      const svgEl = await exportToSvg({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        elements: elements as any,
        appState: {
          viewBackgroundColor:
            currentDiagram.scene.appState.viewBackgroundColor || '#ffffff',
          exportBackground: true,
        },
        files: null,
      });
      const svgMarkup = svgEl.outerHTML;
      const blob = new Blob([svgMarkup], { type: 'image/svg+xml' });
      triggerDownload(blob, `${currentDiagram.id}.svg`);
    } catch {
      const fallbackSvg = exportSceneToSvgString(
        currentDiagram.scene,
        currentDiagram.title
      );
      const blob = new Blob([fallbackSvg], { type: 'image/svg+xml' });
      triggerDownload(blob, `${currentDiagram.id}.svg`);
    }
  };

  const handleExportPng = async () => {
    try {
      const elements = getExportableElements();
      const pngBlob = await exportToBlob({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        elements: elements as any,
        mimeType: 'image/png',
        appState: {
          viewBackgroundColor:
            currentDiagram.scene.appState.viewBackgroundColor || '#ffffff',
          exportBackground: true,
        },
        files: null,
      });
      if (pngBlob) {
        triggerDownload(pngBlob, `${currentDiagram.id}.png`);
      }
    } catch {
      const fallbackSvg = exportSceneToSvgString(
        currentDiagram.scene,
        currentDiagram.title
      );
      const blob = new Blob([fallbackSvg], { type: 'image/svg+xml' });
      triggerDownload(blob, `${currentDiagram.id}.svg`);
    }
  };

  const handleSceneElementsChange = (elements: ExcalidrawElementStub[]) => {
    liveElementsRef.current = elements;
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      const manualPositions: Record<string, { x: number; y: number }> = {
        ...(currentDiagram.manualNodePositions ?? {}),
      };
      for (const el of elements) {
        const nodeId = el.customData?.nodeId;
        if (nodeId && (el.type === 'rectangle' || el.type === 'diamond')) {
          manualPositions[nodeId] = { x: Math.round(el.x), y: Math.round(el.y) };
        }
      }
      void saveCrashRecoveryDraft({
        ...currentDiagram,
        hasManualEdits: true,
        manualNodePositions: manualPositions,
        scene: {
          ...currentDiagram.scene,
          elements,
        },
        updatedAt: new Date().toISOString(),
      });
    }, 450);
  };

  const sourceUrl = (() => {
    try {
      const url = new URL(currentDiagram.sourceUrl);
      return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
    } catch {
      return null;
    }
  })();

  const updateSplitRatio = (clientX: number) => {
    const bounds = splitContainerRef.current?.getBoundingClientRect();
    if (bounds?.width) {
      setSplitRatio(Math.min(80, Math.max(20, Math.round(((clientX - bounds.left) / bounds.width) * 100))));
    }
  };

  return (
    <div className="flex h-screen w-screen flex-col bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <header className="border-b border-slate-200 bg-white px-5 py-3 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 font-bold text-white shadow-sm">
            VP
          </div>
          <div>
            <input
              type="text"
              aria-label="Diagram title"
              value={currentDiagram.title}
              onChange={(e) => void handleUpdateTitle(e.target.value)}
              className="rounded border border-transparent px-1.5 py-0.5 text-sm font-bold text-slate-900 hover:border-slate-300 focus:border-brand-600 dark:bg-transparent dark:text-slate-100"
            />
            <p className="px-1.5 text-xs text-slate-500 dark:text-slate-400">
              {currentDiagram.spec.summary}
            </p>
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div ref={splitContainerRef} className="flex min-w-0 flex-1 overflow-hidden">
        <div className="min-w-0 overflow-hidden" style={{ width: showSource ? `${splitRatio}%` : '100%' }}>
          <ExcalidrawEditor
            spec={currentDiagram.spec}
            scene={currentDiagram.scene}
            viewMode={viewMode}
            fitRequest={fitRequest}
            selectedNodeId={selectedNodeId}
            onSelectNode={setSelectedNodeId}
            onUpdateNodeLabel={(id, label) =>
              void handleUpdateNodeLabel(id, label)
            }
            onDeleteNode={(id) => void handleDeleteNode(id)}
            onSceneElementsChange={handleSceneElementsChange}
          />
        </div>
        {showSource && (
          <>
            <div
              role="separator"
              aria-label="Resize source and diagram"
              aria-orientation="vertical"
              aria-valuemin={20}
              aria-valuemax={80}
              aria-valuenow={splitRatio}
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
                  event.preventDefault();
                  setSplitRatio((value) => Math.min(80, Math.max(20, value + (event.key === 'ArrowRight' ? 5 : -5))));
                }
              }}
              onPointerDown={(event) => {
                draggingRef.current = true;
                event.currentTarget.setPointerCapture(event.pointerId);
                updateSplitRatio(event.clientX);
              }}
              onPointerMove={(event) => {
                if (draggingRef.current) updateSplitRatio(event.clientX);
              }}
              onPointerUp={(event) => {
                draggingRef.current = false;
                event.currentTarget.releasePointerCapture(event.pointerId);
              }}
              onPointerCancel={() => { draggingRef.current = false; }}
              className="z-10 w-2 shrink-0 cursor-col-resize touch-none bg-slate-200 hover:bg-brand-500 focus-visible:bg-brand-500 dark:bg-slate-700"
            />
            <section aria-label="Original webpage" className="flex min-w-0 flex-1 flex-col bg-white dark:bg-slate-900">
              <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-3 py-2 text-xs dark:border-slate-700">
                <span className="font-semibold">Original webpage</span>
                {sourceUrl && <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:underline dark:text-brand-100">Open in new tab ↗</a>}
              </div>
              {sourceUrl ? (
                <>
                  <iframe title="Original webpage" src={sourceUrl} sandbox="allow-forms allow-scripts allow-same-origin" referrerPolicy="no-referrer" className="min-h-0 w-full flex-1 border-0" />
                  <p className="px-3 py-1 text-[11px] text-slate-500">If this site blocks embedded pages, open it in a new tab instead.</p>
                </>
              ) : (
                <p className="p-4 text-sm text-slate-500">No supported source webpage is available for this diagram.</p>
              )}
            </section>
          </>
        )}
        </div>

        {!showSource && <aside className="w-80 shrink-0 overflow-y-auto border-l border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          {recoveryCandidate && (
            <div
              role="alert"
              className="m-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs space-y-2 dark:border-amber-700 dark:bg-amber-950/60"
            >
              <div className="font-semibold text-amber-900 dark:text-amber-200">
                Unsaved recovery draft found (v{recoveryCandidate.version})
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    setCurrentDiagram(recoveryCandidate);
                    await saveDiagramRecord(recoveryCandidate);
                    await clearCrashRecoveryDraft();
                    setRecoveryCandidate(null);
                  }}
                  className="rounded bg-brand-600 px-2.5 py-1 text-[11px] font-semibold text-white"
                >
                  Recover Draft
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await clearCrashRecoveryDraft();
                    setRecoveryCandidate(null);
                  }}
                  className="rounded border border-slate-300 px-2.5 py-1 text-[11px]"
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}

          <RefinementPanel
            selectedNodeId={selectedNodeId}
            hasManualEdits={currentDiagram.hasManualEdits}
            refinementHistory={currentDiagram.refinementHistory}
            onApplyInstruction={handleApplyRefinement}
          />

          <section
            aria-label="Diagram Version History"
            className="space-y-2 border-b border-slate-200 p-4 dark:border-slate-800"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                Version Checkpoints ({currentDiagram.checkpoints?.length ?? 0})
              </h2>
              <span className="text-[11px] text-slate-500">
                Current: v{currentDiagram.version}
              </span>
            </div>
            {(currentDiagram.checkpoints?.length ?? 0) === 0 ? (
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Checkpoints are saved automatically before edits and AI refinements.
              </p>
            ) : (
              <ul className="space-y-1.5 max-h-40 overflow-y-auto">
                {currentDiagram.checkpoints?.map((cp) => (
                  <li
                    key={`${cp.version}-${cp.createdAt}`}
                    className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 bg-slate-50 p-2 text-[11px] dark:border-slate-800 dark:bg-slate-800/50"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold text-slate-800 dark:text-slate-200">
                        v{cp.version} — {cp.reason}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        {cp.spec.nodes.length} nodes
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleRestoreCheckpoint(cp.version)}
                      className="shrink-0 rounded border border-brand-600 px-2 py-0.5 text-[10px] font-semibold text-brand-600 hover:bg-brand-50 dark:text-brand-100 dark:hover:bg-slate-800"
                    >
                      Restore v{cp.version}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section
            aria-label="Source References"
            className="space-y-2.5 p-4"
          >
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
              Source References ({sourceDoc.sections.length})
            </h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Each node links to extracted sections from {sourceDoc.title}.
            </p>
            <div className="space-y-2">
              {sourceDoc.sections.map((section) => (
                <div
                  key={section.id}
                  className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-xs dark:border-slate-800 dark:bg-slate-800/60"
                >
                  <div className="font-semibold text-slate-800 dark:text-slate-200">
                    [{section.id}] {section.heading || 'Section'}
                  </div>
                  <p className="mt-1 text-[11px] text-slate-600 dark:text-slate-300">
                    {section.text}
                  </p>
                </div>
              ))}
            </div>
          </section>
        </aside>}
      </div>
      <div ref={controlsRef} className="fixed bottom-3 left-1/2 z-20 w-max max-w-[calc(100vw-1rem)] -translate-x-1/2">
      <nav aria-label="Editor controls" className="flex items-center gap-2 overflow-x-auto whitespace-nowrap rounded-full border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-medium text-white shadow-xl">
        <select
          aria-label="Switch saved diagram"
          value={currentDiagram.id}
          onChange={(e) => {
            const found = diagrams.find((d) => d.id === e.target.value);
            if (found) setCurrentDiagram(found);
          }}
          className="max-w-40 shrink-0 rounded-full border border-slate-600 bg-slate-900 px-3 py-2 text-white"
        >
          {diagrams.map((d) => <option key={d.id} value={d.id}>{d.title} (v{d.version})</option>)}
        </select>
        <button type="button" aria-pressed={viewMode === 'canvas'} onClick={() => setViewMode('canvas')} className="inline-flex shrink-0 items-center gap-2 rounded-full px-3 py-2 hover:bg-slate-700 aria-pressed:bg-brand-600">
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="m7 16 4-4 3 3 3-5"/></svg>
          Excalidraw Canvas
        </button>
        <button type="button" aria-pressed={viewMode === 'outline'} onClick={() => setViewMode('outline')} className="inline-flex shrink-0 items-center gap-2 rounded-full px-3 py-2 hover:bg-slate-700 aria-pressed:bg-brand-600">
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"/></svg>
          Accessible Textual Outline
        </button>
        {viewMode === 'canvas' && <button type="button" onClick={() => setFitRequest((value) => value + 1)} className="inline-flex shrink-0 items-center gap-2 rounded-full px-3 py-2 hover:bg-slate-700">
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5"/></svg>
          Fit to Diagram
        </button>}
        <span className="h-6 shrink-0 border-l border-slate-600" aria-hidden="true" />
        <button type="button" aria-pressed={showSource} onClick={() => setShowSource((value) => !value)} className="inline-flex shrink-0 items-center gap-2 rounded-full px-3 py-2 hover:bg-slate-700 aria-pressed:bg-brand-600">
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M12 4v16"/></svg>
          Side by side
        </button>
        <span role="status" className="shrink-0 px-2 text-slate-300">{saveStatus}</span>
        <button ref={exportButtonRef} type="button" aria-expanded={exportOpen} aria-controls="editor-export-options" aria-haspopup="true" onClick={() => setExportOpen((open) => !open)} className="inline-flex shrink-0 items-center gap-2 rounded-full bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700">
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v12m-4-4 4 4 4-4M4 17v3h16v-3"/></svg>
          Export
          <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m2 4 4 4 4-4"/></svg>
        </button>
      </nav>
      {exportOpen && (
        <div id="editor-export-options" role="group" aria-label="Export options" className="absolute bottom-full right-0 mb-2 flex w-52 flex-col gap-1 rounded-xl border border-slate-700 bg-slate-800 p-2 text-sm text-white shadow-xl">
          <button type="button" onClick={() => { setExportOpen(false); handleExportExcalidraw(); }} className="rounded-lg px-3 py-2 text-left hover:bg-brand-600">Export .excalidraw</button>
          <button type="button" onClick={() => { setExportOpen(false); void handleExportSvg(); }} className="rounded-lg px-3 py-2 text-left hover:bg-brand-600">Export SVG</button>
          <button type="button" onClick={() => { setExportOpen(false); void handleExportPng(); }} className="rounded-lg px-3 py-2 text-left hover:bg-brand-600">Export PNG</button>
        </div>
      )}
      </div>
    </div>
  );
};
