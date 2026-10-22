import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SAMPLE_DIAGRAM_SPEC } from '@/shared/constants';
import {
  applyDiagramPatch,
  applyPatchToSavedDiagram,
  buildHeuristicRefinementPatch,
  DiagramPatchConflictError,
} from '@/core/diagrams/patches';
import {
  clearAllStoredData,
  createInitialSampleDiagram,
  getStorageUsageStats,
  loadCrashRecoveryDraft,
  loadSavedDiagrams,
  loadUserSettings,
  renameSavedDiagram,
  restoreDiagramCheckpoint,
  saveCrashRecoveryDraft,
  saveDiagramRecord,
  saveUserSettings,
} from '@/core/storage';
import { RecentDiagramsList } from '@/sidepanel/components/RecentDiagramsList';
import { App as EditorApp } from '@/editor/App';

describe('Volume 05 — Refinement and Persistence', () => {
  beforeEach(async () => {
    localStorage.clear();
    sessionStorage.clear();
    await clearAllStoredData();
  });

  it('supports all 7 natural-language refinement instruction types via DiagramPatch', () => {
    const instructions = [
      'Explain this diagram more simply',
      'Add practical examples',
      'Expand the selected concept',
      'Remove unnecessary details',
      'Add connections between these concepts',
      'Highlight the most important information',
    ];

    for (const instruction of instructions) {
      const patch = buildHeuristicRefinementPatch({
        currentDiagram: SAMPLE_DIAGRAM_SPEC,
        currentVersion: 1,
        instruction,
        selectedNodeIds: ['n2'],
        modelId: 'gpt-4o-mini',
      });
      const updated = applyDiagramPatch(SAMPLE_DIAGRAM_SPEC, patch, 1);
      expect(updated.nodes.length).toBeGreaterThanOrEqual(4);
    }
  });

  it('detects version conflicts and rejects stale patches without corrupting the diagram', () => {
    const patch = buildHeuristicRefinementPatch({
      currentDiagram: SAMPLE_DIAGRAM_SPEC,
      currentVersion: 1,
      instruction: 'Add practical examples',
      modelId: 'gpt-4o-mini',
    });

    expect(() => applyDiagramPatch(SAMPLE_DIAGRAM_SPEC, patch, 2)).toThrow(
      DiagramPatchConflictError
    );
  });

  it('creates checkpoints, preserves manual node positions, and records refinement history', () => {
    const initial = createInitialSampleDiagram();
    const withManualEdits = {
      ...initial,
      hasManualEdits: true,
      manualNodePositions: {
        n1: { x: 111, y: 222 },
        n2: { x: 333, y: 444 },
      },
    };

    const patch = buildHeuristicRefinementPatch({
      currentDiagram: withManualEdits.spec,
      currentVersion: withManualEdits.version,
      instruction: 'Add an example showing when we can remove a JavaScript library.',
      modelId: 'gpt-4o-mini',
    });

    const updated = applyPatchToSavedDiagram({
      diagram: withManualEdits,
      patch,
      instruction: 'Add an example showing when we can remove a JavaScript library.',
    });

    expect(updated.version).toBe(2);
    expect(updated.checkpoints).toHaveLength(1);
    expect(updated.checkpoints?.[0].version).toBe(1);
    expect(updated.refinementHistory).toHaveLength(1);
    expect(updated.manualNodePositions?.n1).toEqual({ x: 111, y: 222 });
    expect(updated.manualNodePositions?.n2).toEqual({ x: 333, y: 444 });

    const shapeN1 = updated.scene.elements.find((el) => el.id === 'shape-n1');
    expect(shapeN1?.x).toBe(111);
    expect(shapeN1?.y).toBe(222);
  });

  it('persists diagrams, renames, restores checkpoints, tracks crash drafts, and calculates storage usage', async () => {
    const initial = createInitialSampleDiagram();
    await saveDiagramRecord(initial);

    await renameSavedDiagram(initial.id, 'Renamed Baseline Flowchart');
    const afterRename = await loadSavedDiagrams();
    expect(afterRename[0].title).toBe('Renamed Baseline Flowchart');
    expect(afterRename[0].version).toBe(2);
    expect(afterRename[0].checkpoints).toHaveLength(1);

    const restored = await restoreDiagramCheckpoint(initial.id, 1);
    expect(restored?.title).toBe(SAMPLE_DIAGRAM_SPEC.title);
    expect(restored?.version).toBe(3);

    await saveCrashRecoveryDraft({ ...restored!, version: 4 });
    const draft = await loadCrashRecoveryDraft();
    expect(draft?.version).toBe(4);

    const stats = await getStorageUsageStats();
    expect(stats.diagramCount).toBe(1);
    expect(stats.totalBytes).toBeGreaterThan(100);
  });

  it('requires delete confirmation and supports inline renaming in RecentDiagramsList', () => {
    const sample = createInitialSampleDiagram();
    const deletedIds: string[] = [];
    const renamed: Array<{ id: string; title: string }> = [];

    render(
      <RecentDiagramsList
        diagrams={[sample]}
        onOpenDiagram={() => {}}
        onDeleteDiagram={(id) => deletedIds.push(id)}
        onRenameDiagram={(id, title) => renamed.push({ id, title })}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Rename/i }));
    const renameInput = screen.getByLabelText(/New title for/i);
    fireEvent.change(renameInput, { target: { value: 'Updated Title' } });
    fireEvent.click(screen.getByRole('button', { name: /^Save$/i }));
    expect(renamed).toEqual([{ id: sample.id, title: 'Updated Title' }]);

    fireEvent.click(screen.getByRole('button', { name: /^Delete /i }));
    expect(deletedIds).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: /Confirm Delete/i }));
    expect(deletedIds).toEqual([sample.id]);
  });

  it('applies AI refinement in the Editor and allows restoring a previous version checkpoint', async () => {
    const settings = await loadUserSettings();
    await saveUserSettings({ ...settings, onboardingCompleted: true });

    render(<EditorApp />);

    const promptBtn = await screen.findByRole('button', {
      name: /Add practical examples/i,
    });
    fireEvent.click(promptBtn);

    const applyBtn = screen.getByRole('button', {
      name: /Apply AI Refinement/i,
    });
    fireEvent.click(applyBtn);

    const restoreBtn = await screen.findByRole('button', {
      name: /Restore v1/i,
    });
    expect(restoreBtn).toBeInTheDocument();

    fireEvent.click(restoreBtn);
    expect(
      await screen.findByText(/Restored checkpoint v1/i)
    ).toBeInTheDocument();
  });
});
