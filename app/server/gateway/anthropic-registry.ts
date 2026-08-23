import { ANTHROPIC_OFFICIAL_MODELS, type OfficialAnthropicModel } from '../constants/anthropic-models';

let cachedModels: OfficialAnthropicModel[] = [...ANTHROPIC_OFFICIAL_MODELS];
let lastFetchedAt: string | null = null;
let isInitialized = false;

/**
 * Auto-fetch available official models from Anthropic on startup or on-demand.
 * Falls back to bundled @anthropic-ai/sdk official models if unreachable or unauthenticated.
 */
export async function syncAnthropicModels(apiKey?: string): Promise<{
  source: 'live_anthropic_api' | 'sdk_fallback';
  models: OfficialAnthropicModel[];
  count: number;
}> {
  const key = apiKey || process.env.ANTHROPIC_API_KEY;

  if (key && key !== 'gateway' && key !== 'gateway-key') {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const res = await fetch('https://api.anthropic.com/v1/models', {
        headers: {
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
        },
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (res.ok) {
        const json = (await res.json()) as { data?: Array<{ id: string; display_name?: string; created_at?: string; max_tokens?: number }> };
        if (json.data && Array.isArray(json.data) && json.data.length > 0) {
          const liveModels: OfficialAnthropicModel[] = json.data.map((m) => {
            let category = 'Claude 3.5';
            if (m.id.includes('5') && !m.id.includes('3.5')) category = 'Claude 5';
            else if (m.id.includes('4-') || m.id.includes('4.')) category = 'Claude 4.x';
            else if (m.id.includes('3-7') || m.id.includes('3.7')) category = 'Claude 3.7';
            else if (m.id.includes('3-5') || m.id.includes('3.5')) category = 'Claude 3.5';
            else if (m.id.startsWith('claude-3')) category = 'Claude 3';

            return {
              id: m.id,
              displayName: m.display_name || m.id,
              category,
              createdAt: m.created_at || new Date().toISOString(),
              maxTokens: m.max_tokens || 8192,
            };
          });

          // Ensure wildcard exists
          if (!liveModels.some((m) => m.id === '*')) {
            liveModels.push({
              id: '*',
              displayName: '* (Wildcard / Catch-All)',
              category: 'Wildcard',
              createdAt: '2025-01-01T00:00:00Z',
              maxTokens: 8192,
            });
          }

          cachedModels = liveModels;
          lastFetchedAt = new Date().toISOString();
          isInitialized = true;

          return { source: 'live_anthropic_api', models: cachedModels, count: cachedModels.length };
        }
      }
    } catch {
      // Ignore network / auth error and use SDK fallback
    }
  }

  // Fallback to official @anthropic-ai/sdk model catalog
  cachedModels = [...ANTHROPIC_OFFICIAL_MODELS];
  lastFetchedAt = new Date().toISOString();
  isInitialized = true;

  return { source: 'sdk_fallback', models: cachedModels, count: cachedModels.length };
}

export function getOfficialAnthropicModels(): OfficialAnthropicModel[] {
  if (!isInitialized) {
    syncAnthropicModels();
  }
  return cachedModels;
}

export function getLastFetchedTime(): string | null {
  return lastFetchedAt;
}
