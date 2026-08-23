process.env.DB_PATH = 'data/test-fallback.db';
import assert from 'node:assert';
import { test, describe, before, after } from 'node:test';
import http from 'node:http';
import { handleMessagesRequest } from '../app/server/gateway/router';
import {
  createProvider,
  createModel,
  createRouteRule,
  deleteProvider,
  deleteRouteRule,
  getRequestLogs,
} from '../app/server/db/repository';

describe('4. Auto-Fallback Engine End-to-End', () => {
  let server1: http.Server;
  let server2: http.Server;
  const port1 = 9181;
  const port2 = 9182;

  let provider1Id: string;
  let provider2Id: string;
  let model1Id: string;
  let model2Id: string;
  let routeRuleId: string;

  before(async () => {
    // Server 1: Mock server that fails with 500 error
    server1 = http.createServer((req, res) => {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'Internal upstream error' } }));
    });
    await new Promise<void>((resolve) => server1.listen(port1, resolve));

    // Server 2: Mock server that succeeds with valid OpenAI stream
    server2 = http.createServer((req, res) => {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });
      res.write(
        'data: {"id":"chatcmpl-fb2","object":"chat.completion.chunk","created":1700000000,"model":"backup-model","choices":[{"index":0,"delta":{"content":"Success from Backup Model 2!"},"finish_reason":null}]}\n\n'
      );
      res.write(
        'data: {"id":"chatcmpl-fb2","object":"chat.completion.chunk","created":1700000000,"model":"backup-model","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n'
      );
      res.write('data: [DONE]\n\n');
      res.end();
    });
    await new Promise<void>((resolve) => server2.listen(port2, resolve));

    // Create test providers in database
    const p1 = createProvider({
      name: 'Failing Provider 1',
      type: 'custom',
      base_url: `http://localhost:${port1}/v1`,
      api_key: 'test1',
    });
    provider1Id = p1.id;

    const p2 = createProvider({
      name: 'Backup Provider 2',
      type: 'custom',
      base_url: `http://localhost:${port2}/v1`,
      api_key: 'test2',
    });
    provider2Id = p2.id;

    const m1 = createModel({
      provider_id: provider1Id,
      model_name: 'failing-model-1',
      display_name: 'Failing Model 1',
      supports_tools: true,
    });
    model1Id = m1.id;

    const m2 = createModel({
      provider_id: provider2Id,
      model_name: 'backup-model-2',
      display_name: 'Backup Model 2',
      supports_tools: true,
    });
    model2Id = m2.id;

    const route = createRouteRule({
      requested_model: 'claude-test-fallback-model',
      description: 'Test Failover Route',
      timeout_ms: 5000,
      model_ids: [model1Id, model2Id],
    });
    routeRuleId = route.id;
  });

  after(async () => {
    server1.close();
    server2.close();
    deleteRouteRule(routeRuleId);
    deleteProvider(provider1Id);
    deleteProvider(provider2Id);
  });

  test('transparently fails over from failing provider 1 to backup provider 2', async () => {
    const response = await handleMessagesRequest({
      model: 'claude-test-fallback-model',
      messages: [{ role: 'user', content: 'Hello fallback test' }],
      stream: true,
    });

    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.headers.get('Content-Type'), 'text/event-stream; charset=utf-8');

    // Read stream output
    const text = await response.text();
    assert.ok(text.includes('event: message_start'));
    assert.ok(text.includes('Success from Backup Model 2!'));
    assert.ok(text.includes('event: message_stop'));

    // Check log recorded fallback_success
    const { logs } = getRequestLogs(5);
    const lastLog = logs.find((l) => l.requested_model === 'claude-test-fallback-model');
    assert.ok(lastLog, 'Log should be recorded');
    assert.strictEqual(lastLog!.status, 'fallback_success');
    assert.strictEqual(lastLog!.fallback_count, 1);
  });
});
