import React, { useState, useEffect } from 'react';
import { AppLayout } from '../components/layout/AppLayout';
import { Trash2, Edit2, X } from 'lucide-react';

interface Provider {
  id: string;
  name: string;
  type: string;
  base_url: string;
  api_key: string;
  custom_headers: string;
  enabled: number;
}

export default function ProvidersPage() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, any>>({});
  const [discoveringId, setDiscoveringId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Provider | null>(null);

  const [name, setName] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [customHeaders, setCustomHeaders] = useState('{}');
  const [enabled, setEnabled] = useState(true);

  const fetchProviders = async () => {
    try {
      const res = await fetch('/api/providers');
      setProviders(await res.json());
    } catch {}
  };

  useEffect(() => {
    fetchProviders();
  }, []);

  const openAdd = () => {
    setEditing(null);
    setName('Primary Upstream');
    setBaseUrl('http://localhost:8000/v1');
    setApiKey('');
    setCustomHeaders('{}');
    setEnabled(true);
    setModalOpen(true);
  };

  const openEdit = (p: Provider) => {
    setEditing(p);
    setName(p.name);
    setBaseUrl(p.base_url);
    setApiKey(p.api_key);
    setCustomHeaders(p.custom_headers || '{}');
    setEnabled(p.enabled === 1);
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    let parsedHeaders = {};
    try {
      parsedHeaders = JSON.parse(customHeaders);
    } catch {
      alert('Invalid JSON in custom headers');
      return;
    }

    const payload = {
      name,
      type: 'openai-compatible',
      base_url: baseUrl,
      api_key: apiKey,
      custom_headers: parsedHeaders,
      enabled,
    };

    if (editing) {
      await fetch(`/api/providers/${editing.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } else {
      await fetch('/api/providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    }

    setModalOpen(false);
    fetchProviders();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this upstream endpoint and its registered models?')) return;
    await fetch(`/api/providers/${id}`, { method: 'DELETE' });
    fetchProviders();
  };

  const handleTest = async (id: string) => {
    setTestingId(id);
    try {
      const res = await fetch(`/api/providers/${id}/test`, { method: 'POST' });
      const data = await res.json();
      setTestResults((prev) => ({ ...prev, [id]: data }));
    } catch (err: any) {
      setTestResults((prev) => ({ ...prev, [id]: { success: false, message: err?.message } }));
    } finally {
      setTestingId(null);
    }
  };

  const handleDiscover = async (id: string) => {
    setDiscoveringId(id);
    try {
      const res = await fetch(`/api/providers/${id}/discover-models`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        alert(`Discovered ${data.discovered_total} models (Added ${data.new_models_added} new to catalog).`);
      } else {
        alert(`Error: ${data.error}`);
      }
    } catch (err: any) {
      alert(`Failed: ${err?.message}`);
    } finally {
      setDiscoveringId(null);
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold text-zinc-900 tracking-tight">Upstream Endpoints</h1>
            <p className="text-xs text-zinc-500 mt-0.5">
              OpenAI-compatible inference backends (vLLM, SGLang, Ollama, NVIDIA NIM, TGI, etc.)
            </p>
          </div>
          <button
            onClick={openAdd}
            className="px-3.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-medium rounded shadow-2xs transition-colors cursor-pointer self-start sm:self-auto"
          >
            + Add Upstream
          </button>
        </div>

        {/* Upstream Cards List */}
        <div className="space-y-3">
          {providers.length === 0 ? (
            <div className="border border-zinc-200 rounded-lg bg-white p-8 text-center text-xs text-zinc-400">
              No upstream endpoints configured. Click "+ Add Upstream" to connect an OpenAI-compatible server.
            </div>
          ) : (
            providers.map((p) => {
              const tr = testResults[p.id];
              return (
                <div
                  key={p.id}
                  className="border border-zinc-200 rounded-lg bg-white p-4 sm:p-5 space-y-3"
                >
                  {/* Top Bar */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-zinc-900 text-sm">{p.name}</span>
                      <span className="text-[11px] px-2 py-0.5 rounded bg-zinc-100 text-zinc-600">
                        {p.enabled ? 'Active' : 'Disabled'}
                      </span>
                    </div>

                    {/* Toolbar Actions */}
                    <div className="flex items-center gap-1.5 self-start sm:self-auto text-xs">
                      <button
                        onClick={() => handleTest(p.id)}
                        disabled={testingId === p.id}
                        className="px-2.5 py-1 font-medium text-zinc-700 bg-white hover:bg-zinc-50 border border-zinc-200 rounded disabled:opacity-50 transition-colors cursor-pointer"
                      >
                        {testingId === p.id ? 'Testing...' : 'Health'}
                      </button>
                      <button
                        onClick={() => handleDiscover(p.id)}
                        disabled={discoveringId === p.id}
                        className="px-2.5 py-1 font-medium text-zinc-700 bg-white hover:bg-zinc-50 border border-zinc-200 rounded disabled:opacity-50 transition-colors cursor-pointer"
                      >
                        {discoveringId === p.id ? 'Syncing...' : 'Sync Models'}
                      </button>
                      <button
                        onClick={() => openEdit(p)}
                        className="p-1 text-zinc-400 hover:text-zinc-900 rounded transition-colors cursor-pointer"
                        title="Edit"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(p.id)}
                        className="p-1 text-zinc-400 hover:text-red-600 rounded transition-colors cursor-pointer"
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Metadata Row */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs bg-zinc-50 p-2.5 rounded border border-zinc-100">
                    <div className="flex items-center gap-2 overflow-hidden">
                      <span className="text-zinc-400 shrink-0">Base URL:</span>
                      <span className="font-mono text-zinc-800 text-[11px] truncate">{p.base_url}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-zinc-400 shrink-0">API Key:</span>
                      <span className="font-mono text-zinc-800 text-[11px]">
                        {p.api_key ? '••••' + p.api_key.slice(-4) : '(none / local)'}
                      </span>
                    </div>
                  </div>

                  {/* Test Result */}
                  {tr && (
                    <div
                      className={`p-2.5 rounded text-xs ${
                        tr.success
                          ? 'bg-zinc-50 text-zinc-800 border border-zinc-200'
                          : 'bg-red-50 text-red-800 border border-red-200'
                      }`}
                    >
                      <div className="font-medium">{tr.message}</div>
                      {tr.latency_ms && (
                        <div className="text-[11px] text-zinc-500 font-mono mt-0.5">
                          Latency: {tr.latency_ms}ms
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Add/Edit Modal */}
        {modalOpen && (
          <div className="fixed inset-0 z-50 bg-black/20 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg border border-zinc-200 shadow-lg max-w-lg w-full p-5 space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-zinc-100">
                <span className="font-semibold text-sm text-zinc-900">
                  {editing ? 'Edit Upstream Endpoint' : 'Add Upstream Endpoint'}
                </span>
                <button
                  onClick={() => setModalOpen(false)}
                  className="text-zinc-400 hover:text-zinc-600 p-1 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleSave} className="space-y-3 text-xs">
                <div className="space-y-1">
                  <label className="block font-medium text-zinc-700">Upstream Name / Label</label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Local vLLM, Primary NIM, Ollama"
                    className="w-full px-2.5 py-1.5 border border-zinc-200 rounded font-sans text-zinc-900 focus:outline-none focus:border-zinc-900"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block font-medium text-zinc-700">Base URL</label>
                  <input
                    type="url"
                    required
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}
                    placeholder="http://localhost:8000/v1"
                    className="w-full px-2.5 py-1.5 border border-zinc-200 rounded font-mono text-zinc-900 focus:outline-none focus:border-zinc-900"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block font-medium text-zinc-700">API Key (optional)</label>
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="Bearer token"
                    className="w-full px-2.5 py-1.5 border border-zinc-200 rounded font-mono text-zinc-900 focus:outline-none focus:border-zinc-900"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block font-medium text-zinc-700">Custom Headers (JSON)</label>
                  <textarea
                    rows={2}
                    value={customHeaders}
                    onChange={(e) => setCustomHeaders(e.target.value)}
                    placeholder='{"X-Custom-Header": "value"}'
                    className="w-full px-2.5 py-1.5 border border-zinc-200 rounded font-mono text-zinc-900 focus:outline-none focus:border-zinc-900"
                  />
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="checkbox"
                    id="en-chk"
                    checked={enabled}
                    onChange={(e) => setEnabled(e.target.checked)}
                  />
                  <label htmlFor="en-chk" className="text-zinc-700 cursor-pointer">
                    Enable this upstream for fallback routing chains
                  </label>
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-zinc-100">
                  <button
                    type="button"
                    onClick={() => setModalOpen(false)}
                    className="px-3 py-1.5 text-zinc-600 hover:text-zinc-900 rounded font-medium cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-3.5 py-1.5 bg-zinc-900 text-white rounded font-medium hover:bg-zinc-800 cursor-pointer"
                  >
                    Save Upstream
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
