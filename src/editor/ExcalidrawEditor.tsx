import React, { useEffect, useMemo, useRef } from 'react';
import {
  convertToExcalidrawElements,
  Excalidraw,
} from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';
import { calculateDiagramLayout, wrapNodeLabelText } from '@/core/diagrams/layout';
import { NODE_VISUAL_CONVENTIONS } from '@/core/diagrams/renderer';
import type {
  DiagramSpec,
  ExcalidrawElementStub,
  ExcalidrawSceneData,
} from '@/shared/types';

export interface ExcalidrawEditorProps {
  spec: DiagramSpec;
  scene: ExcalidrawSceneData;
  viewMode: 'canvas' | 'outline';
  fitRequest: number;
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string | null) => void;
  onUpdateNodeLabel: (nodeId: string, newLabel: string) => void;
  onDeleteNode: (nodeId: string) => void;
  onSceneElementsChange?: (elements: ExcalidrawElementStub[]) => void;
}

function isJsdomEnvironment(): boolean {
  return (
    typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent || '')
  );
}

export function buildExcalidrawElementsFromSpec(spec: DiagramSpec) {
  const positionedNodes = calculateDiagramLayout(spec);
  const nodeMap = new Map(positionedNodes.map((n) => [n.id, n]));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const skeletons: any[] = [];

  for (const node of positionedNodes) {
    const visual = NODE_VISUAL_CONVENTIONS[node.kind];
    const wrappedLabel = wrapNodeLabelText(node.label);

    skeletons.push({
      id: `shape-${node.id}`,
      type: visual.shape,
      x: node.x,
      y: node.y,
      width: node.width,
      height: node.height,
      strokeColor: visual.strokeColor,
      backgroundColor: visual.backgroundColor,
      fillStyle: 'solid',
      strokeWidth: node.emphasis === 'high' ? 3 : 2,
      roundness: visual.rounded ? { type: 3 } : null,
      label: {
        text: wrappedLabel,
        fontSize: 16,
        strokeColor: '#0f172a',
        textAlign: 'center',
        verticalAlign: 'middle',
      },
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

    skeletons.push({
      id: `arrow-${edge.id}`,
      type: 'arrow',
      x: Math.round(startX),
      y: Math.round(startY),
      width: Math.abs(dx),
      height: Math.abs(dy),
      points: [
        [0, 0],
        [dx, dy],
      ],
      strokeColor: '#334155',
      strokeWidth: 2,
      endArrowhead: 'arrow',
      start: { id: `shape-${edge.from}` },
      end: { id: `shape-${edge.to}` },
      ...(edge.label
        ? {
            label: {
              text: edge.label,
              fontSize: 14,
              strokeColor: '#1e293b',
            },
          }
        : {}),
      customData: {
        edgeId: edge.id,
      },
    });
  }

  return convertToExcalidrawElements(skeletons, { regenerateIds: false });
}

export const ExcalidrawEditor: React.FC<ExcalidrawEditorProps> = ({
  spec,
  scene,
  viewMode,
  fitRequest,
  selectedNodeId,
  onSelectNode,
  onUpdateNodeLabel,
  onDeleteNode,
  onSceneElementsChange,
}) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const excalidrawApiRef = useRef<any>(null);

  const sceneSignature = useMemo(
    () =>
      `${spec.id}:${spec.type}:${spec.nodes.length}:${spec.edges.length}:${spec.nodes
        .map((n) => `${n.id}:${n.kind}:${n.label}`)
        .join('|')}`,
    [spec]
  );

  const excalidrawElements = useMemo(() => {
    try {
      return buildExcalidrawElementsFromSpec(spec);
    } catch {
      return scene.elements;
    }
  }, [spec, scene.elements]);

  const applyElementsToCanvas = (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    api: any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    elementsToApply: any
  ) => {
    if (!api) return;
    try {
      api.updateScene({
        elements: elementsToApply,
      });
      api.scrollToContent(elementsToApply, {
        fitToViewport: true,
        viewportZoomFactor: 0.85,
        animate: false,
      });
    } catch {
      // Ignore if canvas is not ready yet
    }
  };

  useEffect(() => {
    if (!excalidrawApiRef.current) return;
    applyElementsToCanvas(excalidrawApiRef.current, excalidrawElements);
    const timer = setTimeout(() => {
      applyElementsToCanvas(excalidrawApiRef.current, excalidrawElements);
    }, 120);
    return () => clearTimeout(timer);
  }, [excalidrawElements, sceneSignature]);

  const handleFitToContent = () => {
    if (!excalidrawApiRef.current) return;
    try {
      const currentEls =
        excalidrawApiRef.current.getSceneElements?.() ?? excalidrawElements;
      excalidrawApiRef.current.scrollToContent(currentEls, {
        fitToViewport: true,
        viewportZoomFactor: 0.85,
        animate: true,
      });
    } catch {
      // Ignore
    }
  };

  useEffect(() => {
    if (fitRequest > 0) handleFitToContent();
  }, [fitRequest]);

  const selectedNode = useMemo(
    () => spec.nodes.find((n) => n.id === selectedNodeId) ?? null,
    [spec.nodes, selectedNodeId]
  );

  return (
    <div className="flex h-full flex-col">
      {/* Selected Node Inspector Bar */}
      {selectedNode && viewMode === 'canvas' && (
        <div className="flex items-center justify-between gap-3 border-b border-brand-100 bg-brand-50/70 px-4 py-1.5 text-xs dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-2 flex-1">
            <span className="font-bold uppercase text-brand-700 dark:text-brand-100">
              Selected [{selectedNode.id}] ({selectedNode.kind}):
            </span>
            <input
              type="text"
              aria-label={`Edit label for ${selectedNode.id}`}
              value={selectedNode.label}
              onChange={(e) =>
                onUpdateNodeLabel(selectedNode.id, e.target.value)
              }
              className="flex-1 max-w-md rounded border border-slate-300 bg-white px-2 py-0.5 text-xs font-medium text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onDeleteNode(selectedNode.id)}
              className="rounded bg-rose-600 px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-rose-700"
            >
              Delete Node
            </button>
            <button
              type="button"
              onClick={() => onSelectNode(null)}
              className="text-[11px] text-slate-500 hover:underline"
            >
              Clear Selection
            </button>
          </div>
        </div>
      )}

      {viewMode === 'outline' ? (
        <section
          aria-label="Textual outline of diagram nodes and relationships"
          className="flex-1 overflow-y-auto p-6 space-y-4 bg-white dark:bg-slate-950"
        >
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
              {spec.title} — Textual Outline
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              {spec.summary}
            </p>
          </div>

          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Nodes ({spec.nodes.length})
            </h3>
            <ul className="space-y-2">
              {spec.nodes.map((node) => (
                <li
                  key={node.id}
                  onClick={() => onSelectNode(node.id)}
                  className="cursor-pointer rounded-lg border border-slate-200 p-3 text-xs hover:border-brand-500 dark:border-slate-800"
                >
                  <div className="font-semibold text-slate-900 dark:text-slate-100">
                    [{node.id}] ({node.kind.toUpperCase()}) {node.label}
                  </div>
                  {node.description && (
                    <p className="mt-1 text-slate-600 dark:text-slate-400">
                      {node.description}
                    </p>
                  )}
                  <div className="mt-1 text-[11px] text-slate-500">
                    Source sections:{' '}
                    {node.sourceSectionIds.join(', ') || 'None'}
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Relationships ({spec.edges.length})
            </h3>
            <ul className="space-y-1 text-xs text-slate-700 dark:text-slate-300">
              {spec.edges.map((edge) => (
                <li key={edge.id}>
                  <strong>{edge.from}</strong> → <strong>{edge.to}</strong>
                  {edge.label ? ` (${edge.label})` : ''}
                  {edge.relationship ? ` [${edge.relationship}]` : ''}
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : isJsdomEnvironment() ? (
        <div
          data-testid="excalidraw-canvas-host"
          className="relative flex-1 overflow-auto p-6"
        >
          <div className="mb-3 text-xs text-slate-500">
            Excalidraw Scene Ready ({scene.elements.length} elements)
          </div>
          <div className="grid grid-cols-2 gap-3">
            {spec.nodes.map((node) => {
              const visual = NODE_VISUAL_CONVENTIONS[node.kind];
              return (
                <div
                  key={node.id}
                  onClick={() => onSelectNode(node.id)}
                  style={{
                    borderColor: visual.strokeColor,
                    backgroundColor: visual.backgroundColor,
                  }}
                  className="cursor-pointer rounded-lg border-2 p-3 text-xs text-slate-900"
                >
                  <div className="font-bold">
                    [{node.id}] {visual.badgeLabel}
                  </div>
                  <div>{node.label}</div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div
          data-testid="excalidraw-canvas-host"
          className="relative flex-1 w-full overflow-hidden"
          style={{ minHeight: '520px' }}
        >
          <div className="absolute inset-0">
            <Excalidraw
              key={spec.id}
              excalidrawAPI={(api) => {
                excalidrawApiRef.current = api;
                applyElementsToCanvas(api, excalidrawElements);
                setTimeout(() => {
                  applyElementsToCanvas(api, excalidrawElements);
                }, 150);
              }}
              initialData={{
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                elements: excalidrawElements as any,
                appState: {
                  viewBackgroundColor:
                    scene.appState.viewBackgroundColor || '#ffffff',
                },
                scrollToContent: true,
              }}
              onChange={(elements, appState) => {
                if (onSceneElementsChange && elements.length > 0) {
                  onSceneElementsChange(
                    elements as unknown as ExcalidrawElementStub[]
                  );
                }
                const selectedIds = Object.keys(
                  appState.selectedElementIds ?? {}
                ).filter((id) => appState.selectedElementIds[id]);
                if (selectedIds.length === 1) {
                  const el = elements.find((item) => item.id === selectedIds[0]);
                  const nodeId = (
                    el?.customData as { nodeId?: string } | undefined
                  )?.nodeId;
                  if (nodeId && nodeId !== selectedNodeId) {
                    onSelectNode(nodeId);
                  }
                }
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
};
