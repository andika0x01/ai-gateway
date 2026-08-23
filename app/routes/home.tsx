import React, { useState, useEffect } from 'react';
import { Link } from 'react-router';
import { AppLayout } from '../components/layout/AppLayout';

export default function Home() {
  const [stats, setStats] = useState<any>(null);
  const [routes, setRoutes] = useState<any[]>([]);
  const [recentLogs, setRecentLogs] = useState<any[]>([]);

  const loadData = async () => {
    try {
      const [sRes, rRes, lRes] = await Promise.all([
        fetch('/api/stats').then((r) => r.json()),
        fetch('/api/routes').then((r) => r.json()),
        fetch('/api/logs?limit=8').then((r) => r.json()),
      ]);
      setStats(sRes);
      setRoutes(rRes);
      setRecentLogs(lRes.logs || []);
    } catch {}
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Metric Cards Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="p-4 rounded-lg border border-zinc-200 bg-white">
            <div className="text-xs text-zinc-500 font-medium">Total Requests</div>
            <div className="text-2xl font-semibold text-zinc-900 tracking-tight mt-1.5 font-mono">
              {stats?.totalRequests?.toLocaleString() ?? 0}
            </div>
            <div className="text-[11px] text-zinc-400 mt-1">
              Through gateway bridge
            </div>
          </div>

          <div className="p-4 rounded-lg border border-zinc-200 bg-white">
            <div className="text-xs text-zinc-500 font-medium">Direct / Fallback</div>
            <div className="text-2xl font-semibold text-zinc-900 tracking-tight mt-1.5 flex items-baseline gap-1 font-mono">
              <span>{stats?.successRequests ?? 0}</span>
              <span className="text-sm font-normal text-zinc-400">/ {stats?.fallbackRequests ?? 0}</span>
            </div>
            <div className="text-[11px] text-zinc-400 mt-1">
              Resolved upstream calls
            </div>
          </div>

          <div className="p-4 rounded-lg border border-zinc-200 bg-white">
            <div className="text-xs text-zinc-500 font-medium">Avg Latency</div>
            <div className="text-2xl font-semibold text-zinc-900 tracking-tight mt-1.5 flex items-baseline gap-1 font-mono">
              <span>{stats?.avgLatencyMs ?? 0}</span>
              <span className="text-xs font-normal text-zinc-400">ms</span>
            </div>
            <div className="text-[11px] text-zinc-400 mt-1">
              End-to-end response time
            </div>
          </div>

          <div className="p-4 rounded-lg border border-zinc-200 bg-white">
            <div className="text-xs text-zinc-500 font-medium">Active Providers</div>
            <div className="text-2xl font-semibold text-zinc-900 tracking-tight mt-1.5 flex items-baseline gap-1 font-mono">
              <span>{stats?.activeProviders ?? 0}</span>
              <span className="text-xs font-normal text-zinc-400">({stats?.activeModels ?? 0} models)</span>
            </div>
            <div className="text-[11px] text-zinc-400 mt-1">
              Connected endpoints ready
            </div>
          </div>
        </div>

        {/* Fallback Chains Section */}
        <div className="border border-zinc-200 rounded-lg bg-white overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-200 flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-900">Fallback Routing Chains</span>
            <Link 
              to="/routes" 
              className="text-xs text-zinc-500 hover:text-zinc-900 transition-colors"
            >
              Manage chains
            </Link>
          </div>

          <div className="divide-y divide-zinc-100 text-xs">
            {routes.length === 0 ? (
              <div className="p-6 text-center text-zinc-400">
                No fallback routes configured yet.{' '}
                <Link to="/routes" className="text-zinc-900 underline underline-offset-2">
                  Create your first route
                </Link>
              </div>
            ) : (
              routes.map((r) => (
                <div key={r.id} className="p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono font-semibold text-zinc-900">
                        {r.requested_model}
                      </span>
                      <span className="text-[11px] text-zinc-400">
                        ({r.timeout_ms}ms timeout)
                      </span>
                    </div>
                    {r.description && (
                      <p className="text-xs text-zinc-500">{r.description}</p>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    {r.fallbacks.map((fb: any, idx: number) => (
                      <React.Fragment key={fb.id}>
                        {idx > 0 && <span className="text-zinc-400">→</span>}
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-zinc-50 border border-zinc-200 text-zinc-800 text-xs">
                          <span className="text-zinc-400 font-mono text-[11px]">{idx + 1}.</span>
                          <span className="font-mono text-zinc-900">{fb.model_name}</span>
                          <span className="text-[11px] text-zinc-400">({fb.provider_name})</span>
                        </div>
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Recent Traffic & Intercepts */}
        <div className="border border-zinc-200 rounded-lg bg-white overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-200 flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-900">Recent Intercepts</span>
            <Link 
              to="/logs" 
              className="text-xs text-zinc-500 hover:text-zinc-900 transition-colors"
            >
              All logs
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs min-w-[550px]">
              <thead className="bg-zinc-50 text-zinc-500 border-b border-zinc-200 font-medium">
                <tr>
                  <th className="py-2.5 px-4 text-[11px] uppercase tracking-wider">Time</th>
                  <th className="py-2.5 px-4 text-[11px] uppercase tracking-wider">Requested</th>
                  <th className="py-2.5 px-4 text-[11px] uppercase tracking-wider">Resolved Target</th>
                  <th className="py-2.5 px-4 text-[11px] uppercase tracking-wider">Status</th>
                  <th className="py-2.5 px-4 text-[11px] uppercase tracking-wider text-right">Latency</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {recentLogs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-zinc-400 text-xs">
                      No logs recorded yet.
                    </td>
                  </tr>
                ) : (
                  recentLogs.map((l) => (
                    <tr key={l.id} className="hover:bg-zinc-50 transition-colors">
                      <td className="py-2.5 px-4 font-mono text-[11px] text-zinc-400 whitespace-nowrap">
                        {new Date(l.timestamp).toLocaleTimeString()}
                      </td>
                      <td className="py-2.5 px-4 font-mono text-xs font-medium text-zinc-900">
                        {l.requested_model}
                      </td>
                      <td className="py-2.5 px-4 font-mono text-xs text-zinc-600">
                        {l.resolved_model}
                      </td>
                      <td className="py-2.5 px-4">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[10px] font-medium uppercase ${
                            l.status === 'success'
                              ? 'bg-zinc-100 text-zinc-800'
                              : l.status === 'fallback_success'
                              ? 'bg-zinc-900 text-white'
                              : 'bg-red-50 text-red-700'
                          }`}
                        >
                          {l.status === 'fallback_success' ? 'Fallback' : l.status === 'success' ? 'Direct' : 'Failed'}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono text-xs text-zinc-600 whitespace-nowrap">
                        {l.latency_ms}ms
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
