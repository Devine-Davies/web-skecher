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
    const provider = createAIProvider(currentDiagram.providerId, {
      apiKey: settings.profiles[0]?.apiKey,
      modelId: currentDiagram.modelId,
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

  return (
    <div className="flex h-screen w-screen flex-col bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      {/* Top Bar */}
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-3 dark:border-slate-800 dark:bg-slate-900">
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
            <div className="flex flex-wrap items-center gap-2 px-1.5 text-xs text-slate-500 dark:text-slate-400">
              <span>{saveStatus}</span>
              <span>•</span>
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                  currentDiagram.generationMode === 'live_ai'
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                    : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                }`}
              >
                {currentDiagram.generationMode === 'live_ai'
                  ? `⚡ Live AI (${currentDiagram.providerId} • ${currentDiagram.modelId}${
                      currentDiagram.generationLatencyMs
                        ? ` • ${currentDiagram.generationLatencyMs}ms`
                        : ''
                    })`
                  : '⚠️ Local Heuristic Mode (Add API Key in Settings for Live AI)'}
              </span>
              <span>•</span>
              <a
                href={currentDiagram.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-600 hover:underline dark:text-brand-100"
              >
                Return to Source Webpage ↗
              </a>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <select
            aria-label="Switch saved diagram"
            value={currentDiagram.id}
            onChange={(e) => {
              const found = diagrams.find((d) => d.id === e.target.value);
              if (found) setCurrentDiagram(found);
            }}
            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-800"
          >
            {diagrams.map((d) => (
              <option key={d.id} value={d.id}>
                {d.title} (v{d.version})
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={handleExportExcalidraw}
            className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
          >
            Export .excalidraw
          </button>
          <button
            type="button"
            onClick={() => void handleExportSvg()}
            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            Export SVG
          </button>
          <button
            type="button"
            onClick={() => void handleExportPng()}
            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            Export PNG
          </button>
        </div>
      </header>

      {/* Main Editor Body */}
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-hidden">
          <ExcalidrawEditor
            spec={currentDiagram.spec}
            scene={currentDiagram.scene}
            selectedNodeId={selectedNodeId}
            onSelectNode={setSelectedNodeId}
            onUpdateNodeLabel={(id, label) =>
              void handleUpdateNodeLabel(id, label)
            }
            onDeleteNode={(id) => void handleDeleteNode(id)}
            onSceneElementsChange={handleSceneElementsChange}
          />
        </div>

        {/* Right Sidebar: AI Refinement, Version History & Source References */}
        <aside className="w-80 shrink-0 overflow-y-auto border-l border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
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
        </aside>
      </div>
    </div>
  );
};
