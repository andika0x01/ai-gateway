import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, type Plugin } from "vite";
import { getRequestListener } from "@hono/node-server";

function honoGatewayPlugin(): Plugin {
  return {
    name: "hono-gateway-dev",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url || "";
        if (
          url.startsWith("/v1/") ||
          url.startsWith("/v1?") ||
          url.startsWith("/api/") ||
          url.startsWith("/api?") ||
          url === "/v1" ||
          url === "/api" ||
          url === "/health"
        ) {
          try {
            const mod = await server.ssrLoadModule("/app/server/index.ts");
            const listener = getRequestListener(mod.gatewayApp.fetch);
            return listener(req, res);
          } catch (err) {
            console.error("Gateway error in dev:", err);
            res.statusCode = 500;
            res.end(JSON.stringify({ error: "Internal Gateway Error" }));
            return;
          }
        }
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [tailwindcss(), reactRouter(), honoGatewayPlugin()],
  resolve: {
    tsconfigPaths: true,
  },
});
