import React, { useState, useEffect } from 'react';
import { AppLayout } from '../components/layout/AppLayout';
import { ANTHROPIC_OFFICIAL_MODELS } from '../server/constants/anthropic-models';

export default function PlaygroundPage() {
  const [model, setModel] = useState('claude-3-7-sonnet-20250219');
  const [anthropicModels, setAnthropicModels] = useState<any[]>(ANTHROPIC_OFFICIAL_MODELS);
  const [systemPrompt, setSystemPrompt] = useState('You are a concise programming assistant.');
  const [userPrompt, setUserPrompt] = useState('Write a binary search algorithm in TypeScript.');
  const [enableThinking, setEnableThinking] = useState(true);
  const [enableTools, setEnableTools] = useState(false);
  const [streaming, setStreaming] = useState(false);

  useEffect(() => {
    fetch('/api/anthropic-models')
      .then((r) => r.json())
      .then((data) => {
        if (data?.models && Array.isArray(data.models) && data.models.length > 0) {
          setAnthropicModels(data.models);
        }
      })
      .catch(() => {});
  }, []);

  const [thinking, setThinking] = useState('');
  const [content, setContent] = useState('');
  const [toolCalls, setToolCalls] = useState<any[]>([]);
  const [stats, setStats] = useState<{ ttft?: number; total?: number; tokens?: number } | null>(null);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userPrompt.trim() || streaming) return;

    setStreaming(true);
    setThinking('');
    setContent('');
    setToolCalls([]);
    setStats(null);

    const start = Date.now();
    let gotFirstToken = false;

    try {
      const payload: any = {
        model,
        messages: [{ role: 'user', content: userPrompt }],
        system: systemPrompt,
        stream: true,
      };

      if (enableThinking) {
        payload.thinking = { type: 'enabled', budget_tokens: 2048 };
        payload.max_tokens = 4096;
      }

      if (enableTools) {
        payload.tools = [
          {
            name: 'execute_query',
            description: 'Executes a database query',
            input_schema: {
              type: 'object',
              properties: { query: { type: 'string' } },
              required: ['query'],
            },
          },
        ];
      }

      const res = await fetch('/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'anthropic-version': '2023-06-01' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        setContent(`HTTP ${res.status}: ${await res.text()}`);
        setStreaming(false);
        return;
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) return;

      let buffer = '';
      let curThink = '';
      let curText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        if (!gotFirstToken) {
          gotFirstToken = true;
          setStats((prev) => ({ ...prev, ttft: Date.now() - start }));
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('data: ')) {
            const data = trimmed.slice(6).trim();
            if (data === '[DONE]') continue;
            try {
              const ev = JSON.parse(data);
              if (ev.type === 'content_block_delta') {
                if (ev.delta?.type === 'thinking_delta') {
                  curThink += ev.delta.thinking;
                  setThinking(curThink);
                } else if (ev.delta?.type === 'text_delta') {
                  curText += ev.delta.text;
                  setContent(curText);
                }
              } else if (ev.type === 'content_block_start') {
                if (ev.content_block?.type === 'tool_use') {
                  setToolCalls((prev) => [...prev, ev.content_block]);
                }
              } else if (ev.type === 'message_delta' && ev.usage?.output_tokens) {
                setStats((prev) => ({ ...prev, tokens: ev.usage.output_tokens }));
              }
            } catch {}
          }
        }
      }

      setStats((prev) => ({ ...prev, total: Date.now() - start }));
    } catch (err: any) {
      setContent(`Error: ${err?.message}`);
    } finally {
      setStreaming(false);
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-lg font-semibold text-zinc-900 tracking-tight">Gateway Playground</h1>
          <p className="text-xs text-zinc-500 mt-0.5">
            Test /v1/messages streaming, thinking tokens, and tool use
          </p>
        </div>

        {/* 2-Column Responsive Playground */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Controls Form */}
          <form
            onSubmit={handleSend}
            className="lg:col-span-5 border border-zinc-200 rounded-lg p-4 sm:p-5 bg-white space-y-3.5"
          >
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-zinc-700 uppercase tracking-wider">
                Target Model
              </label>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-full px-2.5 py-1.5 border border-zinc-200 rounded font-mono text-xs text-zinc-900 bg-white focus:outline-none focus:border-zinc-900"
              >
                {['Claude 5', 'Claude 4.x', 'Claude 3.7', 'Claude 3.5', 'Claude 3'].map((cat) => {
                  const list = anthropicModels.filter((m) => m.category === cat);
                  if (list.length === 0) return null;
                  return (
                    <optgroup key={cat} label={cat}>
                      {list.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.id}
                        </option>
                      ))}
                    </optgroup>
                  );
                })}
              </select>
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-semibold text-zinc-700 uppercase tracking-wider">
                System Prompt
              </label>
              <textarea
                rows={2}
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                placeholder="Optional system context instructions..."
                className="w-full px-2.5 py-1.5 border border-zinc-200 rounded text-xs font-sans text-zinc-900 focus:outline-none focus:border-zinc-900"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-semibold text-zinc-700 uppercase tracking-wider">
                User Prompt
              </label>
              <textarea
                rows={4}
                required
                value={userPrompt}
                onChange={(e) => setUserPrompt(e.target.value)}
                placeholder="Type your message here..."
                className="w-full px-2.5 py-1.5 border border-zinc-200 rounded text-xs font-sans text-zinc-900 focus:outline-none focus:border-zinc-900"
              />
            </div>

            <div className="space-y-1.5 border border-zinc-200 p-2.5 rounded bg-zinc-50 text-xs">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  id="pg-think"
                  checked={enableThinking}
                  onChange={(e) => setEnableThinking(e.target.checked)}
                />
                <span className="text-zinc-800">
                  Enable Reasoning Tokens (<code className="font-mono text-[11px]">thinking</code>)
                </span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  id="pg-tools"
                  checked={enableTools}
                  onChange={(e) => setEnableTools(e.target.checked)}
                />
                <span className="text-zinc-800">
                  Pass Mock Tool Definition (<code className="font-mono text-[11px]">execute_query</code>)
                </span>
              </label>
            </div>

            <button
              type="submit"
              disabled={streaming}
              className="w-full py-2 px-4 bg-zinc-900 hover:bg-zinc-800 disabled:opacity-50 text-white font-medium text-xs rounded transition-colors cursor-pointer"
            >
              {streaming ? 'Streaming...' : 'Send Request'}
            </button>
          </form>

          {/* Stream Output Console */}
          <div className="lg:col-span-7 border border-zinc-200 rounded-lg p-4 sm:p-5 bg-white min-h-[440px] flex flex-col justify-between space-y-4">
            <div className="space-y-3">
              {/* Output Header with Stats */}
              <div className="flex flex-wrap items-center justify-between pb-2 border-b border-zinc-100 gap-2">
                <span className="text-xs font-semibold text-zinc-900">Stream Output</span>

                {stats && (
                  <div className="flex items-center gap-2 text-[11px] font-mono text-zinc-500">
                    {stats.ttft && (
                      <span>TTFT: {stats.ttft}ms</span>
                    )}
                    {stats.total && (
                      <span>| Total: {stats.total}ms</span>
                    )}
                    {stats.tokens && (
                      <span>| {stats.tokens} tokens</span>
                    )}
                  </div>
                )}
              </div>

              {/* Thinking Box */}
              {thinking && (
                <div className="p-3 bg-zinc-50 border border-zinc-200 rounded text-zinc-700 text-xs space-y-1 max-h-48 overflow-y-auto">
                  <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">
                    Reasoning Process:
                  </div>
                  <div className="font-mono text-[11px] text-zinc-700 whitespace-pre-wrap">
                    {thinking}
                  </div>
                </div>
              )}

              {/* Tool Calls Box */}
              {toolCalls.length > 0 && (
                <div className="p-3 bg-zinc-50 border border-zinc-200 rounded text-xs space-y-1">
                  <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">
                    Tool Invocation:
                  </div>
                  <pre className="font-mono text-[11px] text-zinc-800 overflow-x-auto">
                    {JSON.stringify(toolCalls, null, 2)}
                  </pre>
                </div>
              )}

              {/* Response Text */}
              <div className="text-zinc-900 text-xs whitespace-pre-wrap font-mono leading-relaxed pt-1">
                {content ? (
                  content
                ) : (
                  <span className="text-zinc-400 font-sans italic">
                    {streaming ? 'Waiting for first token...' : 'Click "Send Request" to stream response.'}
                  </span>
                )}
              </div>
            </div>

            {/* Console Footer */}
            <div className="pt-2 border-t border-zinc-100 flex items-center justify-between text-[11px] text-zinc-400 font-mono">
              <span>POST /v1/messages</span>
              <span>SSE Stream</span>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
