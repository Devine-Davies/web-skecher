export type DiagramType =
  | 'flowchart'
  | 'mindmap'
  | 'concept_map'
  | 'infographic';

export type ComplexityLevel = 'simple' | 'balanced' | 'detailed';

export type AIProviderId = 'openai' | 'copilot' | 'anthropic' | 'ollama' | 'custom';

export type OutputDestination = 'local_excalidraw' | 'remote_mcp';

export type ThemeMode = 'light' | 'dark' | 'system';

export type GenerationStageId =
  | 'reading_webpage'
  | 'identifying_concepts'
  | 'designing_diagram'
  | 'creating_elements'
  | 'opening_result';

export interface SourceSection {
  id: string;
  heading?: string;
  headingLevel?: number;
  text: string;
  type: 'paragraph' | 'heading' | 'list' | 'code' | 'table';
  anchor?: string;
}

export interface SourceDocument {
  id: string;
  url: string;
  title: string;
  siteName?: string;
  language?: string;
  extractedAt: string;
  contentHash: string;
  sections: SourceSection[];
  wordCount: number;
  selectedText?: string;
  hierarchicalSummarisationUsed?: boolean;
  originalWordCount?: number;
}

export type DiagramNodeKind =
  | 'concept'
  | 'process'
  | 'decision'
  | 'example'
  | 'outcome';

export interface DiagramNode {
  id: string;
  kind: DiagramNodeKind;
  label: string;
  description?: string;
  sourceSectionIds: string[];
  emphasis?: 'normal' | 'high';
}

export type DiagramEdgeRelationship =
  | 'sequence'
  | 'causes'
  | 'depends_on'
  | 'explains'
  | 'alternative';

export interface DiagramEdge {
  id: string;
  from: string;
  to: string;
  label?: string;
  relationship?: DiagramEdgeRelationship;
}

export interface DiagramSpec {
  schemaVersion: 1;
  id: string;
  title: string;
  type: DiagramType;
  summary: string;
  sourceDocumentId: string;
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  createdAt: string;
}

export type DiagramPatchOperation =
  | {
      type: 'add_node';
      node: DiagramNode;
    }
  | {
      type: 'update_node';
      id: string;
      changes: Partial<DiagramNode>;
    }
  | {
      type: 'remove_node';
      id: string;
    }
  | {
      type: 'add_edge';
      edge: DiagramEdge;
    }
  | {
      type: 'remove_edge';
      id: string;
    };

export interface DiagramPatch {
  baseDiagramId: string;
  baseVersion: number;
  operations: DiagramPatchOperation[];
}

export interface PositionedNode extends DiagramNode {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ExcalidrawBoundElementRef {
  id: string;
  type: 'arrow' | 'text';
}

export interface ExcalidrawPointBinding {
  elementId: string;
  focus: number;
  gap: number;
}

export interface ExcalidrawElementStub {
  id: string;
  type: 'rectangle' | 'diamond' | 'arrow' | 'text';
  x: number;
  y: number;
  width: number;
  height: number;
  angle: number;
  strokeColor: string;
  backgroundColor: string;
  fillStyle: 'solid' | 'hachure' | 'cross-hatch';
  strokeWidth: number;
  strokeStyle: 'solid' | 'dashed' | 'dotted';
  roughness: number;
  opacity: number;
  groupIds: string[];
  frameId: string | null;
  roundness: { type: number; value?: number } | null;
  seed: number;
  version: number;
  versionNonce: number;
  isDeleted: boolean;
  boundElements: ExcalidrawBoundElementRef[] | null;
  updated: number;
  link: string | null;
  locked: boolean;
  text?: string;
  fontSize?: number;
  fontFamily?: number;
  textAlign?: 'left' | 'center' | 'right';
  verticalAlign?: 'top' | 'middle' | 'bottom';
  containerId?: string | null;
  originalText?: string;
  autoResize?: boolean;
  lineHeight?: number;
  points?: Array<[number, number]>;
  lastCommittedPoint?: [number, number] | null;
  startBinding?: ExcalidrawPointBinding | null;
  endBinding?: ExcalidrawPointBinding | null;
  startArrowhead?: 'arrow' | null;
  endArrowhead?: 'arrow' | null;
  elbowed?: boolean;
  customData?: {
    nodeId?: string;
    edgeId?: string;
    kind?: DiagramNodeKind;
    sourceSectionIds?: string[];
  };
}

export interface ExcalidrawSceneData {
  type: 'excalidraw';
  version: number;
  source: string;
  elements: ExcalidrawElementStub[];
  appState: {
    viewBackgroundColor: string;
    gridSize: number | null;
  };
  files?: Record<string, unknown>;
}

export interface DiagramCheckpoint {
  version: number;
  createdAt: string;
  reason: string;
  spec: DiagramSpec;
  scene: ExcalidrawSceneData;
  hasManualEdits?: boolean;
}

export interface RefinementHistoryEntry {
  id: string;
  instruction: string;
  appliedAt: string;
  fromVersion: number;
  toVersion: number;
  operationsCount: number;
}

export interface StorageUsageStats {
  diagramCount: number;
  sourceDocumentCount: number;
  totalBytes: number;
  formattedSize: string;
}

export interface SavedDiagram {
  id: string;
  title: string;
  sourceDocumentId: string;
  sourceUrl: string;
  diagramType: DiagramType;
  spec: DiagramSpec;
  scene: ExcalidrawSceneData;
  providerId: AIProviderId;
  modelId: string;
  generationMode?: 'live_ai' | 'local_heuristic';
  generationLatencyMs?: number;
  hasManualEdits?: boolean;
  manualNodePositions?: Record<string, { x: number; y: number }>;
  checkpoints?: DiagramCheckpoint[];
  refinementHistory?: RefinementHistoryEntry[];
  thumbnailSvg?: string;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface ProviderProfile {
  id: string;
  name: string;
  providerId: AIProviderId;
  modelId: string;
  apiKey?: string;
  baseUrl?: string;
  timeoutMs: number;
}

export interface MCPConnection {
  id: string;
  name: string;
  endpoint: string;
  transport: 'streamable-http';
  enabled: boolean;
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  allowedTools: string[];
  authMode: 'none' | 'bearer' | 'oauth';
}

export interface UserSettings {
  onboardingCompleted: boolean;
  activeProviderId: AIProviderId;
  activeModelId: string;
  defaultDiagramType: DiagramType;
  defaultComplexity: ComplexityLevel;
  defaultOutputDestination: OutputDestination;
  theme: ThemeMode;
  requireDataSharingConfirmation: boolean;
  persistCredentialsLocally?: boolean;
  approvedProviders?: AIProviderId[];
  profiles: ProviderProfile[];
  mcpConnections: MCPConnection[];
}

export interface ActiveTabMetadata {
  tabId?: number;
  url: string;
  title: string;
  domain: string;
  favIconUrl?: string;
  supported: boolean;
  unsupportedReason?: string;
  selectedText?: string;
}

export type ExtensionMessage =
  | { type: 'GET_ACTIVE_TAB_INFO' }
  | { type: 'EXTRACT_ACTIVE_PAGE' }
  | { type: 'OPEN_EDITOR_TAB'; diagramId?: string }
  | { type: 'CONTENT_EXTRACT_REQUEST' }
  | {
      type: 'CONTEXT_MENU_TRIGGERED';
      mode: 'page' | 'selection';
      selectedText?: string;
      url?: string;
      title?: string;
    };
