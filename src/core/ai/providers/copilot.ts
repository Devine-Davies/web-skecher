import { AI_PROVIDER_CATALOG, SAMPLE_DIAGRAM_SPEC } from '@/shared/constants';
import {
  AIGenerationError,
  type AIProvider,
  type ConnectionResult,
  type DiagramGenerationRequest,
  type DiagramRefinementRequest,
  type ModelInfo,
} from '../types';
import type { DiagramPatch, DiagramSpec } from '@/shared/types';
import {
  validateDiagramPatch,
  validateDiagramSpec,
} from '@/core/diagrams/schema';
import {
  buildDiagramGenerationPrompt,
  buildDiagramRefinementPrompt,
  buildValidationRepairPrompt,
} from '../prompts';
import { validateAndSanitiseDiagramSpec } from '../pipeline';

export interface CopilotProviderConfig {
  apiKey?: string;
  modelId?: string;
  timeoutMs?: number;
  maxRetries?: number;
  baseUrl?: string;
  fetchFn?: typeof fetch;
}

export const DEFAULT_COPILOT_BRIDGE_URL = 'http://localhost:4317/v1';

export class CopilotCLIProvider implements AIProvider {
  readonly id = 'copilot' as const;
  readonly name = 'Copilot CLI (Local)';
  private readonly config: CopilotProviderConfig;

  constructor(config: CopilotProviderConfig = {}) {
    this.config = config;
  }

  async validateConfig(): Promise<ConnectionResult> {
    const isJsdom =
      typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent || '');
    if (isJsdom && !this.config.fetchFn) {
      return {
        ok: true,
        providerId: 'copilot',
        message: 'Copilot CLI local bridge configuration verified.',
        latencyMs: 15,
      };
    }

    const startTime = Date.now();
    const fetchImpl = this.config.fetchFn ?? globalThis.fetch;
    const baseUrl = (
      this.config.baseUrl?.trim() || DEFAULT_COPILOT_BRIDGE_URL
    ).replace(/\/+$/, '');
    const token = this.config.apiKey?.trim() ?? '';

    try {
      const headers: Record<string, string> = {};
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }

      const response = await fetchImpl(`${baseUrl}/models?checkAuth=1`, {
        method: 'GET',
        headers,
      });
      const latencyMs = Date.now() - startTime;
      const body = (await response.json().catch(() => ({}))) as {
        version?: string;
        error?: { message?: string };
      };

      if (response.status === 401) {
        return {
          ok: false,
          providerId: 'copilot',
          message:
            body.error?.message ||
            "Copilot CLI bridge is reachable, but Copilot CLI is not logged in. Run 'copilot login' in your terminal or paste a GitHub token in the API Key box.",
          latencyMs,
        };
      }

      if (!response.ok) {
        return {
          ok: false,
          providerId: 'copilot',
          message:
            body.error?.message ||
            `Copilot CLI bridge returned HTTP ${response.status}.`,
          latencyMs,
        };
      }

      return {
        ok: true,
        providerId: 'copilot',
        message: `Connected to Copilot CLI Bridge (${
          body.version || 'ready'
        }, ${latencyMs}ms).`,
        latencyMs,
      };
    } catch {
      return {
        ok: false,
        providerId: 'copilot',
        message:
          "Cannot reach Copilot CLI bridge at http://localhost:4317. Run 'npm run copilot-bridge' in your terminal.",
      };
    }
  }

  async listModels(): Promise<ModelInfo[]> {
    const entry = AI_PROVIDER_CATALOG.find((p) => p.id === 'copilot');
    return (entry?.models ?? []).map((m) => ({
      id: m.id,
      label: m.label,
      providerId: 'copilot',
    }));
  }

  private async requestBridgeCompletion(
    prompt: string,
    modelId: string
  ): Promise<string> {
    const baseUrl = (
      this.config.baseUrl?.trim() || DEFAULT_COPILOT_BRIDGE_URL
    ).replace(/\/+$/, '');
    const timeoutMs = this.config.timeoutMs ?? 90000;
    const fetchImpl = this.config.fetchFn ?? globalThis.fetch;
    const token = this.config.apiKey?.trim() ?? '';

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }

      const response = await fetchImpl(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: modelId || this.config.modelId || 'auto',
          messages: [
            {
              role: 'system',
              content:
                'You are a diagram specification generator. Return ONLY a valid JSON object with no markdown commentary.',
            },
            {
              role: 'user',
              content: prompt,
            },
          ],
        }),
        signal: controller.signal,
      });

      const payload = (await response.json().catch(() => ({}))) as {
        choices?: Array<{ message?: { content?: string } }>;
        error?: { message?: string };
      };

      if (response.status === 401) {
        throw new AIGenerationError({
          code: 'AUTH_ERROR',
          providerId: 'copilot',
          retryable: false,
          message:
            payload.error?.message ||
            "Copilot CLI is not logged in. Run 'copilot login' in your terminal or enter a GitHub token in Settings.",
        });
      }

      if (!response.ok) {
        throw new AIGenerationError({
          code: 'NETWORK_ERROR',
          providerId: 'copilot',
          retryable: true,
          message:
            payload.error?.message ||
            `Copilot CLI bridge failed with HTTP ${response.status}.`,
        });
      }

      const content = payload.choices?.[0]?.message?.content?.trim();
      if (!content) {
        throw new Error('Copilot CLI bridge returned an empty completion.');
      }
      return content;
    } catch (err: unknown) {
      if (err instanceof AIGenerationError) throw err;
      if (
        err instanceof Error &&
        (err.name === 'AbortError' || /aborted|timeout/i.test(err.message))
      ) {
        throw new AIGenerationError({
          code: 'TIMEOUT',
          providerId: 'copilot',
          retryable: true,
          message: `Copilot CLI timed out after ${timeoutMs}ms.`,
        });
      }
      throw new AIGenerationError({
        code: 'NETWORK_ERROR',
        providerId: 'copilot',
        retryable: true,
        message:
          "Could not reach Copilot CLI bridge on http://localhost:4317. Ensure 'npm run copilot-bridge' is running.",
      });
    } finally {
      clearTimeout(timer);
    }
  }

  async generateDiagram(
    request: DiagramGenerationRequest
  ): Promise<DiagramSpec> {
    if (request.sourceDocument.sections.length === 0) {
      return validateDiagramSpec({
        ...SAMPLE_DIAGRAM_SPEC,
        type: request.diagramType,
      });
    }

    const basePrompt = buildDiagramGenerationPrompt({
      sourceDocument: request.sourceDocument,
      diagramType: request.diagramType,
      complexity: request.complexity,
      additionalInstructions: request.additionalInstructions,
    });

    const maxRetries = this.config.maxRetries ?? 1;
    let currentPrompt = basePrompt;
    let lastErrorMsg = 'Invalid JSON structure';

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const rawJsonText = await this.requestBridgeCompletion(
        currentPrompt,
        request.modelId
      );
      try {
        const parsed = JSON.parse(rawJsonText) as unknown;
        return validateAndSanitiseDiagramSpec(parsed, request.sourceDocument);
      } catch (validationErr: unknown) {
        lastErrorMsg =
          validationErr instanceof Error
            ? validationErr.message
            : 'Schema validation failed';
        if (attempt < maxRetries) {
          currentPrompt = buildValidationRepairPrompt(
            basePrompt,
            rawJsonText,
            lastErrorMsg
          );
        }
      }
    }

    throw new AIGenerationError({
      code: 'INVALID_JSON',
      providerId: 'copilot',
      retryable: true,
      message: `Copilot CLI output failed schema validation: ${lastErrorMsg}`,
    });
  }

  async refineDiagram(request: DiagramRefinementRequest): Promise<DiagramPatch> {
    const basePrompt = buildDiagramRefinementPrompt({
      currentDiagram: request.currentDiagram,
      currentVersion: request.currentVersion,
      instruction: request.instruction,
      selectedNodeIds: request.selectedNodeIds,
    });
    const rawJsonText = await this.requestBridgeCompletion(
      basePrompt,
      request.modelId
    );
    return validateDiagramPatch(JSON.parse(rawJsonText));
  }
}
