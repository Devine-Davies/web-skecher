import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SAMPLE_DIAGRAM_SPEC } from '@/shared/constants';
import { validateDiagramSpec } from '@/core/diagrams/schema';
import { applyDiagramPatch } from '@/core/diagrams/patches';
import { renderDiagramToExcalidrawScene } from '@/core/diagrams/renderer';
import { evaluateTabUrlSupport } from '@/core/extraction';
import { extractDocumentFromDom } from '@/content/extractor';
import {
  loadUserSettings,
  saveUserSettings,
} from '@/core/storage';
import { App as SidepanelApp } from '@/sidepanel/App';
import { App as EditorApp } from '@/editor/App';

describe('Volume 01 — Extension Foundation', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('validates the canonical Baseline DiagramSpec fixture', () => {
    const validated = validateDiagramSpec(SAMPLE_DIAGRAM_SPEC);
    expect(validated.id).toBe('baseline-intro');
    expect(validated.nodes).toHaveLength(5);
    expect(validated.edges).toHaveLength(5);
  });

  it('rejects DiagramSpec with edges referencing non-existent nodes', () => {
    expect(() =>
      validateDiagramSpec({
        ...SAMPLE_DIAGRAM_SPEC,
        edges: [
          ...SAMPLE_DIAGRAM_SPEC.edges,
          { id: 'bad-edge', from: 'n1', to: 'missing-node' },
        ],
      })
    ).toThrow(/references missing target node/);
  });

  it('applies DiagramPatch operations while preserving existing nodes', () => {
    const patched = applyDiagramPatch(SAMPLE_DIAGRAM_SPEC, {
      baseDiagramId: SAMPLE_DIAGRAM_SPEC.id,
      baseVersion: 1,
      operations: [
        {
          type: 'add_node',
          node: {
            id: 'n6',
            kind: 'example',
            label: 'Replace lodash.debounce with native patterns',
            sourceSectionIds: ['s4'],
          },
        },
        {
          type: 'add_edge',
          edge: {
            id: 'e6',
            from: 'n4',
            to: 'n6',
            label: 'Example',
          },
        },
      ],
    });

    expect(patched.nodes).toHaveLength(6);
    expect(patched.edges).toHaveLength(6);
  });

  it('renders DiagramSpec into an Excalidraw scene with shapes and arrows', () => {
    const scene = renderDiagramToExcalidrawScene(SAMPLE_DIAGRAM_SPEC);
    expect(scene.type).toBe('excalidraw');
    expect(scene.elements.length).toBeGreaterThanOrEqual(15);
  });

  it('identifies restricted browser URLs vs supported webpages', () => {
    const chromePage = evaluateTabUrlSupport('chrome://extensions', 'Extensions');
    expect(chromePage.supported).toBe(false);

    const articlePage = evaluateTabUrlSupport(
      'https://www.smashingmagazine.com/2026/08/how-baseline-can-help-ship-less-javascript/',
      'Baseline Article'
    );
    expect(articlePage.supported).toBe(true);
    expect(articlePage.domain).toBe('www.smashingmagazine.com');
  });

  it('extracts structured sections from DOM while stripping navigation and inputs', () => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(
      `<!DOCTYPE html>
      <html lang="en">
        <head><title>Test Article</title></head>
        <body>
          <nav>Navigation links that should be ignored</nav>
          <article>
            <h1>Understanding Web Platform Baseline</h1>
            <p>Baseline helps developers know when browser features are ready to use safely.</p>
            <form><input type="password" value="secret" /></form>
          </article>
        </body>
      </html>`,
      'text/html'
    );

    const extracted = extractDocumentFromDom(doc, 'https://example.com/baseline');
    expect(extracted.title).toBe('Test Article');
    expect(extracted.sections).toHaveLength(1);
    expect(extracted.sections[0].heading).toBe('Understanding Web Platform Baseline');
    expect(extracted.sections[0].text).toContain('Baseline helps developers');
  });

  it('renders SidePanel onboarding on first launch and transitions to main view after completion', async () => {
    render(<SidepanelApp />);
    const finishBtn = await screen.findByRole('button', {
      name: /Finish Onboarding/i,
    });
    expect(finishBtn).toBeInTheDocument();

    fireEvent.click(finishBtn);

    const visualiseBtn = await screen.findByRole('button', {
      name: /Visualise Page/i,
    });
    expect(visualiseBtn).toBeInTheDocument();

    const stored = await loadUserSettings();
    expect(stored.onboardingCompleted).toBe(true);
  });

  it('renders the Full-Page Editor route with canvas and accessible textual outline', async () => {
    const initial = await loadUserSettings();
    await saveUserSettings({ ...initial, onboardingCompleted: true });

    render(<EditorApp />);
    const exportBtn = await screen.findByRole('button', {
      name: /Export \.excalidraw/i,
    });
    expect(exportBtn).toBeInTheDocument();

    const outlineToggle = screen.getByRole('button', {
      name: /Accessible Textual Outline/i,
    });
    fireEvent.click(outlineToggle);

    expect(
      await screen.findByText(/How Baseline Helps Ship Less JavaScript — Textual Outline/i)
    ).toBeInTheDocument();
  });
});
