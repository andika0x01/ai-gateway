import { Hono } from 'hono';
import { handleMessagesRequest } from '../gateway/router';
import { estimateAnthropicTokens } from '../adapters/tokenizer';
import { getAllRouteRules, getAllModels } from '../db/repository';
import { ANTHROPIC_OFFICIAL_MODELS } from '../constants/anthropic-models';
import type { AnthropicMessagesRequest } from '../adapters/types';

export const v1Router = new Hono();

// POST /v1/messages - Primary Claude Code Endpoint
v1Router.post('/messages', async (c) => {
  try {
    const body = (await c.req.json()) as AnthropicMessagesRequest;
    return await handleMessagesRequest(body);
  } catch (err: any) {
    return c.json(
      {
        type: 'error',
        error: {
          type: 'invalid_request_error',
          message: err?.message || 'Invalid JSON request payload',
        },
      },
      400
    );
  }
});

// POST /v1/messages/count_tokens - Claude Code Token Counter
v1Router.post('/messages/count_tokens', async (c) => {
  try {
    const body = (await c.req.json()) as AnthropicMessagesRequest;
    const inputTokens = estimateAnthropicTokens(body);
    return c.json({ input_tokens: inputTokens });
  } catch (err: any) {
    return c.json(
      {
        type: 'error',
        error: {
          type: 'invalid_request_error',
          message: err?.message || 'Invalid token counting request',
        },
      },
      400
    );
  }
});

// GET /v1/models - Return official Anthropic models list
v1Router.get('/models', (c) => {
  const data = ANTHROPIC_OFFICIAL_MODELS.filter((m) => m.id !== '*').map((m) => ({
    id: m.id,
    type: 'model' as const,
    display_name: m.displayName,
    created_at: m.createdAt,
    max_tokens: m.maxTokens,
  }));

  return c.json({
    data,
    has_more: false,
    first_id: data[0]?.id || null,
    last_id: data[data.length - 1]?.id || null,
  });
});

// GET /v1/models/:id
v1Router.get('/models/:id', (c) => {
  const modelId = c.req.param('id');
  return c.json({
    id: modelId,
    type: 'model',
    display_name: modelId,
    created_at: '2025-01-01T00:00:00Z',
  });
});
