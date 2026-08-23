import {
  getRouteRuleForRequestedModel,
  getAllModels,
  createRequestLog,
} from '../db/repository';
import type { AnthropicMessagesRequest } from '../adapters/types';
import { convertAnthropicToOpenAI } from '../adapters/anthropic-to-openai';
import {
  convertOpenAIToAnthropicResponse,
  OpenAISSEStreamTransformer,
} from '../adapters/openai-to-anthropic';
import { estimateAnthropicTokens } from '../adapters/tokenizer';

export interface GatewayResult {
  response: Response;
}

export async function handleMessagesRequest(
  anthropicReq: AnthropicMessagesRequest
): Promise<Response> {
  const startTime = Date.now();
  const requestedModel = anthropicReq.model || 'claude-3-7-sonnet-20250219';
  const estimatedInputTokens = estimateAnthropicTokens(anthropicReq);
  const isStreaming = anthropicReq.stream !== false;
  const hasTools = !!(anthropicReq.tools && anthropicReq.tools.length > 0);

  // 1. Resolve Route Rule
  const routeRule = getRouteRuleForRequestedModel(requestedModel);
  let candidateFallbacks = routeRule?.fallbacks || [];

  // If no specific route rule, try any enabled models
  if (candidateFallbacks.length === 0) {
    const allModels = getAllModels().filter((m) => m.enabled === 1 && m.provider_enabled === 1);
    candidateFallbacks = allModels.map((m, idx) => ({
      id: `fb_dyn_${idx}`,
      route_id: 'dyn',
      model_id: m.id,
      priority_order: idx + 1,
      model_name: m.model_name,
      display_name: m.display_name,
      provider_id: m.provider_id,
      provider_name: m.provider_name,
      supports_tools: m.supports_tools,
      supports_thinking: m.supports_thinking,
      supports_vision: m.supports_vision,
      max_tokens: m.max_tokens,
      model_enabled: m.enabled,
      provider_type: m.provider_type,
      provider_base_url: m.provider_base_url,
      provider_api_key: m.provider_api_key,
      provider_headers: m.provider_headers,
      provider_enabled: m.provider_enabled,
    }));
  }

  if (candidateFallbacks.length === 0) {
    return Response.json(
      {
        type: 'error',
        error: {
          type: 'overloaded_error',
          message:
            'No active OpenAI-compatible models or providers configured in AI Gateway. Please add providers in the dashboard.',
        },
      },
      { status: 503 }
    );
  }

  let fallbackCount = 0;
  let lastErrorMessage = 'Unknown error';

  // 2. Iterate through Fallback Chain
  for (let i = 0; i < candidateFallbacks.length; i++) {
    const target = candidateFallbacks[i];
    const attemptStartTime = Date.now();

    // Check tool compatibility: skip if tools required but model lacks tool calling
    if (hasTools && target.supports_tools === 0) {
      continue;
    }

    if (i > 0) {
      fallbackCount++;
    }

    const timeoutMs = routeRule?.timeout_ms || 20000;
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => {
      controller.abort('timeout');
    }, timeoutMs);

    const openAIReq = convertAnthropicToOpenAI(anthropicReq, target.model_name, {
      supportsThinking: !!target.supports_thinking,
      supportsTools: !!target.supports_tools,
    });

    // Build URL & Headers
    const baseUrl = target.provider_base_url.replace(/\/+$/, '');
    const upstreamUrl = baseUrl.endsWith('/chat/completions')
      ? baseUrl
      : `${baseUrl}/chat/completions`;

    let customHeaders: Record<string, string> = {};
    try {
      customHeaders = JSON.parse(target.provider_headers || '{}');
    } catch {}

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...customHeaders,
    };

    if (target.provider_api_key) {
      headers['Authorization'] = `Bearer ${target.provider_api_key}`;
    }

    try {
      const response = await fetch(upstreamUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(openAIReq),
        signal: controller.signal,
      });

      if (!response.ok) {
        clearTimeout(timeoutHandle);
        const errorText = await response.text().catch(() => '');
        lastErrorMessage = `HTTP ${response.status}: ${errorText.slice(0, 300)}`;
        continue;
      }

      // Check if streaming
      if (isStreaming) {
        if (!response.body) {
          clearTimeout(timeoutHandle);
          lastErrorMessage = 'Empty response body from upstream stream';
          continue;
        }

        // We wrap the response body into an SSE transformer
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        const transformer = new OpenAISSEStreamTransformer(requestedModel, estimatedInputTokens);

        // Test first chunk to ensure TTFT is satisfied
        let firstChunkData: ReadableStreamReadResult<Uint8Array>;
        try {
          firstChunkData = await reader.read();
          clearTimeout(timeoutHandle);
        } catch (err: any) {
          clearTimeout(timeoutHandle);
          const isTimeout = err === 'timeout' || err?.name === 'AbortError';
          lastErrorMessage = isTimeout
            ? `TTFT Timeout after ${timeoutMs}ms`
            : (err?.message || 'Network stream error');
          continue;
        }

        if (firstChunkData.done && (!firstChunkData.value || firstChunkData.value.length === 0)) {
          lastErrorMessage = 'Stream closed immediately with 0 bytes';
          continue;
        }

        // Create transformed output stream
        let buffer = '';
        let outputTokensCount = 0;

        const outputStream = new ReadableStream({
          async start(streamController) {
            const encoder = new TextEncoder();

            const processRawText = (rawText: string) => {
              buffer += rawText;
              const lines = buffer.split('\n');
              buffer = lines.pop() || ''; // Keep incomplete line in buffer

              for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || trimmed.startsWith(':')) continue; // Ignore comments/empty

                if (trimmed.startsWith('data: ')) {
                  const dataStr = trimmed.slice(6).trim();
                  if (dataStr === '[DONE]') {
                    continue;
                  }
                  try {
                    const parsed = JSON.parse(dataStr);
                    for (const eventStr of transformer.processChunk(parsed)) {
                      streamController.enqueue(encoder.encode(eventStr));
                      outputTokensCount++;
                    }
                  } catch {
                    // Ignore malformed intermediate JSON chunk
                  }
                }
              }
            };

            // Process first chunk
            if (firstChunkData.value) {
              processRawText(decoder.decode(firstChunkData.value, { stream: true }));
            }

            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                if (value) {
                  processRawText(decoder.decode(value, { stream: true }));
                }
              }

              // Process remaining buffer
              if (buffer.trim()) {
                const trimmed = buffer.trim();
                if (trimmed.startsWith('data: ') && trimmed.slice(6).trim() !== '[DONE]') {
                  try {
                    const parsed = JSON.parse(trimmed.slice(6).trim());
                    for (const eventStr of transformer.processChunk(parsed)) {
                      streamController.enqueue(encoder.encode(eventStr));
                      outputTokensCount++;
                    }
                  } catch {}
                }
              }

              // Finalize stream events (message_stop, stop_reason)
              for (const eventStr of transformer.finalize()) {
                streamController.enqueue(encoder.encode(eventStr));
              }

              streamController.close();

              // Log success request
              const totalLatency = Date.now() - startTime;
              createRequestLog({
                requested_model: requestedModel,
                resolved_model: `${target.model_name} (${target.provider_name})`,
                provider_name: target.provider_name,
                status: fallbackCount > 0 ? 'fallback_success' : 'success',
                fallback_count: fallbackCount,
                latency_ms: totalLatency,
                input_tokens: estimatedInputTokens,
                output_tokens: Math.max(1, outputTokensCount),
                request_payload_summary: summarizeRequest(anthropicReq),
              });
            } catch (err: any) {
              streamController.error(err);
            }
          },
        });

        return new Response(outputStream, {
          status: 200,
          headers: {
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'anthropic-version': '2023-06-01',
          },
        });
      } else {
        // Non-streaming response
        clearTimeout(timeoutHandle);
        const json = await response.json();

        const anthropicRes = convertOpenAIToAnthropicResponse(json, requestedModel);
        const totalLatency = Date.now() - startTime;

        createRequestLog({
          requested_model: requestedModel,
          resolved_model: `${target.model_name} (${target.provider_name})`,
          provider_name: target.provider_name,
          status: fallbackCount > 0 ? 'fallback_success' : 'success',
          fallback_count: fallbackCount,
          latency_ms: totalLatency,
          input_tokens: anthropicRes.usage.input_tokens || estimatedInputTokens,
          output_tokens: anthropicRes.usage.output_tokens || 1,
          request_payload_summary: summarizeRequest(anthropicReq),
        });

        return Response.json(anthropicRes, {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'anthropic-version': '2023-06-01',
          },
        });
      }
    } catch (err: any) {
      clearTimeout(timeoutHandle);
      const isTimeout = err === 'timeout' || err?.name === 'AbortError';
      lastErrorMessage = isTimeout
        ? `Timeout after ${timeoutMs}ms`
        : (err?.message || 'Connection failed');
      continue;
    }
  }

  // If all fallbacks failed
  const totalDuration = Date.now() - startTime;
  createRequestLog({
    requested_model: requestedModel,
    resolved_model: 'None (All Failed)',
    provider_name: 'None',
    status: 'failed',
    fallback_count: fallbackCount,
    latency_ms: totalDuration,
    input_tokens: estimatedInputTokens,
    output_tokens: 0,
    error_message: lastErrorMessage,
    request_payload_summary: summarizeRequest(anthropicReq),
  });

  return Response.json(
    {
      type: 'error',
      error: {
        type: 'overloaded_error',
        message: `All ${candidateFallbacks.length} models in fallback chain failed. Last error: ${lastErrorMessage}`,
      },
    },
    {
      status: 503,
      headers: {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
      },
    }
  );
}

function summarizeRequest(req: AnthropicMessagesRequest): string {
  const lastMsg = req.messages?.[req.messages.length - 1];
  let snippet = '';
  if (typeof lastMsg?.content === 'string') {
    snippet = lastMsg.content.slice(0, 150);
  } else if (Array.isArray(lastMsg?.content)) {
    snippet = JSON.stringify(lastMsg.content[0] || {}).slice(0, 150);
  }
  return `${req.messages?.length || 0} msgs | ${req.tools?.length || 0} tools | "${snippet}..."`;
}
