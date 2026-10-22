import type {
  AIProviderId,
  ComplexityLevel,
  DiagramType,
  GenerationStageId,
  SavedDiagram,
  SourceDocument,
} from '@/shared/types';
import { createAIProvider } from './providers';
import { renderDiagramToExcalidrawScene } from '@/core/diagrams/renderer';
import { prepareDocumentForContextBudget } from '@/core/extraction';
import { saveDiagramRecord, saveLastExtractedDocument } from '@/core/storage';

export interface RunGenerationOptions {
  sourceDocument: SourceDocument;
  providerId: AIProviderId;
  modelId: string;
  apiKey?: string;
  providerProfileId?: string;
  baseUrl?: string;
  approvedEndpoint?: string;
  additionalHeaders?: Record<string, string>;
  timeoutMs?: number;
  diagramType: DiagramType;
  complexity: ComplexityLevel;
  additionalInstructions?: string;
  maxTokenBudget?: number;
  onStageChange?: (stage: GenerationStageId) => void;
}

export async function runDiagramGenerationFlow(
  options: RunGenerationOptions
): Promise<SavedDiagram> {
  const notify = (stage: GenerationStageId) => options.onStageChange?.(stage);

  notify('reading_webpage');
  const preparedDoc = prepareDocumentForContextBudget(
    options.sourceDocument,
    options.maxTokenBudget
  );
  await saveLastExtractedDocument(preparedDoc);

  notify('identifying_concepts');

  const trimmedKey = options.apiKey?.trim() ?? '';
  const isLiveAiKey =
    options.providerId === 'copilot' ||
    options.providerId === 'ollama' ||
    (options.providerId === 'custom' &&
      Boolean(options.approvedEndpoint) &&
      options.approvedEndpoint === options.baseUrl) ||
    (trimmedKey.startsWith('sk-') && trimmedKey.length >= 12);
  const startTime = Date.now();

  const provider = createAIProvider(options.providerId, {
    apiKey: trimmedKey,
    modelId: options.modelId,
    baseUrl: options.baseUrl,
    approvedEndpoint:
      options.approvedEndpoint === options.baseUrl
        ? options.approvedEndpoint
        : undefined,
    additionalHeaders: options.additionalHeaders,
    timeoutMs: options.timeoutMs,
  });

  notify('designing_diagram');
  const spec = await provider.generateDiagram({
    sourceDocument: preparedDoc,
    diagramType: options.diagramType,
    complexity: options.complexity,
    additionalInstructions: options.additionalInstructions,
    modelId: options.modelId,
  });
  const generationLatencyMs = Date.now() - startTime;

  notify('creating_elements');
  const scene = renderDiagramToExcalidrawScene(spec);

  const saved: SavedDiagram = {
    id: spec.id,
    title: spec.title,
    sourceDocumentId: preparedDoc.id,
    sourceUrl: preparedDoc.url,
    diagramType: options.diagramType,
    spec,
    scene,
    providerId: options.providerId,
    providerProfileId: options.providerProfileId,
    modelId: options.modelId,
    generationMode: isLiveAiKey ? 'live_ai' : 'local_heuristic',
    generationLatencyMs,
    createdAt: spec.createdAt,
    updatedAt: spec.createdAt,
    version: 1,
  };

  await saveDiagramRecord(saved);
  notify('opening_result');
  return saved;
}
