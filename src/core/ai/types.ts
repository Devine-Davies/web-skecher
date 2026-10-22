import type {
  AIProviderId,
  ComplexityLevel,
  DiagramPatch,
  DiagramSpec,
  DiagramType,
  SourceDocument,
} from '@/shared/types';
import { redactSensitiveText } from '@/core/security';

export type AIGenerationErrorCode =
  | 'AUTH_ERROR'
  | 'RATE_LIMIT'
  | 'TIMEOUT'
  | 'INVALID_JSON'
  | 'NETWORK_ERROR';

export class AIGenerationError extends Error {
  readonly code: AIGenerationErrorCode;
  readonly providerId: AIProviderId;
  readonly retryable: boolean;

  constructor(params: {
    code: AIGenerationErrorCode;
    message: string;
    providerId: AIProviderId;
    retryable: boolean;
  }) {
    super(redactSensitiveText(params.message));
    this.name = 'AIGenerationError';
    this.code = params.code;
    this.providerId = params.providerId;
    this.retryable = params.retryable;
  }
}

export interface ConnectionResult {
  ok: boolean;
  providerId: AIProviderId;
  message: string;
  latencyMs?: number;
}

export interface ModelInfo {
  id: string;
  label: string;
  providerId: AIProviderId;
}

export interface DiagramGenerationRequest {
  sourceDocument: SourceDocument;
  diagramType: DiagramType;
  complexity: ComplexityLevel;
  additionalInstructions?: string;
  modelId: string;
}

export interface DiagramRefinementRequest {
  currentDiagram: DiagramSpec;
  currentVersion: number;
  instruction: string;
  selectedNodeIds?: string[];
  modelId: string;
}

export interface AIProvider {
  id: AIProviderId;
  name: string;
  validateConfig(): Promise<ConnectionResult>;
  listModels(): Promise<ModelInfo[]>;
  generateDiagram(request: DiagramGenerationRequest): Promise<DiagramSpec>;
  refineDiagram(request: DiagramRefinementRequest): Promise<DiagramPatch>;
}
