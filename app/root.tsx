import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";

import type { Route } from "./+types/root";
import "./app.css";

export const links: Route.LinksFunction = () => [
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  {
    rel: "preconnect",
    href: "https://fonts.gstatic.com",
    crossOrigin: "anonymous",
  },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600;700&family=Geist+Mono:wght@400;500;600&display=swap",
  },
];

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="bg-[#fafafa] text-zinc-900">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Claude Code AI Gateway</title>
        <Meta />
        <Links />
      </head>
      <body className="min-h-screen bg-[#fafafa] text-zinc-900 antialiased font-sans">
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Oops!";
  let details = "An unexpected error occurred.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404 - Page Not Found" : "Gateway UI Error";
    details =
      error.status === 404
        ? "The requested dashboard page could not be found."
        : error.statusText || details;
  } else if (error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-zinc-50">
      <div className="max-w-lg w-full bg-white rounded-xl border border-zinc-200 p-8 shadow-xs">
        <div className="w-10 h-10 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center font-bold text-lg mb-4 border border-rose-100">
          !
        </div>
        <h1 className="text-lg font-semibold text-zinc-900 mb-2">{message}</h1>
        <p className="text-xs text-zinc-600 mb-6">{details}</p>
        {stack && (
          <pre className="p-4 bg-zinc-100 rounded-lg text-xs font-mono text-zinc-700 overflow-x-auto mb-6">
            <code>{stack}</code>
          </pre>
        )}
        <a
          href="/"
          className="inline-flex items-center justify-center px-4 py-2 text-xs font-medium text-white bg-zinc-900 rounded-lg hover:bg-zinc-800 transition-colors shadow-xs"
        >
          Back to Dashboard
        </a>
      </div>
    </main>
  );
}
