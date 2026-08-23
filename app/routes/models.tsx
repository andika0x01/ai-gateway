import React, { useState, useEffect } from 'react';
import { AppLayout } from '../components/layout/AppLayout';
import { Trash2, Edit2, X } from 'lucide-react';

interface ModelWithProvider {
  id: string;
  provider_id: string;
  model_name: string;
  display_name: string;
  supports_tools: number;
  supports_thinking: number;
  supports_vision: number;
  max_tokens: number;
  enabled: number;
  provider_name: string;
}

export default function ModelsPage() {
  const [models, setModels] = useState<ModelWithProvider[]>([]);
  const [providers, setProviders] = useState<any[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ModelWithProvider | null>(null);

  const [providerId, setProviderId] = useState('');
  const [modelName, setModelName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [supportsTools, setSupportsTools] = useState(true);
  const [supportsThinking, setSupportsThinking] = useState(false);
  const [supportsVision, setSupportsVision] = useState(false);
  const [maxTokens, setMaxTokens] = useState(8192);
  const [enabled, setEnabled] = useState(true);

  const fetchModels = async () => {
    try {
      const [mRes, pRes] = await Promise.all([
        fetch('/api/models').then((r) => r.json()),
        fetch('/api/providers').then((r) => r.json()),
      ]);
      setModels(mRes);
      setProviders(pRes);
      if (pRes.length > 0 && !providerId) setProviderId(pRes[0].id);
    } catch {}
  };

  useEffect(() => {
    fetchModels();
  }, []);

  const openAdd = () => {
    setEditing(null);
    setProviderId(providers[0]?.id || '');
    setModelName('');
    setDisplayName('');
    setSupportsTools(true);
    setSupportsThinking(false);
    setSupportsVision(false);
    setMaxTokens(8192);
    setEnabled(true);
    setModalOpen(true);
  };

  const openEdit = (m: ModelWithProvider) => {
    setEditing(m);
    setProviderId(m.provider_id);
    setModelName(m.model_name);
    setDisplayName(m.display_name);
    setSupportsTools(m.supports_tools === 1);
    setSupportsThinking(m.supports_thinking === 1);
    setSupportsVision(m.supports_vision === 1);
    setMaxTokens(m.max_tokens || 8192);
    setEnabled(m.enabled === 1);
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      provider_id: providerId,
      model_name: modelName,
      display_name: displayName || modelName,
      supports_tools: supportsTools,
      supports_thinking: supportsThinking,
      supports_vision: supportsVision,
      max_tokens: Number(maxTokens),
      enabled,
    };

    if (editing) {
      await fetch(`/api/models/${editing.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } else {
      await fetch('/api/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    }

    setModalOpen(false);
    fetchModels();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete model from catalog?')) return;
    await fetch(`/api/models/${id}`, { method: 'DELETE' });
    fetchModels();
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold text-zinc-900 tracking-tight">Model Catalog</h1>
            <p className="text-xs text-zinc-500 mt-0.5">
              Available models across connected upstream inference backends
            </p>
          </div>
          <button
            onClick={openAdd}
            className="px-3.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-medium rounded shadow-2xs transition-colors cursor-pointer self-start sm:self-auto"
          >
            + Add Model
          </button>
        </div>

        {/* Model Catalog Table */}
        <div className="border border-zinc-200 rounded-lg bg-white overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs min-w-[650px]">
              <thead className="bg-zinc-50 text-zinc-500 border-b border-zinc-200 font-medium">
                <tr>
                  <th className="py-2.5 px-4 text-[11px] uppercase tracking-wider">Model Name</th>
                  <th className="py-2.5 px-4 text-[11px] uppercase tracking-wider">Provider</th>
                  <th className="py-2.5 px-4 text-[11px] uppercase tracking-wider">Capabilities</th>
                  <th className="py-2.5 px-4 text-[11px] uppercase tracking-wider">Max Tokens</th>
                  <th className="py-2.5 px-4 text-[11px] uppercase tracking-wider">Status</th>
                  <th className="py-2.5 px-4 text-[11px] uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {models.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-zinc-400">
                      No models in catalog yet. Add a model manually or use "Sync Models" on an upstream provider.
                    </td>
                  </tr>
                ) : (
                  models.map((m) => (
                    <tr key={m.id} className="hover:bg-zinc-50 transition-colors">
                      <td className="py-2.5 px-4">
                        <div className="font-mono text-xs font-medium text-zinc-900">{m.model_name}</div>
                        {m.display_name && m.display_name !== m.model_name && (
                          <div className="text-[11px] text-zinc-400 mt-0.5">{m.display_name}</div>
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-zinc-600">
                        {m.provider_name}
                      </td>
                      <td className="py-2.5 px-4">
                        <div className="flex flex-wrap items-center gap-1">
                          {m.supports_tools === 1 && (
                            <span className="px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-700 text-[10px]">
                              tools
                            </span>
                          )}
                          {m.supports_thinking === 1 && (
                            <span className="px-1.5 py-0.5 rounded bg-zinc-900 text-white text-[10px]">
                              thinking
                            </span>
                          )}
                          {m.supports_vision === 1 && (
                            <span className="px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-700 text-[10px]">
                              vision
                            </span>
                          )}
                          {m.supports_tools !== 1 && m.supports_thinking !== 1 && m.supports_vision !== 1 && (
                            <span className="text-zinc-400 text-[11px]">-</span>
                          )}
                        </div>
                      </td>
                      <td className="py-2.5 px-4 font-mono text-xs text-zinc-500">
                        {m.max_tokens?.toLocaleString() || 8192}
                      </td>
                      <td className="py-2.5 px-4">
                        <span className={`text-[11px] ${m.enabled ? 'text-zinc-900 font-medium' : 'text-zinc-400'}`}>
                          {m.enabled ? 'Active' : 'Disabled'}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => openEdit(m)}
                            className="p-1 text-zinc-400 hover:text-zinc-900 rounded transition-colors cursor-pointer"
                            title="Edit model"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(m.id)}
                            className="p-1 text-zinc-400 hover:text-red-600 rounded transition-colors cursor-pointer"
                            title="Delete model"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Add/Edit Modal */}
        {modalOpen && (
          <div className="fixed inset-0 z-50 bg-black/20 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg border border-zinc-200 shadow-lg max-w-md w-full p-5 space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-zinc-100">
                <span className="font-semibold text-sm text-zinc-900">
                  {editing ? 'Edit Model' : 'Add Model to Catalog'}
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
                  <label className="block font-medium text-zinc-700">Provider</label>
                  <select
                    value={providerId}
                    onChange={(e) => setProviderId(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-zinc-200 rounded text-xs font-sans text-zinc-900 bg-white focus:outline-none focus:border-zinc-900"
                  >
                    {providers.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.base_url})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="block font-medium text-zinc-700">Model ID / Name</label>
                  <input
                    type="text"
                    required
                    value={modelName}
                    onChange={(e) => {
                      setModelName(e.target.value);
                      if (!displayName) setDisplayName(e.target.value);
                    }}
                    placeholder="e.g. meta/llama-3.3-70b-instruct"
                    className="w-full px-2.5 py-1.5 border border-zinc-200 rounded font-mono text-xs text-zinc-900 focus:outline-none focus:border-zinc-900"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block font-medium text-zinc-700">Display Label</label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="e.g. Llama 3.3 70B Instruct"
                    className="w-full px-2.5 py-1.5 border border-zinc-200 rounded text-xs font-sans text-zinc-900 focus:outline-none focus:border-zinc-900"
                  />
                </div>

                <div className="space-y-2 border border-zinc-200 p-2.5 rounded bg-zinc-50">
                  <div className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">
                    Model Capabilities
                  </div>
                  <div className="space-y-1.5">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={supportsTools}
                        onChange={(e) => setSupportsTools(e.target.checked)}
                      />
                      <span className="text-xs text-zinc-800">Tool / Function Calling support</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={supportsThinking}
                        onChange={(e) => setSupportsThinking(e.target.checked)}
                      />
                      <span className="text-xs text-zinc-800">Thinking / Reasoning tokens (DeepSeek R1, QwQ)</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={supportsVision}
                        onChange={(e) => setSupportsVision(e.target.checked)}
                      />
                      <span className="text-xs text-zinc-800">Vision / Image inputs</span>
                    </label>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="block font-medium text-zinc-700">Max Output Tokens</label>
                  <input
                    type="number"
                    value={maxTokens}
                    onChange={(e) => setMaxTokens(Number(e.target.value))}
                    className="w-full px-2.5 py-1.5 border border-zinc-200 rounded font-mono text-xs text-zinc-900 focus:outline-none focus:border-zinc-900"
                  />
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="checkbox"
                    id="m-enabled"
                    checked={enabled}
                    onChange={(e) => setEnabled(e.target.checked)}
                  />
                  <label htmlFor="m-enabled" className="text-zinc-700 cursor-pointer">
                    Enable model for routing
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
                    Save Model
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
