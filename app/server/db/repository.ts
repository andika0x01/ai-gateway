import { getDatabase } from './index';
import type {
  ProviderRecord,
  ModelRecord,
  RouteRuleRecord,
  RequestLogRecord,
} from './schema';
import crypto from 'node:crypto';

// --- Providers Repository ---

export function getAllProviders(): ProviderRecord[] {
  const db = getDatabase();
  return db.prepare('SELECT * FROM providers ORDER BY created_at ASC').all() as ProviderRecord[];
}

export function getProviderById(id: string): ProviderRecord | null {
  const db = getDatabase();
  const row = db.prepare('SELECT * FROM providers WHERE id = ?').get(id);
  return (row as ProviderRecord) || null;
}

export function createProvider(data: {
  name: string;
  type: string;
  base_url: string;
  api_key?: string;
  custom_headers?: Record<string, string>;
  enabled?: boolean;
}): ProviderRecord {
  const db = getDatabase();
  const id = `prov_${crypto.randomUUID().slice(0, 8)}`;
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO providers (id, name, type, base_url, api_key, custom_headers, enabled, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    data.name,
    data.type,
    data.base_url.replace(/\/+$/, ''),
    data.api_key || '',
    JSON.stringify(data.custom_headers || {}),
    data.enabled !== false ? 1 : 0,
    now,
    now
  );

  return getProviderById(id)!;
}

export function updateProvider(
  id: string,
  data: Partial<{
    name: string;
    type: string;
    base_url: string;
    api_key: string;
    custom_headers: Record<string, string>;
    enabled: boolean;
  }>
): ProviderRecord | null {
  const db = getDatabase();
  const existing = getProviderById(id);
  if (!existing) return null;

  const now = new Date().toISOString();
  const name = data.name !== undefined ? data.name : existing.name;
  const type = data.type !== undefined ? data.type : existing.type;
  const base_url = data.base_url !== undefined ? data.base_url.replace(/\/+$/, '') : existing.base_url;
  const api_key = data.api_key !== undefined ? data.api_key : existing.api_key;
  const custom_headers =
    data.custom_headers !== undefined ? JSON.stringify(data.custom_headers) : existing.custom_headers;
  const enabled = data.enabled !== undefined ? (data.enabled ? 1 : 0) : existing.enabled;

  db.prepare(`
    UPDATE providers 
    SET name = ?, type = ?, base_url = ?, api_key = ?, custom_headers = ?, enabled = ?, updated_at = ?
    WHERE id = ?
  `).run(name, type, base_url, api_key, custom_headers, enabled, now, id);

  return getProviderById(id);
}

export function deleteProvider(id: string): boolean {
  const db = getDatabase();
  const result = db.prepare('DELETE FROM providers WHERE id = ?').run(id);
  return result.changes > 0;
}

// --- Models Repository ---

export interface ModelWithProvider extends ModelRecord {
  provider_name: string;
  provider_type: string;
  provider_base_url: string;
  provider_api_key: string;
  provider_headers: string;
  provider_enabled: number;
}

export function getAllModels(): ModelWithProvider[] {
  const db = getDatabase();
  return db
    .prepare(`
      SELECT 
        m.*,
        p.name as provider_name,
        p.type as provider_type,
        p.base_url as provider_base_url,
        p.api_key as provider_api_key,
        p.custom_headers as provider_headers,
        p.enabled as provider_enabled
      FROM models m
      JOIN providers p ON m.provider_id = p.id
      ORDER BY p.name ASC, m.display_name ASC
    `)
    .all() as ModelWithProvider[];
}

export function getModelById(id: string): ModelWithProvider | null {
  const db = getDatabase();
  const row = db
    .prepare(`
      SELECT 
        m.*,
        p.name as provider_name,
        p.type as provider_type,
        p.base_url as provider_base_url,
        p.api_key as provider_api_key,
        p.custom_headers as provider_headers,
        p.enabled as provider_enabled
      FROM models m
      JOIN providers p ON m.provider_id = p.id
      WHERE m.id = ?
    `)
    .get(id);
  return (row as ModelWithProvider) || null;
}

export function getModelsByProviderId(providerId: string): ModelRecord[] {
  const db = getDatabase();
  return db.prepare('SELECT * FROM models WHERE provider_id = ? ORDER BY display_name ASC').all(providerId) as ModelRecord[];
}

export function createModel(data: {
  provider_id: string;
  model_name: string;
  display_name: string;
  supports_tools?: boolean;
  supports_thinking?: boolean;
  supports_vision?: boolean;
  max_tokens?: number;
  enabled?: boolean;
}): ModelWithProvider {
  const db = getDatabase();
  const id = `mod_${crypto.randomUUID().slice(0, 8)}`;
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO models (id, provider_id, model_name, display_name, supports_tools, supports_thinking, supports_vision, max_tokens, enabled, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    data.provider_id,
    data.model_name,
    data.display_name || data.model_name,
    data.supports_tools !== false ? 1 : 0,
    data.supports_thinking ? 1 : 0,
    data.supports_vision ? 1 : 0,
    data.max_tokens || 8192,
    data.enabled !== false ? 1 : 0,
    now
  );

  return getModelById(id)!;
}

export function updateModel(
  id: string,
  data: Partial<{
    model_name: string;
    display_name: string;
    supports_tools: boolean;
    supports_thinking: boolean;
    supports_vision: boolean;
    max_tokens: number;
    enabled: boolean;
  }>
): ModelWithProvider | null {
  const db = getDatabase();
  const existing = getModelById(id);
  if (!existing) return null;

  const model_name = data.model_name !== undefined ? data.model_name : existing.model_name;
  const display_name = data.display_name !== undefined ? data.display_name : existing.display_name;
  const supports_tools = data.supports_tools !== undefined ? (data.supports_tools ? 1 : 0) : existing.supports_tools;
  const supports_thinking = data.supports_thinking !== undefined ? (data.supports_thinking ? 1 : 0) : existing.supports_thinking;
  const supports_vision = data.supports_vision !== undefined ? (data.supports_vision ? 1 : 0) : existing.supports_vision;
  const max_tokens = data.max_tokens !== undefined ? data.max_tokens : existing.max_tokens;
  const enabled = data.enabled !== undefined ? (data.enabled ? 1 : 0) : existing.enabled;

  db.prepare(`
    UPDATE models
    SET model_name = ?, display_name = ?, supports_tools = ?, supports_thinking = ?, supports_vision = ?, max_tokens = ?, enabled = ?
    WHERE id = ?
  `).run(model_name, display_name, supports_tools, supports_thinking, supports_vision, max_tokens, enabled, id);

  return getModelById(id);
}

export function deleteModel(id: string): boolean {
  const db = getDatabase();
  const result = db.prepare('DELETE FROM models WHERE id = ?').run(id);
  return result.changes > 0;
}

// --- Route Rules & Fallbacks Repository ---

export interface RouteRuleWithFallbacks extends RouteRuleRecord {
  fallbacks: Array<{
    id: string;
    model_id: string;
    priority_order: number;
    model_name: string;
    display_name: string;
    supports_tools: number;
    supports_thinking: number;
    supports_vision: number;
    max_tokens: number;
    model_enabled: number;
    provider_id: string;
    provider_name: string;
    provider_type: string;
    provider_base_url: string;
    provider_api_key: string;
    provider_headers: string;
    provider_enabled: number;
  }>;
}

export function getAllRouteRules(): RouteRuleWithFallbacks[] {
  const db = getDatabase();
  const rules = db.prepare('SELECT * FROM route_rules ORDER BY requested_model ASC').all() as RouteRuleRecord[];

  return rules.map((rule) => {
    const fallbacks = db
      .prepare(`
        SELECT 
          rf.id,
          rf.model_id,
          rf.priority_order,
          m.model_name,
          m.display_name,
          m.supports_tools,
          m.supports_thinking,
          m.supports_vision,
          m.max_tokens,
          m.enabled as model_enabled,
          p.id as provider_id,
          p.name as provider_name,
          p.type as provider_type,
          p.base_url as provider_base_url,
          p.api_key as provider_api_key,
          p.custom_headers as provider_headers,
          p.enabled as provider_enabled
        FROM route_fallbacks rf
        JOIN models m ON rf.model_id = m.id
        JOIN providers p ON m.provider_id = p.id
        WHERE rf.route_id = ?
        ORDER BY rf.priority_order ASC
      `)
      .all(rule.id) as RouteRuleWithFallbacks['fallbacks'];

    return {
      ...rule,
      fallbacks,
    };
  });
}

export function getRouteRuleForRequestedModel(requestedModel: string): RouteRuleWithFallbacks | null {
  const db = getDatabase();

  // Try exact match first
  let rule = db.prepare('SELECT * FROM route_rules WHERE requested_model = ? AND enabled = 1').get(requestedModel) as
    | RouteRuleRecord
    | undefined;

  // Fallback to wildcard '*' if not found
  if (!rule) {
    rule = db.prepare("SELECT * FROM route_rules WHERE requested_model = '*' AND enabled = 1").get() as
      | RouteRuleRecord
      | undefined;
  }

  if (!rule) return null;

  const fallbacks = db
    .prepare(`
      SELECT 
        rf.id,
        rf.model_id,
        rf.priority_order,
        m.model_name,
        m.display_name,
        m.supports_tools,
        m.supports_thinking,
        m.supports_vision,
        m.max_tokens,
        m.enabled as model_enabled,
        p.id as provider_id,
        p.name as provider_name,
        p.type as provider_type,
        p.base_url as provider_base_url,
        p.api_key as provider_api_key,
        p.custom_headers as provider_headers,
        p.enabled as provider_enabled
      FROM route_fallbacks rf
      JOIN models m ON rf.model_id = m.id
      JOIN providers p ON m.provider_id = p.id
      WHERE rf.route_id = ? AND m.enabled = 1 AND p.enabled = 1
      ORDER BY rf.priority_order ASC
    `)
    .all(rule.id) as RouteRuleWithFallbacks['fallbacks'];

  return {
    ...rule,
    fallbacks,
  };
}

export function createRouteRule(data: {
  requested_model: string;
  description?: string;
  timeout_ms?: number;
  enabled?: boolean;
  model_ids?: string[];
}): RouteRuleWithFallbacks {
  const db = getDatabase();
  const id = `route_${crypto.randomUUID().slice(0, 8)}`;
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO route_rules (id, requested_model, description, timeout_ms, enabled, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    id,
    data.requested_model,
    data.description || '',
    data.timeout_ms || 20000,
    data.enabled !== false ? 1 : 0,
    now
  );

  if (data.model_ids && data.model_ids.length > 0) {
    const insertFb = db.prepare(`
      INSERT INTO route_fallbacks (id, route_id, model_id, priority_order)
      VALUES (?, ?, ?, ?)
    `);
    data.model_ids.forEach((modelId, index) => {
      insertFb.run(`fb_${crypto.randomUUID().slice(0, 8)}`, id, modelId, index + 1);
    });
  }

  return getAllRouteRules().find((r) => r.id === id)!;
}

export function updateRouteRule(
  id: string,
  data: Partial<{
    requested_model: string;
    description: string;
    timeout_ms: number;
    enabled: boolean;
    model_ids: string[];
  }>
): RouteRuleWithFallbacks | null {
  const db = getDatabase();
  const existing = db.prepare('SELECT * FROM route_rules WHERE id = ?').get(id) as RouteRuleRecord | undefined;
  if (!existing) return null;

  const requested_model = data.requested_model !== undefined ? data.requested_model : existing.requested_model;
  const description = data.description !== undefined ? data.description : existing.description;
  const timeout_ms = data.timeout_ms !== undefined ? data.timeout_ms : existing.timeout_ms;
  const enabled = data.enabled !== undefined ? (data.enabled ? 1 : 0) : existing.enabled;

  db.prepare(`
    UPDATE route_rules
    SET requested_model = ?, description = ?, timeout_ms = ?, enabled = ?
    WHERE id = ?
  `).run(requested_model, description, timeout_ms, enabled, id);

  if (data.model_ids !== undefined) {
    db.prepare('DELETE FROM route_fallbacks WHERE route_id = ?').run(id);
    const insertFb = db.prepare(`
      INSERT INTO route_fallbacks (id, route_id, model_id, priority_order)
      VALUES (?, ?, ?, ?)
    `);
    data.model_ids.forEach((modelId, index) => {
      insertFb.run(`fb_${crypto.randomUUID().slice(0, 8)}`, id, modelId, index + 1);
    });
  }

  return getAllRouteRules().find((r) => r.id === id) || null;
}

export function deleteRouteRule(id: string): boolean {
  const db = getDatabase();
  const result = db.prepare('DELETE FROM route_rules WHERE id = ?').run(id);
  return result.changes > 0;
}

// --- Request Logs Repository ---

export function createRequestLog(data: {
  requested_model: string;
  resolved_model: string;
  provider_name: string;
  status: 'success' | 'fallback_success' | 'failed';
  fallback_count: number;
  latency_ms: number;
  input_tokens: number;
  output_tokens: number;
  error_message?: string | null;
  request_payload_summary?: string | null;
}): RequestLogRecord {
  const db = getDatabase();
  const id = `log_${crypto.randomUUID().slice(0, 12)}`;
  const timestamp = new Date().toISOString();

  db.prepare(`
    INSERT INTO request_logs (
      id, timestamp, requested_model, resolved_model, provider_name,
      status, fallback_count, latency_ms, input_tokens,
      output_tokens, error_message, request_payload_summary
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    timestamp,
    data.requested_model,
    data.resolved_model,
    data.provider_name,
    data.status,
    data.fallback_count,
    data.latency_ms,
    data.input_tokens,
    data.output_tokens,
    data.error_message || null,
    data.request_payload_summary || null
  );

  return {
    id,
    timestamp,
    requested_model: data.requested_model,
    resolved_model: data.resolved_model,
    provider_name: data.provider_name,
    status: data.status,
    fallback_count: data.fallback_count,
    latency_ms: data.latency_ms,
    input_tokens: data.input_tokens,
    output_tokens: data.output_tokens,
    error_message: data.error_message || null,
    request_payload_summary: data.request_payload_summary || null,
  };
}

export function getRequestLogs(limit = 100, offset = 0, statusFilter?: string): { logs: RequestLogRecord[]; total: number } {
  const db = getDatabase();
  let whereClause = '';
  const params: unknown[] = [];

  if (statusFilter && statusFilter !== 'all') {
    whereClause = 'WHERE status = ?';
    params.push(statusFilter);
  }

  const countRow = db.prepare(`SELECT count(*) as total FROM request_logs ${whereClause}`).get(...params) as { total: number };
  const logs = db
    .prepare(`SELECT * FROM request_logs ${whereClause} ORDER BY timestamp DESC LIMIT ? OFFSET ?`)
    .all(...params, limit, offset) as RequestLogRecord[];

  return {
    logs,
    total: countRow.total,
  };
}

export function getGatewayStats(): {
  totalRequests: number;
  successRequests: number;
  fallbackRequests: number;
  failedRequests: number;
  avgLatencyMs: number;
  totalTokens: number;
  activeProviders: number;
  activeModels: number;
  activeRoutes: number;
} {
  const db = getDatabase();

  const logStats = db
    .prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success,
        SUM(CASE WHEN status = 'fallback_success' THEN 1 ELSE 0 END) as fallback,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
        AVG(latency_ms) as avg_latency,
        SUM(input_tokens + output_tokens) as total_tokens
      FROM request_logs
    `)
    .get() as {
    total: number;
    success: number | null;
    fallback: number | null;
    failed: number | null;
    avg_latency: number | null;
    total_tokens: number | null;
  };

  const providersCount = (db.prepare('SELECT count(*) as c FROM providers WHERE enabled = 1').get() as { c: number }).c;
  const modelsCount = (db.prepare('SELECT count(*) as c FROM models WHERE enabled = 1').get() as { c: number }).c;
  const routesCount = (db.prepare('SELECT count(*) as c FROM route_rules WHERE enabled = 1').get() as { c: number }).c;

  return {
    totalRequests: logStats.total || 0,
    successRequests: logStats.success || 0,
    fallbackRequests: logStats.fallback || 0,
    failedRequests: logStats.failed || 0,
    avgLatencyMs: Math.round(logStats.avg_latency || 0),
    totalTokens: logStats.total_tokens || 0,
    activeProviders: providersCount,
    activeModels: modelsCount,
    activeRoutes: routesCount,
  };
}

export function clearRequestLogs(): void {
  const db = getDatabase();
  db.prepare('DELETE FROM request_logs').run();
}
