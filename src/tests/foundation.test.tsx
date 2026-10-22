import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { SAMPLE_DIAGRAM_SPEC, SAMPLE_SOURCE_DOCUMENT } from '@/shared/constants';
import { validateDiagramSpec } from '@/core/diagrams/schema';
import { applyDiagramPatch } from '@/core/diagrams/patches';
import { renderDiagramToExcalidrawScene } from '@/core/diagrams/renderer';
import { evaluateTabUrlSupport } from '@/core/extraction';
import { extractDocumentFromDom } from '@/content/extractor';
import {
  createInitialSampleDiagram,
  loadUserSettings,
  saveLastExtractedDocument,
  saveDiagramRecord,
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
      name: /Generate diagram/i,
    });
    expect(visualiseBtn).toBeInTheDocument();

    const stored = await loadUserSettings();
    expect(stored.onboardingCompleted).toBe(true);
  });

  it('renders the Full-Page Editor route with canvas and accessible textual outline', async () => {
    const initial = await loadUserSettings();
    await saveUserSettings({ ...initial, onboardingCompleted: true });

    render(<EditorApp />);
    const exportBtn = await screen.findByRole('button', { name: 'Export' });
    fireEvent.click(exportBtn);
    expect(screen.getByRole('button', { name: 'Export .excalidraw' })).toBeInTheDocument();

    const outlineToggle = screen.getByRole('button', {
      name: /Accessible Textual Outline/i,
    });
    fireEvent.click(outlineToggle);

    expect(
      await screen.findByText(/How Baseline Helps Ship Less JavaScript — Textual Outline/i)
    ).toBeInTheDocument();
  });

  it('keeps the editor title and description and toggles a resizable source view', async () => {
    render(<EditorApp />);

    expect(await screen.findByRole('textbox', { name: 'Diagram title' })).toBeInTheDocument();
    expect(screen.getByText(SAMPLE_DIAGRAM_SPEC.summary)).toBeInTheDocument();
    const toolbar = screen.getByRole('navigation', { name: 'Editor controls' });
    const exportButton = screen.getByRole('button', { name: 'Export' });
    expect(toolbar).toContainElement(exportButton);
    expect(exportButton).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(exportButton);
    expect(exportButton).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('group', { name: 'Export options' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Export SVG' })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('group', { name: 'Export options' })).not.toBeInTheDocument();
    expect(exportButton).toHaveFocus();
    fireEvent.click(exportButton);
    fireEvent.pointerDown(document.body);
    expect(exportButton).toHaveAttribute('aria-expanded', 'false');

    const toggle = screen.getByRole('button', { name: 'Side by side' });
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    const source = screen.getByRole('region', { name: 'Original webpage' });
    expect(within(source).getByText(SAMPLE_SOURCE_DOCUMENT.sections[0].text)).toBeInTheDocument();
    expect(within(source).getByRole('link', { name: /Open in new tab/i })).toHaveAttribute('href', SAMPLE_SOURCE_DOCUMENT.url);
    expect(within(source).queryByTitle('Original webpage')).not.toBeInTheDocument();

    const divider = screen.getByRole('separator', { name: 'Resize source and diagram' });
    fireEvent.keyDown(divider, { key: 'ArrowRight' });
    expect(divider).toHaveAttribute('aria-valuenow', '55');
    fireEvent.click(toggle);
    expect(screen.queryByRole('region', { name: 'Original webpage' })).not.toBeInTheDocument();
  });

  it('renders saved source as text rather than executing page markup', async () => {
    const unsafeText = '<img src=x onerror=alert(1)>';
    await saveLastExtractedDocument({
      ...SAMPLE_SOURCE_DOCUMENT,
      sections: [{ ...SAMPLE_SOURCE_DOCUMENT.sections[0], text: unsafeText }],
    });
    render(<EditorApp />);
    await screen.findByRole('textbox', { name: 'Diagram title' });
    fireEvent.click(screen.getByRole('button', { name: 'Side by side' }));
    const source = screen.getByRole('region', { name: 'Original webpage' });
    expect(within(source).getByText(unsafeText)).toBeInTheDocument();
    expect(source.querySelector('img')).toBeNull();
  });

  it('does not show the latest extraction when it belongs to another diagram', async () => {
    await saveLastExtractedDocument({ ...SAMPLE_SOURCE_DOCUMENT, id: 'unrelated', title: 'Unrelated' });
    render(<EditorApp />);
    await screen.findByRole('textbox', { name: 'Diagram title' });
    fireEvent.click(screen.getByRole('button', { name: 'Side by side' }));
    const source = screen.getByRole('region', { name: 'Original webpage' });
    expect(await within(source).findByText(/No saved page content is available/)).toBeInTheDocument();
    expect(within(source).queryByText('Unrelated')).not.toBeInTheDocument();
  });

  it('highlights and scrolls to supporting sections when a node is selected or the source view opens', async () => {
    const diagram = createInitialSampleDiagram();
    await saveDiagramRecord({
      ...diagram,
      spec: {
        ...diagram.spec,
        nodes: diagram.spec.nodes.map((node) =>
          node.id === 'n1' ? { ...node, sourceSectionIds: ['s1', 's3'] } : node
        ),
      },
    });
    const scrollIntoView = vi.fn();
    const originalScrollIntoView = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = scrollIntoView;
    try {
      render(<EditorApp />);
      await screen.findByRole('textbox', { name: 'Diagram title' });
      fireEvent.click(screen.getByText(SAMPLE_DIAGRAM_SPEC.nodes[0].label));
      fireEvent.click(screen.getByRole('button', { name: 'Side by side' }));
      const first = screen.getByTestId('source-section-s1');
      const third = screen.getByTestId('source-section-s3');
      await waitFor(() => expect(first).toHaveClass('ring-2'));
      expect(third).toHaveClass('ring-2');
      expect(screen.getByTestId('source-section-s2')).not.toHaveClass('ring-2');
      expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'nearest' });
      expect(screen.getByText(/Highlighted source sections for/)).toBeInTheDocument();

      fireEvent.click(screen.getByText(SAMPLE_DIAGRAM_SPEC.nodes[1].label));
      expect(first).not.toHaveClass('ring-2');
      expect(third).not.toHaveClass('ring-2');
      expect(screen.getByTestId('source-section-s2')).toHaveClass('ring-2');
      fireEvent.click(screen.getByRole('button', { name: 'Clear Selection' }));
      expect(screen.getByTestId('source-section-s2')).not.toHaveClass('ring-2');
    } finally {
      Element.prototype.scrollIntoView = originalScrollIntoView;
    }
  });

  it('explains when a selected node has no matching saved source section', async () => {
    const diagram = createInitialSampleDiagram();
    await saveDiagramRecord({
      ...diagram,
      spec: {
        ...diagram.spec,
        nodes: diagram.spec.nodes.map((node) =>
          node.id === 'n1' ? { ...node, sourceSectionIds: ['missing'] } : node
        ),
      },
    });
    render(<EditorApp />);
    await screen.findByRole('textbox', { name: 'Diagram title' });
    fireEvent.click(screen.getByRole('button', { name: 'Side by side' }));
    fireEvent.click(screen.getByText(SAMPLE_DIAGRAM_SPEC.nodes[0].label));
    expect(await screen.findByText('No saved source sections are linked to this node.')).toBeInTheDocument();
    expect(screen.getByTestId('source-section-s1')).not.toHaveClass('ring-2');
  });
});
