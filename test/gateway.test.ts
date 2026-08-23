process.env.DB_PATH = 'data/test-gateway.db';
import assert from 'node:assert';
import { test, describe } from 'node:test';
import { convertAnthropicToOpenAI } from '../app/server/adapters/anthropic-to-openai';
import {
  convertOpenAIToAnthropicResponse,
  OpenAISSEStreamTransformer,
} from '../app/server/adapters/openai-to-anthropic';
import { estimateAnthropicTokens } from '../app/server/adapters/tokenizer';
import {
  getAllProviders,
  getAllModels,
  getAllRouteRules,
  getRouteRuleForRequestedModel,
  getGatewayStats,
} from '../app/server/db/repository';

describe('1. Anthropic to OpenAI Request Adapter', () => {
  test('converts system prompt, messages, and tools accurately', () => {
    const anthropicReq = {
      model: 'claude-3-7-sonnet-20250219',
      system: 'You are an expert programmer.',
      messages: [
        { role: 'user' as const, content: 'List files in current directory' },
        {
          role: 'assistant' as const,
          content: [
            {
              type: 'tool_use' as const,
              id: 'toolu_123',
              name: 'list_files',
              input: { path: './' },
            },
          ],
        },
        {
          role: 'user' as const,
          content: [
            {
              type: 'tool_result' as const,
              tool_use_id: 'toolu_123',
              content: 'file1.txt\nfile2.ts',
            },
          ],
        },
      ],
      tools: [
        {
          name: 'list_files',
          description: 'Lists files in a directory',
          input_schema: {
            type: 'object' as const,
            properties: {
              path: { type: 'string', description: 'Directory path' },
            },
            required: ['path'],
          },
        },
      ],
      tool_choice: { type: 'auto' as const },
      max_tokens: 4096,
    };

    const openAIReq = convertAnthropicToOpenAI(anthropicReq, 'meta/llama-3.3-70b-instruct');

    // Verify model name mapped to target
    assert.strictEqual(openAIReq.model, 'meta/llama-3.3-70b-instruct');

    // Verify system message
    assert.strictEqual(openAIReq.messages[0].role, 'system');
    assert.strictEqual(openAIReq.messages[0].content, 'You are an expert programmer.');

    // Verify user message 1
    assert.strictEqual(openAIReq.messages[1].role, 'user');
    assert.strictEqual(openAIReq.messages[1].content, 'List files in current directory');

    // Verify assistant tool_use message
    assert.strictEqual(openAIReq.messages[2].role, 'assistant');
    assert.ok(openAIReq.messages[2].tool_calls);
    assert.strictEqual(openAIReq.messages[2].tool_calls[0].id, 'toolu_123');
    assert.strictEqual(openAIReq.messages[2].tool_calls[0].function.name, 'list_files');
    assert.strictEqual(
      openAIReq.messages[2].tool_calls[0].function.arguments,
      JSON.stringify({ path: './' })
    );

    // Verify tool_result message
    assert.strictEqual(openAIReq.messages[3].role, 'tool');
    assert.strictEqual(openAIReq.messages[3].tool_call_id, 'toolu_123');
    assert.strictEqual(openAIReq.messages[3].content, 'file1.txt\nfile2.ts');

    // Verify tool schema definition
    assert.ok(openAIReq.tools);
    assert.strictEqual(openAIReq.tools[0].type, 'function');
    assert.strictEqual(openAIReq.tools[0].function.name, 'list_files');
    assert.strictEqual(openAIReq.tools[0].function.description, 'Lists files in a directory');
    assert.strictEqual(openAIReq.tool_choice, 'auto');
  });
});

describe('2. OpenAI to Anthropic Response & SSE Stream Adapter', () => {
  test('converts non-streaming response with tool calls and reasoning', () => {
    const openAIRes = {
      id: 'chatcmpl-test-123',
      object: 'chat.completion' as const,
      created: 1700000000,
      model: 'deepseek-ai/deepseek-r1',
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant' as const,
            content: 'Here is your file list.',
            reasoning_content: 'User wants to list directory files. Using tool.',
            tool_calls: [
              {
                id: 'call_abc',
                type: 'function' as const,
                function: {
                  name: 'list_files',
                  arguments: '{"path":"/app"}',
                },
              },
            ],
          },
          finish_reason: 'tool_calls' as const,
        },
      ],
      usage: {
        prompt_tokens: 45,
        completion_tokens: 28,
        total_tokens: 73,
      },
    };

    const anthropicRes = convertOpenAIToAnthropicResponse(
      openAIRes,
      'claude-3-7-sonnet-20250219'
    );

    assert.strictEqual(anthropicRes.model, 'claude-3-7-sonnet-20250219');
    assert.strictEqual(anthropicRes.stop_reason, 'tool_use');
    assert.strictEqual(anthropicRes.content.length, 3);

    // 1st block: thinking
    assert.strictEqual(anthropicRes.content[0].type, 'thinking');
    assert.strictEqual(
      (anthropicRes.content[0] as any).thinking,
      'User wants to list directory files. Using tool.'
    );

    // 2nd block: text
    assert.strictEqual(anthropicRes.content[1].type, 'text');
    assert.strictEqual((anthropicRes.content[1] as any).text, 'Here is your file list.');

    // 3rd block: tool_use
    assert.strictEqual(anthropicRes.content[2].type, 'tool_use');
    assert.strictEqual((anthropicRes.content[2] as any).id, 'call_abc');
    assert.strictEqual((anthropicRes.content[2] as any).name, 'list_files');
    assert.deepStrictEqual((anthropicRes.content[2] as any).input, { path: '/app' });
  });

  test('converts streaming SSE chunks into Anthropic events in proper sequence', () => {
    const transformer = new OpenAISSEStreamTransformer('claude-3-7-sonnet-20250219', 100);
    const events: string[] = [];

    // Chunk 1: Reasoning content (DeepSeek-R1 / NIM)
    const chunk1 = {
      id: 'chunk_1',
      object: 'chat.completion.chunk' as const,
      created: 1700000000,
      model: 'deepseek-r1',
      choices: [
        {
          index: 0,
          delta: { reasoning_content: 'Analyzing request...' },
          finish_reason: null,
        },
      ],
    };
    for (const ev of transformer.processChunk(chunk1)) events.push(ev);

    // Chunk 2: Regular text
    const chunk2 = {
      id: 'chunk_2',
      object: 'chat.completion.chunk' as const,
      created: 1700000000,
      model: 'deepseek-r1',
      choices: [
        {
          index: 0,
          delta: { content: 'Hello from gateway!' },
          finish_reason: null,
        },
      ],
    };
    for (const ev of transformer.processChunk(chunk2)) events.push(ev);

    // Finalize
    for (const ev of transformer.finalize()) events.push(ev);

    const fullStreamText = events.join('');

    // Must contain message_start
    assert.ok(fullStreamText.includes('event: message_start'));
    // Must contain thinking content block start and delta
    assert.ok(fullStreamText.includes('"type":"thinking"'));
    assert.ok(fullStreamText.includes('Analyzing request...'));
    // Must contain text content block start and delta
    assert.ok(fullStreamText.includes('"type":"text"'));
    assert.ok(fullStreamText.includes('Hello from gateway!'));
    // Must contain message_delta and message_stop
    assert.ok(fullStreamText.includes('event: message_delta'));
    assert.ok(fullStreamText.includes('event: message_stop'));
  });
});

describe('3. Token Estimation and Database Repository', () => {
  test('estimates tokens accurately for message with tools', () => {
    const req = {
      model: 'claude-3-7-sonnet-20250219',
      system: 'You are an AI assistant.',
      messages: [{ role: 'user' as const, content: 'How do I sort an array?' }],
      tools: [
        {
          name: 'sort_array',
          description: 'Sorts an array',
          input_schema: { type: 'object' as const, properties: { arr: { type: 'array' } } },
        },
      ],
    };

    const tokens = estimateAnthropicTokens(req);
    assert.ok(tokens > 10 && tokens < 200, `Estimated tokens was ${tokens}`);
  });

  test('database repository initializes with default seeds and route rules', () => {
    const providers = getAllProviders();
    assert.ok(providers.length >= 1, 'Should have seeded providers');

    const models = getAllModels();
    assert.ok(models.length >= 1, 'Should have seeded models');

    const routes = getAllRouteRules();
    assert.ok(routes.length >= 1, 'Should have seeded route rules');

    const sonnetRule = getRouteRuleForRequestedModel('claude-3-7-sonnet-20250219');
    assert.ok(sonnetRule, 'Claude 3.7 Sonnet route rule should be found');

    const stats = getGatewayStats();
    assert.ok(stats.activeProviders >= 1);
  });
});
