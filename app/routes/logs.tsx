import React, { useState, useEffect } from 'react';
import { AppLayout } from '../components/layout/AppLayout';
import { RefreshCw, Trash2 } from 'lucide-react';

interface RequestLog {
  id: string;
  timestamp: string;
  requested_model: string;
  resolved_model: string;
  provider_name: string;
  status: 'success' | 'fallback_success' | 'failed';
  fallback_count: number;
  latency_ms: number;
  input_tokens: number;
  output_tokens: number;
  error_message: string | null;
  request_payload_summary: string | null;
}

export default function LogsPage() {
  const [logs, setLogs] = useState<RequestLog[]>([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(false);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/logs?limit=100&status=${statusFilter}`);
      const data = await res.json();
      setLogs(data.logs || []);
    } catch {} finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [statusFilter]);

  const handleClear = async () => {
    if (!confirm('Clear all recorded request logs?')) return;
    await fetch('/api/logs', { method: 'DELETE' });
    fetchLogs();
  };

  const formatLatency = (ms: number) => {
    if (!ms && ms !== 0) return '-';
    if (ms >= 1000) {
      return `${(ms / 1000).toFixed(2)}s`;
    }
    return `${ms}ms`;
  };

  const parseTargetModel = (resolved: string) => {
    if (!resolved || resolved.startsWith('None')) {
      return { model: 'None', provider: null };
    }
    const match = resolved.match(/^(.*?)\s*\((.*?)\)$/);
    if (match) {
      return { model: match[1], provider: match[2] };
    }
    return { model: resolved, provider: null };
  };

  return (
    <AppLayout>
      <div className="space-y-5">
        {/* Header & Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold text-zinc-900 tracking-tight">Request Logs</h1>
            <p className="text-xs text-zinc-500 mt-0.5">
              Traffic history and performance metrics across all models
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Status Segment Filter */}
            <div className="flex items-center bg-zinc-100/80 p-0.5 rounded-lg border border-zinc-200/60 text-xs">
              {[
                { id: 'all', label: 'All' },
                { id: 'success', label: 'Direct' },
                { id: 'fallback_success', label: 'Fallback' },
                { id: 'failed', label: 'Failed' },
              ].map((f) => (
                <button
                  key={f.id}
                  onClick={() => setStatusFilter(f.id)}
                  className={`px-3 py-1 rounded-md transition-all cursor-pointer ${
                    statusFilter === f.id
                      ? 'bg-white text-zinc-900 shadow-2xs font-semibold'
                      : 'text-zinc-600 hover:text-zinc-900'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1">
              <button
                onClick={fetchLogs}
                disabled={loading}
                className="p-1.5 text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100 rounded-md transition-colors cursor-pointer"
                title="Refresh logs"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              </button>
              <button
                onClick={handleClear}
                className="p-1.5 text-zinc-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors cursor-pointer"
                title="Clear logs"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Full-width Refined Data Table */}
        <div className="border border-zinc-200/80 rounded-xl bg-white shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs min-w-[720px]">
              <thead className="bg-zinc-50/75 border-b border-zinc-100 text-zinc-500 font-medium">
                <tr>
                  <th className="py-2.5 px-4 text-[11px] uppercase tracking-wider font-medium">Time</th>
                  <th className="py-2.5 px-4 text-[11px] uppercase tracking-wider font-medium">Requested Model</th>
                  <th className="py-2.5 px-4 text-[11px] uppercase tracking-wider font-medium">Target Model</th>
                  <th className="py-2.5 px-4 text-[11px] uppercase tracking-wider font-medium">Status</th>
                  <th className="py-2.5 px-4 text-[11px] uppercase tracking-wider font-medium">Tokens</th>
                  <th className="py-2.5 px-4 text-[11px] uppercase tracking-wider font-medium text-right">Latency</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {logs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-zinc-400">
                      No request logs recorded yet.
                    </td>
                  </tr>
                ) : (
                  logs.map((l) => {
                    const { model, provider } = parseTargetModel(l.resolved_model);
                    return (
                      <tr key={l.id} className="hover:bg-zinc-50/70 transition-colors">
                        {/* Time */}
                        <td className="py-2.5 px-4 font-mono text-[11px] text-zinc-400 whitespace-nowrap">
                          {new Date(l.timestamp).toLocaleTimeString()}
                        </td>

                        {/* Requested Model */}
                        <td className="py-2.5 px-4 font-mono text-xs font-semibold text-zinc-900">
                          {l.requested_model}
                        </td>

                        {/* Target Model & Error */}
                        <td className="py-2.5 px-4 max-w-xs sm:max-w-md">
                          <div className="flex items-center gap-1.5 overflow-hidden">
                            <span className="font-mono text-xs text-zinc-700 truncate">
                              {model}
                            </span>
                            {provider && (
                              <span className="text-[11px] text-zinc-400 font-sans shrink-0">
                                ({provider})
                              </span>
                            )}
                          </div>
                          {l.error_message && (
                            <div className="text-[11px] text-rose-600 font-sans truncate mt-0.5">
                              {l.error_message}
                            </div>
                          )}
                        </td>

                        {/* Status */}
                        <td className="py-2.5 px-4 whitespace-nowrap">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium ${
                              l.status === 'success'
                                ? 'bg-zinc-100 text-zinc-700'
                                : l.status === 'fallback_success'
                                ? 'bg-blue-50 text-blue-700 border border-blue-200/60'
                                : 'bg-rose-50 text-rose-700 border border-rose-200/60'
                            }`}
                          >
                            {l.status === 'fallback_success'
                              ? `Fallback (${l.fallback_count})`
                              : l.status === 'success'
                              ? 'Direct'
                              : 'Failed'}
                          </span>
                        </td>

                        {/* Tokens */}
                        <td className="py-2.5 px-4 font-mono text-xs text-zinc-600 whitespace-nowrap">
                          <span>{l.input_tokens}</span>
                          <span className="text-zinc-300 mx-1">/</span>
                          <span>{l.output_tokens}</span>
                        </td>

                        {/* Latency */}
                        <td className="py-2.5 px-4 text-right font-mono text-xs text-zinc-600 whitespace-nowrap">
                          {formatLatency(l.latency_ms)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
