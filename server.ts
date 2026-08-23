import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { createRequestHandler } from 'react-router';
import { gatewayApp } from './app/server/index';

const app = new Hono();

// 1. Mount API & Gateway endpoints (/v1/*, /api/*, /health)
app.route('/', gatewayApp);

// 2. Serve static client build assets
app.use('/assets/*', serveStatic({ root: './build/client' }));
app.use('/favicon.ico', serveStatic({ path: './build/client/favicon.ico' }));

// 3. React Router SSR handler for UI Dashboard
let handler: any;
app.all('*', async (c) => {
  if (!handler) {
    // @ts-ignore
    const build = await import('./build/server/index.js');
    handler = createRequestHandler(build);
  }
  return handler(c.req.raw);
});

const port = Number(process.env.PORT) || 3000;
console.log(`🤖 Claude Code AI Gateway running at http://localhost:${port}`);
console.log(`📡 Anthropic Endpoint: http://localhost:${port}/v1/messages`);
console.log(`📊 Dashboard UI: http://localhost:${port}/`);

serve({
  fetch: app.fetch,
  port,
});
