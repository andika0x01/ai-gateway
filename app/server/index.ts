import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { v1Router } from './api/v1';
import { adminRouter } from './api/admin';
import { syncAnthropicModels } from './gateway/anthropic-registry';

export const gatewayApp = new Hono();

// Auto-sync official Anthropic models on startup
syncAnthropicModels().catch(() => {});

// Global Middlewares
gatewayApp.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['*'],
  exposeHeaders: ['*'],
}));

gatewayApp.use('*', logger());

// Root Health Check
gatewayApp.get('/health', (c) => {
  return c.json({
    status: 'healthy',
    service: 'Claude Code AI Gateway',
    timestamp: new Date().toISOString(),
  });
});

// Mount Anthropic /v1 routes
gatewayApp.route('/v1', v1Router);

// Mount Admin /api routes
gatewayApp.route('/api', adminRouter);

export default gatewayApp;
