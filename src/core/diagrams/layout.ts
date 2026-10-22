import dagre from '@dagrejs/dagre';
import type { DiagramNode, DiagramSpec, PositionedNode } from '@/shared/types';

const MIN_NODE_WIDTH = 240;
const MIN_NODE_HEIGHT = 88;
const MAX_LINE_CHARS = 26;

export function wrapNodeLabelText(label: string, maxCharsPerLine = MAX_LINE_CHARS): string {
  const words = label.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '';

  const lines: string[] = [];
  let currentLine = words[0];

  for (let i = 1; i < words.length; i++) {
    const candidate = `${currentLine} ${words[i]}`;
    if (candidate.length <= maxCharsPerLine) {
      currentLine = candidate;
    } else {
      lines.push(currentLine);
      currentLine = words[i];
    }
  }
  lines.push(currentLine);
  return lines.join('\n');
}

export function measureNodeDimensions(node: DiagramNode): {
  width: number;
  height: number;
} {
  const wrapped = wrapNodeLabelText(node.label);
  const lines = wrapped.split('\n');
  const longestLine = Math.max(...lines.map((l) => l.length), 12);

  const isDiamond = node.kind === 'decision';
  const baseWidth = Math.max(MIN_NODE_WIDTH, longestLine * 9 + 48);
  const baseHeight = Math.max(MIN_NODE_HEIGHT, lines.length * 24 + 44);

  return {
    width: isDiamond ? Math.round(baseWidth * 1.25) : baseWidth,
    height: isDiamond ? Math.round(baseHeight * 1.3) : baseHeight,
  };
}

export function calculateDiagramLayout(spec: DiagramSpec): PositionedNode[] {
  if (spec.nodes.length === 0) return [];

  if (spec.type === 'infographic') {
    return layoutInfographic(spec);
  }
  if (spec.type === 'mindmap') {
    return layoutMindmap(spec);
  }
  if (spec.type === 'concept_map') {
    return layoutWithDagre(spec, 'LR', 90, 140);
  }
  return layoutWithDagre(spec, 'TB', 80, 110);
}

function layoutInfographic(spec: DiagramSpec): PositionedNode[] {
  const nodes = spec.nodes;
  if (nodes.length === 0) return [];

  const centerX = 520;
  const bannerWidth = 640;
  const cardWidth = 300;
  const colGap = 40;
  const rowGap = 64;

  const result: PositionedNode[] = [];
  const hero = nodes[0];
  const heroDims = measureNodeDimensions(hero);
  const heroHeight = Math.max(96, heroDims.height);

  result.push({
    ...hero,
    x: Math.round(centerX - bannerWidth / 2),
    y: 60,
    width: bannerWidth,
    height: heroHeight,
  });

  if (nodes.length === 1) {
    return result;
  }

  const hasFooterBanner = nodes.length >= 4;
  const middleNodes = hasFooterBanner ? nodes.slice(1, -1) : nodes.slice(1);
  const footerNode = hasFooterBanner ? nodes[nodes.length - 1] : null;

  const cols = 2;
  let currentY = 60 + heroHeight + rowGap;

  for (let i = 0; i < middleNodes.length; i += cols) {
    const rowSlice = middleNodes.slice(i, i + cols);
    const rowHeights = rowSlice.map((n) =>
      Math.max(104, measureNodeDimensions(n).height)
    );
    const maxRowHeight = Math.max(...rowHeights, 104);

    if (rowSlice.length === 1) {
      result.push({
        ...rowSlice[0],
        x: Math.round(centerX - cardWidth / 2),
        y: currentY,
        width: cardWidth,
        height: maxRowHeight,
      });
    } else {
      const totalRowWidth = cols * cardWidth + (cols - 1) * colGap;
      const startX = Math.round(centerX - totalRowWidth / 2);
      rowSlice.forEach((node, colIdx) => {
        result.push({
          ...node,
          x: startX + colIdx * (cardWidth + colGap),
          y: currentY,
          width: cardWidth,
          height: maxRowHeight,
        });
      });
    }

    currentY += maxRowHeight + rowGap;
  }

  if (footerNode) {
    const footerDims = measureNodeDimensions(footerNode);
    const footerHeight = Math.max(96, footerDims.height);
    result.push({
      ...footerNode,
      x: Math.round(centerX - bannerWidth / 2),
      y: currentY,
      width: bannerWidth,
      height: footerHeight,
    });
  }

  return result;
}

function layoutWithDagre(
  spec: DiagramSpec,
  rankdir: 'TB' | 'LR',
  nodesep: number,
  ranksep: number
): PositionedNode[] {
  const g = new dagre.graphlib.Graph();
  g.setGraph({
    rankdir,
    nodesep,
    ranksep,
    marginx: 80,
    marginy: 80,
  });
  g.setDefaultEdgeLabel(() => ({}));

  const dimensionsMap = new Map<string, { width: number; height: number }>();

  for (const node of spec.nodes) {
    const dims = measureNodeDimensions(node);
    dimensionsMap.set(node.id, dims);
    g.setNode(node.id, { width: dims.width, height: dims.height });
  }

  for (const edge of spec.edges) {
    if (dimensionsMap.has(edge.from) && dimensionsMap.has(edge.to)) {
      g.setEdge(edge.from, edge.to);
    }
  }

  dagre.layout(g);

  return spec.nodes.map((node, idx) => {
    const layoutNode = g.node(node.id);
    const dims = dimensionsMap.get(node.id) ?? {
      width: MIN_NODE_WIDTH,
      height: MIN_NODE_HEIGHT,
    };

    const centerX =
      layoutNode && Number.isFinite(layoutNode.x)
        ? layoutNode.x
        : 360 + (idx % 3) * 300;
    const centerY =
      layoutNode && Number.isFinite(layoutNode.y)
        ? layoutNode.y
        : 120 + Math.floor(idx / 3) * 160;

    return {
      ...node,
      x: Math.round(centerX - dims.width / 2),
      y: Math.round(centerY - dims.height / 2),
      width: dims.width,
      height: dims.height,
    };
  });
}

function layoutMindmap(spec: DiagramSpec): PositionedNode[] {
  const [root, ...branches] = spec.nodes;
  if (!root) return [];

  const rootDims = measureNodeDimensions(root);
  const centerX = 520;
  const centerY = 360;
  const radiusX = Math.max(360, branches.length * 55);
  const radiusY = Math.max(250, branches.length * 40);

  const result: PositionedNode[] = [
    {
      ...root,
      x: Math.round(centerX - rootDims.width / 2),
      y: Math.round(centerY - rootDims.height / 2),
      width: rootDims.width,
      height: rootDims.height,
    },
  ];

  branches.forEach((node, index) => {
    const dims = measureNodeDimensions(node);
    const angle = (2 * Math.PI * index) / Math.max(1, branches.length) - Math.PI / 2;
    const nodeCenterX = centerX + Math.cos(angle) * radiusX;
    const nodeCenterY = centerY + Math.sin(angle) * radiusY;

    result.push({
      ...node,
      x: Math.round(nodeCenterX - dims.width / 2),
      y: Math.round(nodeCenterY - dims.height / 2),
      width: dims.width,
      height: dims.height,
    });
  });

  return result;
}
