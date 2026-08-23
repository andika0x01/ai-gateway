import { Hono } from 'hono';
import {
  getAllProviders,
  getProviderById,
  createProvider,
  updateProvider,
  deleteProvider,
  getAllModels,
  getModelById,
  createModel,
  updateModel,
  deleteModel,
  getAllRouteRules,
  createRouteRule,
  updateRouteRule,
  deleteRouteRule,
  getRequestLogs,
  getGatewayStats,
  clearRequestLogs,
} from '../db/repository';
import { handleMessagesRequest } from '../gateway/router';
import {
  getOfficialAnthropicModels,
  syncAnthropicModels,
  getLastFetchedTime,
} from '../gateway/anthropic-registry';
import type { AnthropicMessagesRequest } from '../adapters/types';

export const adminRouter = new Hono();

// --- Stats ---
adminRouter.get('/stats', (c) => {
  const stats = getGatewayStats();
  return c.json(stats);
});

// --- Providers ---
adminRouter.get('/providers', (c) => {
  const providers = getAllProviders();
  return c.json(providers);
});

adminRouter.post('/providers', async (c) => {
  const body = await c.req.json();
  const provider = createProvider(body);
  return c.json(provider, 201);
});

adminRouter.put('/providers/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  const updated = updateProvider(id, body);
  if (!updated) return c.json({ error: 'Provider not found' }, 404);
  return c.json(updated);
});

adminRouter.delete('/providers/:id', (c) => {
  const id = c.req.param('id');
  const deleted = deleteProvider(id);
  return c.json({ success: deleted });
});

// Test Provider Connection
adminRouter.post('/providers/:id/test', async (c) => {
  const id = c.req.param('id');
  const provider = getProviderById(id);
  if (!provider) return c.json({ error: 'Provider not found' }, 404);

  const baseUrl = provider.base_url.replace(/\/+$/, '');
  const testUrl = `${baseUrl}/models`;

  let customHeaders: Record<string, string> = {};
  try {
    customHeaders = JSON.parse(provider.custom_headers || '{}');
  } catch {}

  const headers: Record<string, string> = {
    ...customHeaders,
  };
  if (provider.api_key) {
    headers['Authorization'] = `Bearer ${provider.api_key}`;
  }

  const start = Date.now();
  try {
    const res = await fetch(testUrl, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(8000),
    });

    const latency = Date.now() - start;
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      const modelCount = Array.isArray(data?.data) ? data.data.length : Array.isArray(data?.models) ? data.models.length : 'N/A';
      return c.json({
        success: true,
        status: res.status,
        latency_ms: latency,
        message: `Connected successfully! Discovered ${modelCount} models from provider endpoint.`,
      });
    } else {
      const text = await res.text().catch(() => '');
      return c.json({
        success: false,
        status: res.status,
        latency_ms: latency,
        message: `HTTP ${res.status}: ${text.slice(0, 200)}`,
      });
    }
  } catch (err: any) {
    return c.json({
      success: false,
      latency_ms: Date.now() - start,
      message: `Connection failed: ${err?.message || 'Network error'}`,
    });
  }
});

// Discover Models from Provider Endpoint
adminRouter.post('/providers/:id/discover-models', async (c) => {
  const id = c.req.param('id');
  const provider = getProviderById(id);
  if (!provider) return c.json({ error: 'Provider not found' }, 404);

  const baseUrl = provider.base_url.replace(/\/+$/, '');
  const testUrl = `${baseUrl}/models`;

  let customHeaders: Record<string, string> = {};
  try {
    customHeaders = JSON.parse(provider.custom_headers || '{}');
  } catch {}

  const headers: Record<string, string> = {
    ...customHeaders,
  };
  if (provider.api_key) {
    headers['Authorization'] = `Bearer ${provider.api_key}`;
  }

  try {
    const res = await fetch(testUrl, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      return c.json({ error: `Provider returned HTTP ${res.status}` }, 400);
    }

    const data = await res.json();
    let modelList: Array<{ id?: string; name?: string }> = [];

    if (Array.isArray(data?.data)) {
      modelList = data.data;
    } else if (Array.isArray(data?.models)) {
      modelList = data.models;
    }

    let addedCount = 0;
    const existingModels = getAllModels().filter((m) => m.provider_id === id);
    const existingNames = new Set(existingModels.map((m) => m.model_name));

    for (const m of modelList) {
      const modelName = m.id || m.name;
      if (modelName && !existingNames.has(modelName)) {
        const isThinking =
          modelName.toLowerCase().includes('r1') ||
          modelName.toLowerCase().includes('reasoner') ||
          modelName.toLowerCase().includes('qwq');
        const isVision =
          modelName.toLowerCase().includes('vl') ||
          modelName.toLowerCase().includes('vision') ||
          modelName.toLowerCase().includes('4o');

        createModel({
          provider_id: id,
          model_name: modelName,
          display_name: `${modelName} (${provider.name})`,
          supports_tools: true,
          supports_thinking: isThinking,
          supports_vision: isVision,
          max_tokens: isThinking ? 16384 : 8192,
          enabled: true,
        });
        addedCount++;
      }
    }

    return c.json({
      success: true,
      discovered_total: modelList.length,
      new_models_added: addedCount,
    });
  } catch (err: any) {
    return c.json({ error: `Failed to discover models: ${err?.message || 'Network error'}` }, 500);
  }
});

// --- Models ---
adminRouter.get('/models', (c) => {
  const models = getAllModels();
  return c.json(models);
});

adminRouter.post('/models', async (c) => {
  const body = await c.req.json();
  const model = createModel(body);
  return c.json(model, 201);
});

adminRouter.put('/models/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  const updated = updateModel(id, body);
  if (!updated) return c.json({ error: 'Model not found' }, 404);
  return c.json(updated);
});

adminRouter.delete('/models/:id', (c) => {
  const id = c.req.param('id');
  const deleted = deleteModel(id);
  return c.json({ success: deleted });
});

// --- Routes & Fallbacks ---
adminRouter.get('/routes', (c) => {
  const routes = getAllRouteRules();
  return c.json(routes);
});

adminRouter.post('/routes', async (c) => {
  const body = await c.req.json();
  const route = createRouteRule(body);
  return c.json(route, 201);
});

adminRouter.put('/routes/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  const updated = updateRouteRule(id, body);
  if (!updated) return c.json({ error: 'Route rule not found' }, 404);
  return c.json(updated);
});

adminRouter.delete('/routes/:id', (c) => {
  const id = c.req.param('id');
  const deleted = deleteRouteRule(id);
  return c.json({ success: deleted });
});

// --- Logs ---
adminRouter.get('/logs', (c) => {
  const limit = Number(c.req.query('limit')) || 50;
  const offset = Number(c.req.query('offset')) || 0;
  const status = c.req.query('status');
  const result = getRequestLogs(limit, offset, status);
  return c.json(result);
});

adminRouter.delete('/logs', (c) => {
  clearRequestLogs();
  return c.json({ success: true });
});

// --- Anthropic Official Models Registry ---
adminRouter.get('/anthropic-models', (c) => {
  const models = getOfficialAnthropicModels();
  return c.json({
    models,
    count: models.length,
    last_fetched_at: getLastFetchedTime(),
  });
});

adminRouter.post('/anthropic-models/sync', async (c) => {
  const result = await syncAnthropicModels();
  return c.json(result);
});

// --- Test Gateway ---
adminRouter.post('/test-gateway', async (c) => {
  try {
    const body = (await c.req.json()) as AnthropicMessagesRequest;
    return await handleMessagesRequest(body);
  } catch (err: any) {
    return c.json({ error: err?.message || 'Failed to execute test message' }, 500);
  }
});
