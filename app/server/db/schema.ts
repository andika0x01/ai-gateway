// Database Schema Definitions for AI Gateway

export interface ProviderRecord {
  id: string;
  name: string;
  type: string; // 'openai-compatible' | 'custom'
  base_url: string;
  api_key: string;
  custom_headers: string; // JSON string
  enabled: number; // 0 or 1
  created_at: string;
  updated_at: string;
}

export interface ModelRecord {
  id: string;
  provider_id: string;
  model_name: string;
  display_name: string;
  supports_tools: number; // 0 or 1
  supports_thinking: number; // 0 or 1
  supports_vision: number; // 0 or 1
  max_tokens: number;
  enabled: number; // 0 or 1
  created_at: string;
}

export interface RouteRuleRecord {
  id: string;
  requested_model: string;
  description: string;
  timeout_ms: number;
  enabled: number; // 0 or 1
  created_at: string;
}

export interface RouteFallbackRecord {
  id: string;
  route_id: string;
  model_id: string;
  priority_order: number;
}

export interface RequestLogRecord {
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

export interface SettingRecord {
  key: string;
  value: string;
}

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS providers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'openai-compatible',
  base_url TEXT NOT NULL,
  api_key TEXT NOT NULL DEFAULT '',
  custom_headers TEXT NOT NULL DEFAULT '{}',
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS models (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL,
  model_name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  supports_tools INTEGER NOT NULL DEFAULT 1,
  supports_thinking INTEGER NOT NULL DEFAULT 0,
  supports_vision INTEGER NOT NULL DEFAULT 0,
  max_tokens INTEGER NOT NULL DEFAULT 8192,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS route_rules (
  id TEXT PRIMARY KEY,
  requested_model TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  timeout_ms INTEGER NOT NULL DEFAULT 20000,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS route_fallbacks (
  id TEXT PRIMARY KEY,
  route_id TEXT NOT NULL,
  model_id TEXT NOT NULL,
  priority_order INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY (route_id) REFERENCES route_rules(id) ON DELETE CASCADE,
  FOREIGN KEY (model_id) REFERENCES models(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS request_logs (
  id TEXT PRIMARY KEY,
  timestamp TEXT NOT NULL,
  requested_model TEXT NOT NULL,
  resolved_model TEXT NOT NULL,
  provider_name TEXT NOT NULL,
  status TEXT NOT NULL,
  fallback_count INTEGER NOT NULL DEFAULT 0,
  latency_ms INTEGER NOT NULL DEFAULT 0,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  request_payload_summary TEXT
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON request_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_models_provider ON models(provider_id);
CREATE INDEX IF NOT EXISTS idx_fallbacks_route ON route_fallbacks(route_id, priority_order);
`;
