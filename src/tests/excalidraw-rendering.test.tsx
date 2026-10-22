import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SAMPLE_DIAGRAM_SPEC } from '@/shared/constants';
import { calculateDiagramLayout } from '@/core/diagrams/layout';
import {
  exportSceneToSvgString,
  NODE_VISUAL_CONVENTIONS,
  renderDiagramToExcalidrawScene,
} from '@/core/diagrams/renderer';
import { App as EditorApp } from '@/editor/App';
import { loadUserSettings, saveUserSettings } from '@/core/storage';

describe('Volume 04 — Excalidraw Rendering', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('computes non-overlapping Dagre, radial, and Bento poster layouts across flowchart, mindmap, concept_map, and infographic styles', () => {
    for (const type of [
      'flowchart',
      'mindmap',
      'concept_map',
      'infographic',
    ] as const) {
      const positioned = calculateDiagramLayout({
        ...SAMPLE_DIAGRAM_SPEC,
        type,
      });

      expect(positioned).toHaveLength(SAMPLE_DIAGRAM_SPEC.nodes.length);

      for (let i = 0; i < positioned.length; i++) {
        for (let j = i + 1; j < positioned.length; j++) {
          const a = positioned[i];
          const b = positioned[j];
          const overlapsHorizontally = a.x < b.x + b.width && a.x + a.width > b.x;
          const overlapsVertically = a.y < b.y + b.height && a.y + a.height > b.y;
          expect(overlapsHorizontally && overlapsVertically).toBe(false);
        }
      }
    }
  });

  it('maps each DiagramNodeKind to distinct shapes, roundness, and colours with bound text and arrows', () => {
    expect(NODE_VISUAL_CONVENTIONS.concept.shape).toBe('rectangle');
    expect(NODE_VISUAL_CONVENTIONS.concept.rounded).toBe(true);
    expect(NODE_VISUAL_CONVENTIONS.process.shape).toBe('rectangle');
    expect(NODE_VISUAL_CONVENTIONS.process.rounded).toBe(false);
    expect(NODE_VISUAL_CONVENTIONS.decision.shape).toBe('diamond');
    expect(NODE_VISUAL_CONVENTIONS.outcome.rounded).toBe(true);

    const scene = renderDiagramToExcalidrawScene(SAMPLE_DIAGRAM_SPEC);
    expect(scene.type).toBe('excalidraw');
    expect(scene.version).toBe(2);

    const shapeN1 = scene.elements.find((el) => el.id === 'shape-n1');
    const textN1 = scene.elements.find((el) => el.id === 'text-n1');
    const shapeN2 = scene.elements.find((el) => el.id === 'shape-n2');
    const arrowE1 = scene.elements.find((el) => el.id === 'arrow-e1');

    expect(shapeN1?.type).toBe('rectangle');
    expect(shapeN1?.boundElements).toContainEqual({ id: 'text-n1', type: 'text' });
    expect(shapeN1?.boundElements).toContainEqual({ id: 'arrow-e1', type: 'arrow' });
    expect(textN1?.containerId).toBe('shape-n1');

    expect(shapeN2?.type).toBe('diamond');
    expect(arrowE1?.startBinding?.elementId).toBe('shape-n1');
    expect(arrowE1?.endBinding?.elementId).toBe('shape-n2');
  });

  it('exports a valid SVG document from the Excalidraw scene', () => {
    const scene = renderDiagramToExcalidrawScene(SAMPLE_DIAGRAM_SPEC);
    const svg = exportSceneToSvgString(scene, SAMPLE_DIAGRAM_SPEC.title);

    expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('<title>How Baseline Helps Ship Less JavaScript</title>');
    expect(svg).toContain('<polygon');
    expect(svg).toContain('<rect');
    expect(svg).toContain('Identify a JavaScript');
  });

  it('renders the Full-Page Editor with .excalidraw, SVG, and PNG export controls', async () => {
    const settings = await loadUserSettings();
    await saveUserSettings({ ...settings, onboardingCompleted: true });

    render(<EditorApp />);

    expect(
      await screen.findByRole('button', { name: /Export \.excalidraw/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Export SVG/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Export PNG/i })
    ).toBeInTheDocument();
    expect(
      screen.queryByPlaceholderText(/Add shape label/i)
    ).not.toBeInTheDocument();
  });
});
