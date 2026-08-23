import React, { useState } from 'react';
import { AppLayout } from '../components/layout/AppLayout';
import { Copy, Check } from 'lucide-react';

export default function SetupPage() {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:1337';

  const bash = `export ANTHROPIC_BASE_URL="${origin}"
export ANTHROPIC_API_KEY="gateway"
claude`;

  const pwsh = `$env:ANTHROPIC_BASE_URL="${origin}"
$env:ANTHROPIC_API_KEY="gateway"
claude`;

  const cmd = `set ANTHROPIC_BASE_URL=${origin}
set ANTHROPIC_API_KEY=gateway
claude`;

  return (
    <AppLayout>
      <div className="max-w-3xl space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-lg font-semibold text-zinc-900 tracking-tight">Claude Code CLI Setup</h1>
          <p className="text-xs text-zinc-500 mt-0.5">
            Configure environment variables to redirect Claude Code through this gateway
          </p>
        </div>

        {/* Snippet Cards */}
        <div className="space-y-4">
          {/* Bash / Zsh */}
          <div className="border border-zinc-200 rounded-lg bg-white overflow-hidden">
            <div className="px-4 py-2.5 bg-zinc-50 border-b border-zinc-200 flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-800">macOS / Linux / WSL (Bash & Zsh)</span>
              <button
                onClick={() => copy(bash, 'bash')}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-zinc-700 bg-white hover:bg-zinc-50 border border-zinc-200 rounded transition-colors cursor-pointer"
              >
                {copiedId === 'bash' ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-zinc-900" />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-zinc-400" />
                    <span>Copy</span>
                  </>
                )}
              </button>
            </div>
            <pre className="p-4 bg-zinc-950 text-zinc-100 font-mono text-xs overflow-x-auto leading-relaxed">
              <code>{bash}</code>
            </pre>
          </div>

          {/* PowerShell */}
          <div className="border border-zinc-200 rounded-lg bg-white overflow-hidden">
            <div className="px-4 py-2.5 bg-zinc-50 border-b border-zinc-200 flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-800">Windows PowerShell</span>
              <button
                onClick={() => copy(pwsh, 'pwsh')}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-zinc-700 bg-white hover:bg-zinc-50 border border-zinc-200 rounded transition-colors cursor-pointer"
              >
                {copiedId === 'pwsh' ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-zinc-900" />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-zinc-400" />
                    <span>Copy</span>
                  </>
                )}
              </button>
            </div>
            <pre className="p-4 bg-zinc-950 text-zinc-100 font-mono text-xs overflow-x-auto leading-relaxed">
              <code>{pwsh}</code>
            </pre>
          </div>

          {/* Command Prompt */}
          <div className="border border-zinc-200 rounded-lg bg-white overflow-hidden">
            <div className="px-4 py-2.5 bg-zinc-50 border-b border-zinc-200 flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-800">Windows Command Prompt (CMD)</span>
              <button
                onClick={() => copy(cmd, 'cmd')}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-zinc-700 bg-white hover:bg-zinc-50 border border-zinc-200 rounded transition-colors cursor-pointer"
              >
                {copiedId === 'cmd' ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-zinc-900" />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-zinc-400" />
                    <span>Copy</span>
                  </>
                )}
              </button>
            </div>
            <pre className="p-4 bg-zinc-950 text-zinc-100 font-mono text-xs overflow-x-auto leading-relaxed">
              <code>{cmd}</code>
            </pre>
          </div>
        </div>

        {/* Verification Card */}
        <div className="border border-zinc-200 rounded-lg p-4 sm:p-5 bg-white space-y-2.5">
          <div className="text-xs font-semibold text-zinc-900">
            How it works
          </div>
          <ol className="text-xs text-zinc-600 space-y-1.5 list-decimal list-inside leading-relaxed">
            <li>
              Claude Code CLI sends requests to <code className="font-mono text-[11px] bg-zinc-100 px-1 py-0.5 rounded text-zinc-800">{origin}/v1/messages</code>.
            </li>
            <li>
              The gateway translates Anthropic schema, thinking tokens, and tools into OpenAI chat completion specifications.
            </li>
            <li>
              If an upstream server times out or fails, the gateway automatically falls back through your priority chain.
            </li>
          </ol>
        </div>
      </div>
    </AppLayout>
  );
}
