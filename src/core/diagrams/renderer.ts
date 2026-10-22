import type {
  DiagramNodeKind,
  DiagramSpec,
  ExcalidrawBoundElementRef,
  ExcalidrawElementStub,
  ExcalidrawSceneData,
} from '@/shared/types';
import { calculateDiagramLayout, wrapNodeLabelText } from './layout';

export interface NodeVisualStyle {
  shape: 'rectangle' | 'diamond';
  rounded: boolean;
  strokeColor: string;
  backgroundColor: string;
  badgeLabel: string;
}

export const NODE_VISUAL_CONVENTIONS: Record<DiagramNodeKind, NodeVisualStyle> = {
  concept: {
    shape: 'rectangle',
    rounded: true,
    strokeColor: '#1d4ed8',
    backgroundColor: '#dbeafe',
    badgeLabel: 'Concept',
  },
  process: {
    shape: 'rectangle',
    rounded: false,
    strokeColor: '#6d28d9',
    backgroundColor: '#ede9fe',
    badgeLabel: 'Process',
  },
  decision: {
    shape: 'diamond',
    rounded: false,
    strokeColor: '#b45309',
    backgroundColor: '#fef3c7',
    badgeLabel: 'Decision',
  },
  example: {
    shape: 'rectangle',
    rounded: true,
    strokeColor: '#475569',
    backgroundColor: '#f1f5f9',
    badgeLabel: 'Example',
  },
  outcome: {
    shape: 'rectangle',
    rounded: true,
    strokeColor: '#047857',
    backgroundColor: '#d1fae5',
    badgeLabel: 'Outcome',
  },
};

function deterministicSeed(id: string): number {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return (hash % 2000000000) + 1;
}

function createBaseElementFields(id: string): Pick<
  ExcalidrawElementStub,
  | 'angle'
  | 'fillStyle'
  | 'strokeWidth'
  | 'strokeStyle'
  | 'roughness'
  | 'opacity'
  | 'groupIds'
  | 'frameId'
  | 'seed'
  | 'version'
  | 'versionNonce'
  | 'isDeleted'
  | 'updated'
  | 'link'
  | 'locked'
> {
  const seed = deterministicSeed(id);
  return {
    angle: 0,
    fillStyle: 'solid',
    strokeWidth: 2,
    strokeStyle: 'solid',
    roughness: 1,
    opacity: 100,
    groupIds: [],
    frameId: null,
    seed,
    version: 1,
    versionNonce: seed ^ 0x5a5a5a5a,
    isDeleted: false,
    updated: 1729555200000,
    link: null,
    locked: false,
  };
}

export function renderDiagramToExcalidrawScene(
  spec: DiagramSpec,
  manualNodePositions?: Record<string, { x: number; y: number }>
): ExcalidrawSceneData {
  const positionedNodes = calculateDiagramLayout(spec).map((node) => {
    const manual = manualNodePositions?.[node.id];
    return manual ? { ...node, x: manual.x, y: manual.y } : node;
  });
  const nodeMap = new Map(positionedNodes.map((n) => [n.id, n]));
  const boundMap = new Map<string, ExcalidrawBoundElementRef[]>();

  for (const node of positionedNodes) {
    boundMap.set(`shape-${node.id}`, [
      { id: `text-${node.id}`, type: 'text' },
    ]);
  }

  for (const edge of spec.edges) {
    if (!nodeMap.has(edge.from) || !nodeMap.has(edge.to)) continue;
    const arrowId = `arrow-${edge.id}`;
    boundMap.get(`shape-${edge.from}`)?.push({ id: arrowId, type: 'arrow' });
    boundMap.get(`shape-${edge.to}`)?.push({ id: arrowId, type: 'arrow' });
  }

  const elements: ExcalidrawElementStub[] = [];

  for (const node of positionedNodes) {
    const visual = NODE_VISUAL_CONVENTIONS[node.kind];
    const shapeId = `shape-${node.id}`;
    const textId = `text-${node.id}`;
    const wrappedLabel = wrapNodeLabelText(node.label);
    const lines = wrappedLabel.split('\n');
    const textHeight = Math.max(24, lines.length * 22);
    const textWidth = Math.max(120, node.width - 36);

    elements.push({
      ...createBaseElementFields(shapeId),
      id: shapeId,
      type: visual.shape,
      x: node.x,
      y: node.y,
      width: node.width,
      height: node.height,
      strokeColor: visual.strokeColor,
      backgroundColor: visual.backgroundColor,
      strokeWidth: node.emphasis === 'high' ? 3 : 2,
      roundness: visual.rounded ? { type: 3 } : null,
      boundElements: boundMap.get(shapeId) ?? [],
      text: node.label,
      customData: {
        nodeId: node.id,
        kind: node.kind,
        sourceSectionIds: node.sourceSectionIds,
      },
    });

    elements.push({
      ...createBaseElementFields(textId),
      id: textId,
      type: 'text',
      x: Math.round(node.x + (node.width - textWidth) / 2),
      y: Math.round(node.y + (node.height - textHeight) / 2),
      width: textWidth,
      height: textHeight,
      strokeColor: '#0f172a',
      backgroundColor: 'transparent',
      roundness: null,
      boundElements: null,
      text: wrappedLabel,
      originalText: wrappedLabel,
      fontSize: 16,
      fontFamily: 1,
      textAlign: 'center',
      verticalAlign: 'middle',
      containerId: shapeId,
      autoResize: true,
      lineHeight: 1.25,
      customData: {
        nodeId: node.id,
        kind: node.kind,
        sourceSectionIds: node.sourceSectionIds,
      },
    });
  }

  for (const edge of spec.edges) {
    const fromNode = nodeMap.get(edge.from);
    const toNode = nodeMap.get(edge.to);
    if (!fromNode || !toNode) continue;

    const arrowId = `arrow-${edge.id}`;
    const labelTextId = `edge-label-${edge.id}`;
    const fromCenterX = fromNode.x + fromNode.width / 2;
    const fromCenterY = fromNode.y + fromNode.height / 2;
    const toCenterX = toNode.x + toNode.width / 2;
    const toCenterY = toNode.y + toNode.height / 2;

    const isHorizontalDominant =
      Math.abs(toCenterX - fromCenterX) > Math.abs(toCenterY - fromCenterY) * 1.4;

    const startX = isHorizontalDominant
      ? toCenterX >= fromCenterX
        ? fromNode.x + fromNode.width
        : fromNode.x
      : fromCenterX;
    const startY = isHorizontalDominant
      ? fromCenterY
      : toCenterY >= fromCenterY
        ? fromNode.y + fromNode.height
        : fromNode.y;

    const endX = isHorizontalDominant
      ? toCenterX >= fromCenterX
        ? toNode.x
        : toNode.x + toNode.width
      : toCenterX;
    const endY = isHorizontalDominant
      ? toCenterY
      : toCenterY >= fromCenterY
        ? toNode.y
        : toNode.y + toNode.height;

    const dx = Math.round(endX - startX);
    const dy = Math.round(endY - startY);

    const arrowBound: ExcalidrawBoundElementRef[] = edge.label
      ? [{ id: labelTextId, type: 'text' }]
      : [];

    elements.push({
      ...createBaseElementFields(arrowId),
      id: arrowId,
      type: 'arrow',
      x: Math.round(startX),
      y: Math.round(startY),
      width: Math.abs(dx),
      height: Math.abs(dy),
      strokeColor: '#334155',
      backgroundColor: 'transparent',
      roundness: { type: 2 },
      boundElements: arrowBound,
      points: [
        [0, 0],
        [dx, dy],
      ],
      lastCommittedPoint: null,
      startBinding: {
        elementId: `shape-${edge.from}`,
        focus: 0,
        gap: 6,
      },
      endBinding: {
        elementId: `shape-${edge.to}`,
        focus: 0,
        gap: 6,
      },
      startArrowhead: null,
      endArrowhead: 'arrow',
      elbowed: false,
      text: edge.label,
      customData: {
        edgeId: edge.id,
      },
    });

    if (edge.label) {
      const labelWidth = Math.max(48, edge.label.length * 8 + 16);
      const labelHeight = 22;
      elements.push({
        ...createBaseElementFields(labelTextId),
        id: labelTextId,
        type: 'text',
        x: Math.round(startX + dx / 2 - labelWidth / 2),
        y: Math.round(startY + dy / 2 - labelHeight / 2),
        width: labelWidth,
        height: labelHeight,
        strokeColor: '#1e293b',
        backgroundColor: '#ffffff',
        roundness: null,
        boundElements: null,
        text: edge.label,
        originalText: edge.label,
        fontSize: 14,
        fontFamily: 1,
        textAlign: 'center',
        verticalAlign: 'middle',
        containerId: arrowId,
        autoResize: true,
        lineHeight: 1.25,
        customData: {
          edgeId: edge.id,
        },
      });
    }
  }

  return {
    type: 'excalidraw',
    version: 2,
    source: 'https://visualisepage.local',
    elements,
    appState: {
      viewBackgroundColor: '#ffffff',
      gridSize: 20,
    },
    files: {},
  };
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function exportSceneToSvgString(
  scene: ExcalidrawSceneData,
  title = 'Visualise Page Diagram'
): string {
  const activeElements = scene.elements.filter((el) => !el.isDeleted);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const el of activeElements) {
    if (el.type === 'arrow' && el.points && el.points.length >= 2) {
      for (const [px, py] of el.points) {
        minX = Math.min(minX, el.x + px);
        minY = Math.min(minY, el.y + py);
        maxX = Math.max(maxX, el.x + px);
        maxY = Math.max(maxY, el.y + py);
      }
    } else {
      minX = Math.min(minX, el.x);
      minY = Math.min(minY, el.y);
      maxX = Math.max(maxX, el.x + el.width);
      maxY = Math.max(maxY, el.y + el.height);
    }
  }

  if (!Number.isFinite(minX)) {
    minX = 0;
    minY = 0;
    maxX = 800;
    maxY = 600;
  }

  const padding = 48;
  const viewX = Math.floor(minX - padding);
  const viewY = Math.floor(minY - padding);
  const viewWidth = Math.max(400, Math.ceil(maxX - minX + padding * 2));
  const viewHeight = Math.max(300, Math.ceil(maxY - minY + padding * 2));

  const bodyParts: string[] = [];

  for (const el of activeElements) {
    if (el.type === 'rectangle') {
      const rx = el.roundness ? 14 : 4;
      bodyParts.push(
        `<rect x="${el.x}" y="${el.y}" width="${el.width}" height="${el.height}" rx="${rx}" fill="${el.backgroundColor}" stroke="${el.strokeColor}" stroke-width="${el.strokeWidth}" />`
      );
    } else if (el.type === 'diamond') {
      const cx = el.x + el.width / 2;
      const cy = el.y + el.height / 2;
      const pts = `${cx},${el.y} ${el.x + el.width},${cy} ${cx},${el.y + el.height} ${el.x},${cy}`;
      bodyParts.push(
        `<polygon points="${pts}" fill="${el.backgroundColor}" stroke="${el.strokeColor}" stroke-width="${el.strokeWidth}" />`
      );
    } else if (el.type === 'arrow' && el.points && el.points.length >= 2) {
      const [p0, p1] = el.points;
      const x1 = el.x + p0[0];
      const y1 = el.y + p0[1];
      const x2 = el.x + p1[0];
      const y2 = el.y + p1[1];
      bodyParts.push(
        `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${el.strokeColor}" stroke-width="${el.strokeWidth}" marker-end="url(#vp-arrow)" />`
      );
    } else if (el.type === 'text' && el.text) {
      const lines = el.text.split('\n');
      const cx = el.x + el.width / 2;
      const startTextY =
        el.y + el.height / 2 - ((lines.length - 1) * 18) / 2 + 5;
      lines.forEach((line, idx) => {
        bodyParts.push(
          `<text x="${cx}" y="${startTextY + idx * 18}" text-anchor="middle" font-family="sans-serif" font-size="${el.fontSize ?? 15}" fill="${el.strokeColor}">${escapeXml(line)}</text>`
        );
      });
    }
  }

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewX} ${viewY} ${viewWidth} ${viewHeight}" width="${viewWidth}" height="${viewHeight}">`,
    `  <title>${escapeXml(title)}</title>`,
    `  <defs>`,
    `    <marker id="vp-arrow" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">`,
    `      <polygon points="0 0, 10 3.5, 0 7" fill="#334155" />`,
    `    </marker>`,
    `  </defs>`,
    `  <rect x="${viewX}" y="${viewY}" width="${viewWidth}" height="${viewHeight}" fill="${scene.appState.viewBackgroundColor || '#ffffff'}" />`,
    ...bodyParts.map((p) => `  ${p}`),
    `</svg>`,
  ].join('\n');
}

