import React, { useState, useEffect } from 'react';
import { AppLayout } from '../components/layout/AppLayout';
import { Trash2, Edit2, X, ChevronUp, ChevronDown, Plus } from 'lucide-react';
import { ANTHROPIC_OFFICIAL_MODELS } from '../server/constants/anthropic-models';

interface RouteRuleWithFallbacks {
  id: string;
  requested_model: string;
  description: string;
  timeout_ms: number;
  enabled: number;
  fallbacks: Array<{
    id: string;
    model_id: string;
    priority_order: number;
    model_name: string;
    provider_name: string;
    supports_tools: number;
    supports_thinking: number;
  }>;
}

export default function RoutesConfigPage() {
  const [routes, setRoutes] = useState<RouteRuleWithFallbacks[]>([]);
  const [models, setModels] = useState<any[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<RouteRuleWithFallbacks | null>(null);

  const [requestedModel, setRequestedModel] = useState('claude-3-7-sonnet-20250219');
  const [description, setDescription] = useState('');
  const [timeoutMs, setTimeoutMs] = useState(20000);
  const [selectedModelIds, setSelectedModelIds] = useState<string[]>([]);
  const [enabled, setEnabled] = useState(true);

  const [anthropicModels, setAnthropicModels] = useState<any[]>(ANTHROPIC_OFFICIAL_MODELS);

  const fetchRoutes = async () => {
    try {
      const [rRes, mRes, aRes] = await Promise.all([
        fetch('/api/routes').then((r) => r.json()),
        fetch('/api/models').then((r) => r.json()),
        fetch('/api/anthropic-models').then((r) => r.json()).catch(() => null),
      ]);
      setRoutes(rRes);
      setModels(mRes);
      if (aRes?.models && Array.isArray(aRes.models) && aRes.models.length > 0) {
        setAnthropicModels(aRes.models);
      }
    } catch {}
  };

  useEffect(() => {
    fetchRoutes();
  }, []);

  const openAdd = () => {
    setEditing(null);
    setRequestedModel('claude-3-7-sonnet-20250219');
    setDescription('');
    setTimeoutMs(20000);
    setSelectedModelIds(models.slice(0, 2).map((m) => m.id));
    setEnabled(true);
    setModalOpen(true);
  };

  const openEdit = (r: RouteRuleWithFallbacks) => {
    setEditing(r);
    setRequestedModel(r.requested_model);
    setDescription(r.description || '');
    setTimeoutMs(r.timeout_ms || 20000);
    setSelectedModelIds(r.fallbacks.map((f) => f.model_id));
    setEnabled(r.enabled === 1);
    setModalOpen(true);
  };

  const movePriority = (index: number, direction: 'up' | 'down') => {
    const updated = [...selectedModelIds];
    const target = direction === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= updated.length) return;
    const temp = updated[index];
    updated[index] = updated[target];
    updated[target] = temp;
    setSelectedModelIds(updated);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      requested_model: requestedModel,
      description,
      timeout_ms: Number(timeoutMs),
      enabled,
      model_ids: selectedModelIds,
    };

    if (editing) {
      await fetch(`/api/routes/${editing.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } else {
      await fetch('/api/routes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    }

    setModalOpen(false);
    fetchRoutes();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete route chain?')) return;
    await fetch(`/api/routes/${id}`, { method: 'DELETE' });
    fetchRoutes();
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold text-zinc-900 tracking-tight">Fallback Routing Chains</h1>
            <p className="text-xs text-zinc-500 mt-0.5">
              Automatic failover priorities and TTFT timeout limits per Claude model request
            </p>
          </div>
          <button
            onClick={openAdd}
            className="px-3.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-medium rounded shadow-2xs transition-colors cursor-pointer self-start sm:self-auto"
          >
            + Add Route Chain
          </button>
        </div>

        {/* Route Chains List */}
        <div className="space-y-3">
          {routes.length === 0 ? (
            <div className="border border-zinc-200 rounded-lg bg-white p-8 text-center text-xs text-zinc-400">
              No fallback routing chains configured. Click "+ Add Route Chain" to create one.
            </div>
          ) : (
            routes.map((r) => (
              <div
                key={r.id}
                className="border border-zinc-200 rounded-lg bg-white p-4 sm:p-5 space-y-3"
              >
                {/* Header Row */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono font-semibold text-zinc-900 text-sm">
                      {r.requested_model}
                    </span>
                    <span className="text-[11px] text-zinc-400">
                      ({r.timeout_ms}ms timeout)
                    </span>
                    <span className="text-[11px] px-2 py-0.5 rounded bg-zinc-100 text-zinc-600">
                      {r.enabled ? 'Active' : 'Disabled'}
                    </span>
                  </div>

                  <div className="flex items-center gap-1 self-start sm:self-auto">
                    <button
                      onClick={() => openEdit(r)}
                      className="p-1 text-zinc-400 hover:text-zinc-900 rounded transition-colors cursor-pointer"
                      title="Edit chain"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(r.id)}
                      className="p-1 text-zinc-400 hover:text-red-600 rounded transition-colors cursor-pointer"
                      title="Delete chain"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {r.description && (
                  <p className="text-xs text-zinc-500">{r.description}</p>
                )}

                {/* Fallback Flow */}
                <div className="pt-2 border-t border-zinc-100">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    {r.fallbacks.length === 0 ? (
                      <span className="text-zinc-400">No fallbacks configured</span>
                    ) : (
                      r.fallbacks.map((fb, idx) => (
                        <React.Fragment key={fb.id}>
                          {idx > 0 && <span className="text-zinc-400">→</span>}
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-zinc-50 border border-zinc-200 text-zinc-800 text-xs">
                            <span className="text-zinc-400 font-mono text-[11px]">{idx + 1}.</span>
                            <span className="font-mono text-zinc-900">{fb.model_name}</span>
                            <span className="text-[11px] text-zinc-400">({fb.provider_name})</span>
                          </div>
                        </React.Fragment>
                      ))
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Redesigned Figma-grade Modal */}
        {modalOpen && (
          <div className="fixed inset-0 z-50 bg-black/30 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-xl border border-zinc-200 shadow-xl max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
              {/* Modal Header */}
              <div className="px-5 py-3.5 border-b border-zinc-100 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-zinc-900">
                    {editing ? 'Edit Fallback Chain' : 'New Fallback Chain'}
                  </h2>
                  <p className="text-[11px] text-zinc-400 mt-0.5">
                    Configure failover targets and timeout limits
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="p-1 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-md transition-colors cursor-pointer"
                  aria-label="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Modal Form */}
              <form onSubmit={handleSave} className="p-5 space-y-4 text-xs">
                {/* Official Model & Timeout */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2 space-y-1">
                    <label className="block text-xs font-medium text-zinc-700">
                      Official Anthropic Model Request
                    </label>
                    <select
                      value={requestedModel}
                      onChange={(e) => setRequestedModel(e.target.value)}
                      className="w-full px-3 py-2 border border-zinc-200 rounded-lg text-xs font-mono text-zinc-900 bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-900 transition-all"
                    >
                      {['Claude 5', 'Claude 4.x', 'Claude 3.7', 'Claude 3.5', 'Claude 3', 'Wildcard'].map((cat) => {
                        const list = anthropicModels.filter((m) => m.category === cat);
                        if (list.length === 0) return null;
                        return (
                          <optgroup key={cat} label={cat}>
                            {list.map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.id} ({m.displayName})
                              </option>
                            ))}
                          </optgroup>
                        );
                      })}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="block text-xs font-medium text-zinc-700">
                      Timeout (ms)
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        value={timeoutMs}
                        onChange={(e) => setTimeoutMs(Number(e.target.value))}
                        className="w-full px-3 py-2 border border-zinc-200 rounded-lg font-mono text-xs text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-900 transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                      <span className="absolute right-2.5 top-2 text-[11px] text-zinc-400 font-mono pointer-events-none">
                        ms
                      </span>
                    </div>
                  </div>
                </div>

                {/* Description */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-medium text-zinc-700">
                      Description
                    </label>
                    <span className="text-[11px] text-zinc-400">Optional</span>
                  </div>
                  <input
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="e.g. Route Sonnet requests to local DeepSeek-R1 or Qwen"
                    className="w-full px-3 py-2 border border-zinc-200 rounded-lg text-xs text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-900 transition-all"
                  />
                </div>

                {/* Priority Sequence Card */}
                <div className="space-y-2 pt-1">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-medium text-zinc-700">
                      Priority Sequence
                    </label>
                    <span className="text-[11px] text-zinc-400">
                      {selectedModelIds.length} target{selectedModelIds.length === 1 ? '' : 's'}
                    </span>
                  </div>

                  {/* Item List */}
                  <div className="space-y-1.5 border border-zinc-200 rounded-lg p-2 bg-zinc-50/70 max-h-52 overflow-y-auto">
                    {selectedModelIds.length === 0 ? (
                      <div className="py-5 text-center text-zinc-400 text-xs">
                        No target models in chain. Select a model below to add.
                      </div>
                    ) : (
                      selectedModelIds.map((mId, idx) => {
                        const m = models.find((item) => item.id === mId);
                        if (!m) return null;
                        return (
                          <div
                            key={mId}
                            className="flex items-center justify-between bg-white px-3 py-2 rounded-md border border-zinc-200/80 shadow-2xs hover:border-zinc-300 transition-colors"
                          >
                            <div className="flex items-center gap-2.5 min-w-0 pr-2">
                              <span className="w-5 h-5 rounded bg-zinc-100 text-zinc-700 font-mono text-[11px] font-semibold flex items-center justify-center shrink-0">
                                {idx + 1}
                              </span>
                              <div className="min-w-0">
                                <div className="font-mono text-xs font-medium text-zinc-900 truncate">
                                  {m.model_name}
                                </div>
                                <div className="text-[10px] text-zinc-400 truncate">
                                  {m.provider_name}
                                </div>
                              </div>
                            </div>

                            {/* Actions */}
                            <div className="flex items-center gap-0.5 shrink-0">
                              <button
                                type="button"
                                disabled={idx === 0}
                                onClick={() => movePriority(idx, 'up')}
                                className="p-1 text-zinc-400 hover:text-zinc-900 disabled:opacity-20 hover:bg-zinc-100 rounded transition-colors cursor-pointer"
                                title="Move up in priority"
                              >
                                <ChevronUp className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                disabled={idx === selectedModelIds.length - 1}
                                onClick={() => movePriority(idx, 'down')}
                                className="p-1 text-zinc-400 hover:text-zinc-900 disabled:opacity-20 hover:bg-zinc-100 rounded transition-colors cursor-pointer"
                                title="Move down in priority"
                              >
                                <ChevronDown className="w-3.5 h-3.5" />
                              </button>
                              <div className="w-px h-3.5 bg-zinc-200 mx-0.5"></div>
                              <button
                                type="button"
                                onClick={() => setSelectedModelIds(selectedModelIds.filter((id) => id !== mId))}
                                className="p-1 text-zinc-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors cursor-pointer"
                                title="Remove from sequence"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* Add Model Dropdown */}
                  <select
                    className="w-full px-3 py-2 border border-zinc-200 rounded-lg text-xs font-mono text-zinc-900 bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-900 transition-all cursor-pointer"
                    defaultValue=""
                    onChange={(e) => {
                      if (e.target.value && !selectedModelIds.includes(e.target.value)) {
                        setSelectedModelIds([...selectedModelIds, e.target.value]);
                        e.target.value = '';
                      }
                    }}
                  >
                    <option value="" disabled>+ Add model to chain...</option>
                    {models
                      .filter((m) => !selectedModelIds.includes(m.id))
                      .map((m) => (
                        <option key={m.id} value={m.id} className="font-mono text-xs text-zinc-900">
                          {m.model_name} ({m.provider_name})
                        </option>
                      ))}
                  </select>
                </div>

                {/* Enable Checkbox */}
                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="checkbox"
                    id="route-enabled"
                    checked={enabled}
                    onChange={(e) => setEnabled(e.target.checked)}
                    className="w-4 h-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900 cursor-pointer"
                  />
                  <label htmlFor="route-enabled" className="font-medium text-zinc-700 cursor-pointer">
                    Enable this fallback route chain
                  </label>
                </div>

                {/* Modal Footer */}
                <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-100">
                  <button
                    type="button"
                    onClick={() => setModalOpen(false)}
                    className="px-3.5 py-1.5 text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 rounded-lg font-medium transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 bg-zinc-900 text-white rounded-lg font-medium hover:bg-zinc-800 shadow-xs transition-colors cursor-pointer"
                  >
                    Save Route Chain
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
