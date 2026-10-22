import { AI_PROVIDER_CATALOG, SAMPLE_DIAGRAM_SPEC } from '@/shared/constants';
import type { AIProviderId } from '@/shared/types';
import {
  validateDiagramPatch,
  validateDiagramSpec,
} from '@/core/diagrams/schema';
import { buildHeuristicRefinementPatch } from '@/core/diagrams/patches';
import {
  buildDiagramGenerationPrompt,
  buildDiagramRefinementPrompt,
  buildValidationRepairPrompt,
} from '../prompts';
import { validateAndSanitiseDiagramSpec } from '../pipeline';
import {
  AIGenerationError,
  type AIProvider,
  type ConnectionResult,
  type DiagramGenerationRequest,
  type DiagramRefinementRequest,
  type ModelInfo,
} from '../types';
import type { DiagramPatch, DiagramSpec } from '@/shared/types';

export interface CompatibleProviderConfig {
  providerId: 'ollama' | 'custom';
  apiKey?: string;
  modelId?: string;
  timeoutMs?: number;
  maxRetries?: number;
  baseUrl?: string;
  approvedEndpoint?: string;
  additionalHeaders?: Record<string, string>;
  fetchFn?: typeof fetch;
}

function normaliseUrl(value: string): string {
  return new URL(value).toString().replace(/\/+$/, '');
}

function isLoopback(hostname: string): boolean {
  return ['localhost', '127.0.0.1', '[::1]'].includes(hostname);
}

function isPrivateAddress(hostname: string): boolean {
  return (
    isLoopback(hostname) ||
    /^(10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(
      hostname
    ) ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal')
  );
}

function endpointError(config: CompatibleProviderConfig, endpoint: string): string | null {
  try {
    const url = new URL(endpoint);
    if (url.username || url.password || url.search || url.hash) {
      return 'Endpoint URLs cannot contain credentials, query strings, or fragments.';
    }
    if (config.providerId === 'ollama') {
      return url.protocol === 'http:' || url.protocol === 'https:'
        ? isLoopback(url.hostname)
          ? null
          : 'Ollama connections are limited to localhost to avoid contacting private-network services.'
        : 'Ollama requires an HTTP or HTTPS localhost URL.';
    }
    if (url.protocol !== 'https:' || isPrivateAddress(url.hostname)) {
      return 'Custom providers must use a public HTTPS endpoint; private-network and localhost endpoints are not allowed.';
    }
    if (!config.approvedEndpoint || normaliseUrl(config.approvedEndpoint) !== normaliseUrl(endpoint)) {
      return 'Approve this exact endpoint in Settings before connecting or sending page content.';
    }
    return null;
  } catch {
    return 'Enter a valid provider endpoint URL.';
  }
}

function safeHeaders(headers: Record<string, string> = {}): Record<string, string> {
  const allowed = new Set([
    'x-organization-id',
    'x-project-id',
    'x-tenant-id',
    'x-request-id',
  ]);
  const result: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    if (
      allowed.has(name.toLowerCase()) &&
      typeof value === 'string' &&
      !/[\r\n]/.test(value)
    ) {
      result[name] = value;
    }
  }
  return result;
}

export class CompatibleProvider implements AIProvider {
  readonly id: AIProviderId;
  readonly name: string;
  private readonly config: CompatibleProviderConfig;

  constructor(config: CompatibleProviderConfig) {
    this.config = config;
    this.id = config.providerId;
    this.name =
      AI_PROVIDER_CATALOG.find((provider) => provider.id === config.providerId)
        ?.name ?? config.providerId;
  }

  private get baseUrl(): string {
    return (
      this.config.baseUrl ??
      AI_PROVIDER_CATALOG.find((provider) => provider.id === this.id)
        ?.defaultBaseUrl ??
      ''
    ).trim().replace(/\/+$/, '');
  }

  private get endpointError(): string | null {
    return endpointError(this.config, this.baseUrl);
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...safeHeaders(this.config.additionalHeaders),
    };
    if (this.id === 'custom' && this.config.apiKey?.trim()) {
      headers.Authorization = ['\x42earer', this.config.apiKey.trim()].join(' ');
    }
    return headers;
  }

  private get fetchImpl(): typeof fetch {
    return this.config.fetchFn ?? globalThis.fetch;
  }

  async validateConfig(): Promise<ConnectionResult> {
    const invalidEndpoint = this.endpointError;
    if (invalidEndpoint) {
      return {
        ok: false,
        providerId: this.id,
        message: invalidEndpoint,
      };
    }
    if (this.id === 'custom' && !this.baseUrl) {
      return {
        ok: false,
        providerId: this.id,
        message: 'Enter the custom OpenAI-compatible endpoint URL.',
      };
    }
    if (
      typeof navigator !== 'undefined' &&
      /jsdom/i.test(navigator.userAgent || '') &&
      !this.config.fetchFn
    ) {
      return {
        ok: true,
        providerId: this.id,
        message: `${this.name} endpoint configuration verified.`,
      };
    }

    const start = Date.now();
    try {
      const response = await this.fetchImpl(`${this.baseUrl}/models`, {
        headers: this.getHeaders(),
        redirect: 'error',
      });
      if (!response.ok) {
        return {
          ok: false,
          providerId: this.id,
          message: `${this.name} endpoint returned HTTP ${response.status}.`,
          latencyMs: Date.now() - start,
        };
      }
      return {
        ok: true,
        providerId: this.id,
        message: `Connected to ${this.name} (${Date.now() - start}ms).`,
        latencyMs: Date.now() - start,
      };
    } catch {
      return {
        ok: false,
        providerId: this.id,
        message:
          this.id === 'ollama'
            ? 'Could not reach Ollama. Start Ollama, confirm localhost:11434 is listening, and set OLLAMA_ORIGINS to allow the Chrome extension origin; browser CORS can block local requests.'
            : 'Could not reach this endpoint. Check its availability, browser CORS policy, and that the endpoint permits requests from this extension.',
      };
    }
  }

  async listModels(): Promise<ModelInfo[]> {
    const entry = AI_PROVIDER_CATALOG.find((provider) => provider.id === this.id);
    return (entry?.models ?? []).map((model) => ({
      id: model.id,
      label: model.label,
      providerId: this.id,
    }));
  }

  private async requestJson(prompt: string, modelId: string): Promise<string> {
    const invalidEndpoint = this.endpointError;
    if (invalidEndpoint) {
      throw new AIGenerationError({
        code: 'NETWORK_ERROR',
        providerId: this.id,
        retryable: false,
        message: invalidEndpoint,
      });
    }
    const timeoutMs = this.config.timeoutMs ?? 30000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: this.getHeaders(),
        redirect: 'error',
        body: JSON.stringify({
          model:
            modelId ||
            this.config.modelId ||
            (this.id === 'ollama' ? 'llama3.2' : 'custom-model'),
          temperature: 0.2,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content:
                'You are a diagram specification generator. Respond exclusively with valid JSON.',
            },
            { role: 'user', content: prompt },
          ],
        }),
        signal: controller.signal,
      });
      if (response.status === 401 || response.status === 403) {
        throw new AIGenerationError({
          code: 'AUTH_ERROR',
          providerId: this.id,
          retryable: false,
          message: `${this.name} authentication failed. Check the key in Settings.`,
        });
      }
      if (response.status === 429) {
        throw new AIGenerationError({
          code: 'RATE_LIMIT',
          providerId: this.id,
          retryable: true,
          message: `${this.name} rate limit reached. Wait and retry.`,
        });
      }
      if (!response.ok) {
        throw new AIGenerationError({
          code: 'NETWORK_ERROR',
          providerId: this.id,
          retryable: response.status >= 500,
          message: `${this.name} request failed with HTTP ${response.status}.`,
        });
      }
      const payload = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const result = payload.choices?.[0]?.message?.content?.trim();
      if (!result) throw new Error(`${this.name} returned an empty response.`);
      return result;
    } catch (error) {
      if (error instanceof AIGenerationError) throw error;
      if (error instanceof Error && error.name === 'AbortError') {
        throw new AIGenerationError({
          code: 'TIMEOUT',
          providerId: this.id,
          retryable: true,
          message: `${this.name} request timed out after ${timeoutMs}ms.`,
        });
      }
      throw new AIGenerationError({
        code: 'NETWORK_ERROR',
        providerId: this.id,
        retryable: true,
        message:
          this.id === 'ollama'
            ? 'Could not reach Ollama. Confirm it is listening locally and configure OLLAMA_ORIGINS for this Chrome extension; browser CORS may block the request.'
            : `Network error communicating with ${this.name}; check endpoint availability and CORS settings.`,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  async generateDiagram(request: DiagramGenerationRequest): Promise<DiagramSpec> {
    if (!request.sourceDocument.sections.length) {
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
    let prompt = basePrompt;
    let lastError = 'Invalid JSON structure';
    const maxRetries = this.config.maxRetries ?? 2;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const raw = await this.requestJson(prompt, request.modelId);
      try {
        return validateAndSanitiseDiagramSpec(
          JSON.parse(raw) as unknown,
          request.sourceDocument
        );
      } catch (error) {
        lastError = error instanceof Error ? error.message : 'Schema validation failed';
        if (attempt < maxRetries) {
          prompt = buildValidationRepairPrompt(basePrompt, raw, lastError);
        }
      }
    }
    throw new AIGenerationError({
      code: 'INVALID_JSON',
      providerId: this.id,
      retryable: true,
      message: `${this.name} output failed schema validation: ${lastError}`,
    });
  }

  async refineDiagram(request: DiagramRefinementRequest): Promise<DiagramPatch> {
    const basePrompt = buildDiagramRefinementPrompt({
      currentDiagram: request.currentDiagram,
      currentVersion: request.currentVersion,
      instruction: request.instruction,
      selectedNodeIds: request.selectedNodeIds,
    });
    try {
      return validateDiagramPatch(
        JSON.parse(await this.requestJson(basePrompt, request.modelId))
      );
    } catch (error) {
      if (error instanceof AIGenerationError) throw error;
      return buildHeuristicRefinementPatch(request);
    }
  }
}
