import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("providers", "routes/providers.tsx"),
  route("models", "routes/models.tsx"),
  route("routes", "routes/routes-config.tsx"),
  route("logs", "routes/logs.tsx"),
  route("playground", "routes/playground.tsx"),
  route("setup", "routes/setup.tsx"),
] satisfies RouteConfig;
