import { AI_PROVIDER_CATALOG } from '@/shared/constants';
import type { AIProviderId, ProviderProfile } from '@/shared/types';

const DEFAULT_ENDPOINTS: Partial<Record<AIProviderId, string>> = {
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com/v1',
};

export function getProviderApprovalKey(
  providerId: AIProviderId,
  profile?: ProviderProfile
): string {
  const matchingProfile =
    profile?.providerId === providerId ? profile : undefined;
  const endpoint =
    matchingProfile?.baseUrl ||
    AI_PROVIDER_CATALOG.find((provider) => provider.id === providerId)
      ?.defaultBaseUrl ||
    DEFAULT_ENDPOINTS[providerId] ||
    '';
  return JSON.stringify([
    matchingProfile?.id ?? `default:${providerId}`,
    providerId,
    endpoint,
  ]);
}
