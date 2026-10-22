import type { AIProviderId } from '@/shared/types';
import type { AIProvider } from '../types';
import { OpenAIProvider, type OpenAIProviderConfig } from './openai';
import { AnthropicProvider } from './anthropic';
import { CopilotCLIProvider } from './copilot';
import { CompatibleProvider } from './compatible';

export function createAIProvider(
  providerId: AIProviderId,
  config: OpenAIProviderConfig = {}
): AIProvider {
  if (providerId === 'ollama' || providerId === 'custom') {
    return new CompatibleProvider({
      ...config,
      providerId,
    });
  }
  if (providerId === 'copilot') {
    return new CopilotCLIProvider(config);
  }
  if (providerId === 'anthropic') {
    return new AnthropicProvider(config);
  }
  return new OpenAIProvider(config);
}
