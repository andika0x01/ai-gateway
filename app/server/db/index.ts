import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import { SCHEMA_SQL } from './schema';

let dbInstance: Database.Database | null = null;

export function getDatabase(): Database.Database {
  if (dbInstance) {
    return dbInstance;
  }

  const dataDir = path.resolve(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const dbPath = process.env.DB_PATH || path.join(dataDir, 'gateway.db');
  dbInstance = new Database(dbPath);

  // Enable WAL mode for high concurrency and performance
  dbInstance.pragma('journal_mode = WAL');
  dbInstance.pragma('foreign_keys = ON');

  // Initialize tables
  dbInstance.exec(SCHEMA_SQL);

  // Seed default data if empty
  seedDefaultData(dbInstance);

  return dbInstance;
}

function seedDefaultData(db: Database.Database) {
  const providerCount = db.prepare('SELECT count(*) as count FROM providers').get() as { count: number };
  if (providerCount.count > 0) {
    return;
  }

  const now = new Date().toISOString();

  // 1. Seed Agnostic OpenAI-Compatible Upstream
  const insertProvider = db.prepare(`
    INSERT INTO providers (id, name, type, base_url, api_key, custom_headers, enabled, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const p1Id = 'prov_upstream_primary';
  insertProvider.run(
    p1Id,
    'Primary Upstream',
    'openai-compatible',
    'https://integrate.api.nvidia.com/v1',
    '',
    '{}',
    1,
    now,
    now
  );

  const p2Id = 'prov_upstream_secondary';
  insertProvider.run(
    p2Id,
    'Local Upstream',
    'openai-compatible',
    'http://localhost:11434/v1',
    '',
    '{}',
    1,
    now,
    now
  );

  // 2. Seed Default Models (Agnostic naming & capabilities)
  const insertModel = db.prepare(`
    INSERT INTO models (id, provider_id, model_name, display_name, supports_tools, supports_thinking, supports_vision, max_tokens, enabled, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const m1Id = 'mod_primary_instruct';
  insertModel.run(
    m1Id,
    p1Id,
    'meta/llama-3.3-70b-instruct',
    'Primary Instruct Model',
    1, // tools
    0, // thinking
    0, // vision
    8192,
    1,
    now
  );

  const m2Id = 'mod_primary_reasoner';
  insertModel.run(
    m2Id,
    p1Id,
    'deepseek-ai/deepseek-r1',
    'Primary Reasoning Model',
    1,
    1, // thinking
    0,
    16384,
    1,
    now
  );

  const m3Id = 'mod_local_backup';
  insertModel.run(
    m3Id,
    p2Id,
    'qwen2.5-coder:latest',
    'Local Fallback Model',
    1,
    0,
    0,
    8192,
    1,
    now
  );

  // 3. Seed Agnostic Route Rules for Claude Code models
  const insertRoute = db.prepare(`
    INSERT INTO route_rules (id, requested_model, description, timeout_ms, enabled, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const insertFallback = db.prepare(`
    INSERT INTO route_fallbacks (id, route_id, model_id, priority_order)
    VALUES (?, ?, ?, ?)
  `);

  // Route 1: claude-3-7-sonnet-20250219
  const rSonnet37Id = 'route_claude_37_sonnet';
  insertRoute.run(
    rSonnet37Id,
    'claude-3-7-sonnet-20250219',
    'Fallback chain for Claude 3.7 Sonnet',
    20000,
    1,
    now
  );
  insertFallback.run('fb_1', rSonnet37Id, m1Id, 1);
  insertFallback.run('fb_2', rSonnet37Id, m2Id, 2);
  insertFallback.run('fb_3', rSonnet37Id, m3Id, 3);

  // Route 2: claude-3-5-sonnet-20241022
  const rSonnet35Id = 'route_claude_35_sonnet';
  insertRoute.run(
    rSonnet35Id,
    'claude-3-5-sonnet-20241022',
    'Fallback chain for Claude 3.5 Sonnet',
    20000,
    1,
    now
  );
  insertFallback.run('fb_4', rSonnet35Id, m1Id, 1);
  insertFallback.run('fb_5', rSonnet35Id, m3Id, 2);

  // Route 3: claude-3-5-haiku-20241022
  const rHaiku35Id = 'route_claude_35_haiku';
  insertRoute.run(
    rHaiku35Id,
    'claude-3-5-haiku-20241022',
    'Fast fallback chain for Claude 3.5 Haiku',
    15000,
    1,
    now
  );
  insertFallback.run('fb_6', rHaiku35Id, m1Id, 1);
  insertFallback.run('fb_7', rHaiku35Id, m3Id, 2);

  // Route 4: Wildcard *
  const rWildcardId = 'route_wildcard';
  insertRoute.run(
    rWildcardId,
    '*',
    'Catch-all default chain for any model requested by client',
    20000,
    1,
    now
  );
  insertFallback.run('fb_8', rWildcardId, m1Id, 1);
  insertFallback.run('fb_9', rWildcardId, m2Id, 2);
}
