import type {
  DiagramCheckpoint,
  DiagramPatch,
  DiagramPatchOperation,
  DiagramSpec,
  DiagramType,
  SavedDiagram,
} from '@/shared/types';
import type { DiagramRefinementRequest } from '@/core/ai/types';
import { renderDiagramToExcalidrawScene } from './renderer';
import { validateDiagramPatch, validateDiagramSpec } from './schema';

export class DiagramPatchConflictError extends Error {
  readonly baseVersion: number;
  readonly currentVersion: number;

  constructor(baseVersion: number, currentVersion: number) {
    super(
      `Diagram version conflict: patch targets v${baseVersion}, but diagram is currently at v${currentVersion}.`
    );
    this.name = 'DiagramPatchConflictError';
    this.baseVersion = baseVersion;
    this.currentVersion = currentVersion;
  }
}

export function applyDiagramPatch(
  spec: DiagramSpec,
  rawPatch: DiagramPatch,
  expectedVersion?: number
): DiagramSpec {
  const patch = validateDiagramPatch(rawPatch);
  if (patch.baseDiagramId !== spec.id) {
    throw new Error(
      `Patch baseDiagramId "${patch.baseDiagramId}" does not match diagram "${spec.id}"`
    );
  }

  if (expectedVersion !== undefined && patch.baseVersion !== expectedVersion) {
    throw new DiagramPatchConflictError(patch.baseVersion, expectedVersion);
  }

  let nodes = [...spec.nodes];
  let edges = [...spec.edges];

  for (const op of patch.operations) {
    switch (op.type) {
      case 'add_node': {
        if (!nodes.some((n) => n.id === op.node.id)) {
          nodes.push(op.node);
        }
        break;
      }
      case 'update_node': {
        nodes = nodes.map((node) =>
          node.id === op.id ? { ...node, ...op.changes, id: node.id } : node
        );
        break;
      }
      case 'remove_node': {
        if (nodes.length > 1) {
          nodes = nodes.filter((node) => node.id !== op.id);
          edges = edges.filter(
            (edge) => edge.from !== op.id && edge.to !== op.id
          );
        }
        break;
      }
      case 'add_edge': {
        if (
          nodes.some((n) => n.id === op.edge.from) &&
          nodes.some((n) => n.id === op.edge.to)
        ) {
          edges.push(op.edge);
        }
        break;
      }
      case 'remove_edge': {
        edges = edges.filter((edge) => edge.id !== op.id);
        break;
      }
    }
  }

  return validateDiagramSpec({
    ...spec,
    nodes,
    edges,
  });
}

export function createDiagramCheckpoint(
  diagram: SavedDiagram,
  reason: string
): DiagramCheckpoint {
  return {
    version: diagram.version,
    createdAt: new Date().toISOString(),
    reason,
    spec: structuredClone(diagram.spec),
    scene: structuredClone(diagram.scene),
    hasManualEdits: Boolean(diagram.hasManualEdits),
  };
}

function inferStyleChangeFromInstruction(
  instruction: string
): DiagramType | null {
  const lower = instruction.toLowerCase();
  if (lower.includes('infographic') || lower.includes('info graphic')) {
    return 'infographic';
  }
  if (lower.includes('mind map') || lower.includes('mindmap')) {
    return 'mindmap';
  }
  if (lower.includes('concept map') || lower.includes('concept_map')) {
    return 'concept_map';
  }
  if (lower.includes('flowchart') || lower.includes('flow chart')) {
    return 'flowchart';
  }
  return null;
}

export function applyPatchToSavedDiagram(params: {
  diagram: SavedDiagram;
  patch: DiagramPatch;
  instruction: string;
}): SavedDiagram {
  const { diagram, patch, instruction } = params;
  const checkpoint = createDiagramCheckpoint(
    diagram,
    `Before AI refinement: "${instruction.slice(0, 60)}"`
  );

  let updatedSpec = applyDiagramPatch(diagram.spec, patch, diagram.version);
  const requestedStyle = inferStyleChangeFromInstruction(instruction);
  if (requestedStyle) {
    updatedSpec = {
      ...updatedSpec,
      type: requestedStyle,
    };
  }

  const survivingIds = new Set(updatedSpec.nodes.map((n) => n.id));
  const preservedManualPositions: Record<string, { x: number; y: number }> = {};

  if (diagram.manualNodePositions) {
    for (const [nodeId, pos] of Object.entries(diagram.manualNodePositions)) {
      if (survivingIds.has(nodeId)) {
        preservedManualPositions[nodeId] = pos;
      }
    }
  }

  const nextVersion = diagram.version + 1;
  const nextScene = renderDiagramToExcalidrawScene(
    updatedSpec,
    requestedStyle ? undefined : preservedManualPositions
  );

  const historyEntry = {
    id: `ref-${Date.now()}`,
    instruction,
    appliedAt: new Date().toISOString(),
    fromVersion: diagram.version,
    toVersion: nextVersion,
    operationsCount: patch.operations.length,
  };

  return {
    ...diagram,
    title: updatedSpec.title,
    diagramType: updatedSpec.type,
    spec: updatedSpec,
    scene: nextScene,
    manualNodePositions: requestedStyle ? {} : preservedManualPositions,
    checkpoints: [checkpoint, ...(diagram.checkpoints ?? [])].slice(0, 15),
    refinementHistory: [historyEntry, ...(diagram.refinementHistory ?? [])],
    updatedAt: new Date().toISOString(),
    version: nextVersion,
  };
}

export function buildHeuristicRefinementPatch(
  request: DiagramRefinementRequest
): DiagramPatch {
  const lower = request.instruction.toLowerCase();
  const nodes = request.currentDiagram.nodes;
  const edges = request.currentDiagram.edges;
  const targetId =
    request.selectedNodeIds?.[0] ??
    nodes[nodes.length - 1]?.id ??
    nodes[0]?.id;
  const anchorNode = nodes.find((n) => n.id === targetId) ?? nodes[0];
  const operations: DiagramPatchOperation[] = [];

  if (lower.includes('simply') || lower.includes('simplify')) {
    nodes.forEach((node) => {
      const simplifiedLabel =
        node.label.length > 44
          ? `${node.label.split(/[,:;—-]/)[0].trim().slice(0, 44)}`
          : node.label;
      operations.push({
        type: 'update_node',
        id: node.id,
        changes: {
          label: simplifiedLabel,
          description: `Simplified: ${node.description ?? node.label}`,
        },
      });
    });
  } else if (lower.includes('highlight') || lower.includes('important')) {
    nodes.forEach((node, idx) => {
      if (
        idx === 0 ||
        node.kind === 'decision' ||
        node.kind === 'outcome' ||
        node.id === targetId
      ) {
        operations.push({
          type: 'update_node',
          id: node.id,
          changes: { emphasis: 'high' },
        });
      }
    });
  } else if (lower.includes('remove') || lower.includes('unnecessary')) {
    const removable =
      [...nodes]
        .reverse()
        .find((n) => n.kind === 'example' || n.emphasis !== 'high') ??
      nodes[nodes.length - 1];
    if (removable && nodes.length > 2) {
      operations.push({
        type: 'remove_node',
        id: removable.id,
      });
    } else if (anchorNode) {
      operations.push({
        type: 'update_node',
        id: anchorNode.id,
        changes: { description: undefined },
      });
    }
  } else if (lower.includes('connection') || lower.includes('connect')) {
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (first && last && first.id !== last.id) {
      operations.push({
        type: 'add_edge',
        edge: {
          id: `e-conn-${Date.now()}`,
          from: first.id,
          to: last.id,
          label: 'Direct link',
          relationship: 'depends_on',
        },
      });
    }
  } else if (lower.includes('expand')) {
    const subId = `n${nodes.length + 1}`;
    operations.push({
      type: 'add_node',
      node: {
        id: subId,
        kind: 'concept',
        label: `Expanded detail for ${anchorNode?.label.slice(0, 36) ?? 'concept'}`,
        description: `Elaboration triggered by: "${request.instruction}"`,
        sourceSectionIds: anchorNode?.sourceSectionIds ?? ['s1'],
        emphasis: 'high',
      },
    });
    if (anchorNode) {
      operations.push({
        type: 'add_edge',
        edge: {
          id: `e-${edges.length + 1}-${Date.now()}`,
          from: anchorNode.id,
          to: subId,
          label: 'Elaborates',
          relationship: 'explains',
        },
      });
    }
  } else {
    // Default / "Add practical examples" / custom follow-up
    const newNodeId = `n${nodes.length + 1}`;
    const cleanLabel = request.instruction
      .replace(/^add\s+(an?\s+)?(practical\s+)?(example\s+(showing\s+)?)?/i, '')
      .trim();
    const finalLabel =
      cleanLabel.length > 4
        ? `Example: ${cleanLabel.slice(0, 62)}`
        : 'Practical example: Native browser API replacement';

    operations.push({
      type: 'add_node',
      node: {
        id: newNodeId,
        kind: 'example',
        label: finalLabel,
        description: `Added from refinement instruction: "${request.instruction}"`,
        sourceSectionIds: anchorNode?.sourceSectionIds ?? ['s1'],
        emphasis: 'high',
      },
    });
    if (anchorNode) {
      operations.push({
        type: 'add_edge',
        edge: {
          id: `e-${edges.length + 1}-${Date.now()}`,
          from: anchorNode.id,
          to: newNodeId,
          label: 'Example',
          relationship: 'explains',
        },
      });
    }
  }

  return validateDiagramPatch({
    baseDiagramId: request.currentDiagram.id,
    baseVersion: request.currentVersion,
    operations,
  });
}
