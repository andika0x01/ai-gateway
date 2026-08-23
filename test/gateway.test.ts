process.env.DB_PATH = 'data/test-gateway.db';
import assert from 'node:assert';
import { test, describe } from 'node:test';
import { convertAnthropicToOpenAI } from '../app/server/adapters/anthropic-to-openai';
import {
  convertOpenAIToAnthropicResponse,
  OpenAISSEStreamTransformer,
} from '../app/server/adapters/openai-to-anthropic';
import { cleanAndParseJSON, extractTextToolCalls } from '../app/server/adapters/json-repair';
import { estimateAnthropicTokens } from '../app/server/adapters/tokenizer';
import {
  getAllProviders,
  getAllModels,
  getAllRouteRules,
  getRouteRuleForRequestedModel,
  getGatewayStats,
} from '../app/server/db/repository';

describe('1. Anthropic to OpenAI Request Adapter', () => {
  test('converts system prompt, messages, and tools accurately with schema sanitization', () => {
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
            $schema: 'http://json-schema.org/draft-07/schema#',
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

    // Verify tool schema definition and $schema removal
    assert.ok(openAIReq.tools);
    assert.strictEqual(openAIReq.tools[0].type, 'function');
    assert.strictEqual(openAIReq.tools[0].function.name, 'list_files');
    assert.strictEqual(openAIReq.tools[0].function.description, 'Lists files in a directory');
    assert.strictEqual((openAIReq.tools[0].function.parameters as any).$schema, undefined);
    assert.strictEqual(openAIReq.tool_choice, 'auto');
  });
});

describe('2. JSON Repair & Text Tool Extractor', () => {
  test('repairs trailing commas, single quotes, and code fences', () => {
    const broken1 = '```json\n{"command": "ls -la", "flag": true,}\n```';
    assert.deepStrictEqual(cleanAndParseJSON(broken1), { command: 'ls -la', flag: true });

    const broken2 = "{'path': '/var/log', 'recursive': false}";
    assert.deepStrictEqual(cleanAndParseJSON(broken2), { path: '/var/log', recursive: false });
  });

  test('extracts text-based tool calls from markdown / XML / tag formats', () => {
    const text1 = 'I will run the command:\n<tool_call>\n{"name": "Bash", "arguments": {"command": "git status"}}\n</tool_call>';
    const tools1 = extractTextToolCalls(text1);
    assert.strictEqual(tools1.length, 1);
    assert.strictEqual(tools1[0].name, 'Bash');
    assert.deepStrictEqual(tools1[0].arguments, { command: 'git status' });

    const text2 = '[TOOL_CALLS] [{"name": "read_file", "arguments": {"path": "README.md"}}]';
    const tools2 = extractTextToolCalls(text2);
    assert.strictEqual(tools2.length, 1);
    assert.strictEqual(tools2[0].name, 'read_file');
    assert.deepStrictEqual(tools2[0].arguments, { path: 'README.md' });
  });
});

describe('3. OpenAI to Anthropic Response & SSE Stream Adapter', () => {
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

    // 2nd block: tool_use
    assert.strictEqual(anthropicRes.content[1].type, 'tool_use');
    assert.strictEqual((anthropicRes.content[1] as any).id, 'call_abc');
    assert.strictEqual((anthropicRes.content[1] as any).name, 'list_files');
    assert.deepStrictEqual((anthropicRes.content[1] as any).input, { path: '/app' });

    // 3rd block: text
    assert.strictEqual(anthropicRes.content[2].type, 'text');
    assert.strictEqual((anthropicRes.content[2] as any).text, 'Here is your file list.');
  });

  test('converts non-streaming response with text-based tool calls', () => {
    const openAIRes = {
      id: 'chatcmpl-test-r1',
      object: 'chat.completion' as const,
      created: 1700000000,
      model: 'deepseek-ai/deepseek-r1',
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant' as const,
            content: 'Running the bash command:\n<tool_call>\n{"name": "Bash", "arguments": {"command": "npm test"}}\n</tool_call>',
            reasoning_content: 'Let me run tests using Bash.',
          },
          finish_reason: 'stop' as const,
        },
      ],
      usage: {
        prompt_tokens: 30,
        completion_tokens: 20,
        total_tokens: 50,
      },
    };

    const anthropicRes = convertOpenAIToAnthropicResponse(
      openAIRes,
      'claude-3-7-sonnet-20250219'
    );

    assert.strictEqual(anthropicRes.stop_reason, 'tool_use');
    const toolBlock = anthropicRes.content.find((c) => c.type === 'tool_use');
    assert.ok(toolBlock);
    assert.strictEqual((toolBlock as any).name, 'Bash');
    assert.deepStrictEqual((toolBlock as any).input, { command: 'npm test' });
  });

  test('handles chunk containing BOTH reasoning_content and tool_calls (NVIDIA NIM fix)', () => {
    const transformer = new OpenAISSEStreamTransformer('claude-3-7-sonnet-20250219', 100);
    const events: string[] = [];

    // NVIDIA NIM chunk with reasoning_content and tool_calls in same chunk
    const chunk = {
      id: 'chunk_nim',
      object: 'chat.completion.chunk' as const,
      created: 1700000000,
      model: 'nvidia/nemotron-3-super-120b-a12b',
      choices: [
        {
          index: 0,
          delta: {
            role: 'assistant' as const,
            reasoning_content: '.\n',
            content: '',
            tool_calls: [
              {
                index: 0,
                id: 'call-nim-123',
                type: 'function' as const,
                function: { name: 'Bash', arguments: '{"command":"ls -la"}' },
              },
            ],
          },
          finish_reason: null,
        },
      ],
    };

    for (const ev of transformer.processChunk(chunk)) events.push(ev);
    for (const ev of transformer.finalize()) events.push(ev);

    const fullText = events.join('');
    // Both thinking and tool_use must be present
    assert.ok(fullText.includes('"type":"thinking"'));
    assert.ok(fullText.includes('thinking_delta'));
    assert.ok(fullText.includes('"type":"tool_use"'));
    assert.ok(fullText.includes('call-nim-123'));
    assert.ok(fullText.includes('Bash'));
    assert.ok(fullText.includes('ls -la'));
    assert.ok(fullText.includes('"stop_reason":"tool_use"'));
  });

  test('handles parallel tool calling with interleaved streaming chunks', () => {
    const transformer = new OpenAISSEStreamTransformer('claude-3-7-sonnet-20250219', 100);
    const events: string[] = [];

    const chunks = [
      {
        id: 'c1',
        object: 'chat.completion.chunk' as const,
        created: 1700000000,
        model: 'gpt-4o',
        choices: [
          {
            index: 0,
            delta: {
              tool_calls: [
                { index: 0, id: 'call_p1', type: 'function' as const, function: { name: 'view_a', arguments: '' } },
                { index: 1, id: 'call_p2', type: 'function' as const, function: { name: 'view_b', arguments: '' } },
              ],
            },
            finish_reason: null,
          },
        ],
      },
      {
        id: 'c2',
        object: 'chat.completion.chunk' as const,
        created: 1700000000,
        model: 'gpt-4o',
        choices: [
          {
            index: 0,
            delta: {
              tool_calls: [{ index: 0, function: { arguments: '{"file":"a.txt"}' } }],
            },
            finish_reason: null,
          },
        ],
      },
      {
        id: 'c3',
        object: 'chat.completion.chunk' as const,
        created: 1700000000,
        model: 'gpt-4o',
        choices: [
          {
            index: 0,
            delta: {
              tool_calls: [{ index: 1, function: { arguments: '{"file":"b.txt"}' } }],
            },
            finish_reason: null,
          },
        ],
      },
    ];

    for (const ch of chunks) {
      for (const ev of transformer.processChunk(ch)) events.push(ev);
    }
    for (const ev of transformer.finalize()) events.push(ev);

    const fullText = events.join('');
    assert.ok(fullText.includes('call_p1'));
    assert.ok(fullText.includes('view_a'));
    assert.ok(fullText.includes('a.txt'));
    assert.ok(fullText.includes('call_p2'));
    assert.ok(fullText.includes('view_b'));
    assert.ok(fullText.includes('b.txt'));
    assert.ok(fullText.includes('"stop_reason":"tool_use"'));
  });
});

describe('4. Token Estimation and Database Repository', () => {
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
