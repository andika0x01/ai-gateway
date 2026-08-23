import React from 'react';
import { NavLink, Link, useLocation } from 'react-router';

interface AppLayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const location = useLocation();

  const nav = [
    { to: '/', label: 'Overview' },
    { to: '/providers', label: 'Upstreams' },
    { to: '/models', label: 'Models' },
    { to: '/routes', label: 'Fallbacks' },
    { to: '/logs', label: 'Logs' },
    { to: '/playground', label: 'Playground' },
    { to: '/setup', label: 'Setup' },
  ];

  return (
    <div className="min-h-screen bg-[#fafafa] text-zinc-900 font-sans antialiased flex flex-col selection:bg-zinc-900 selection:text-white">
      {/* Top Header */}
      <header className="sticky top-0 z-40 border-b border-zinc-200 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-12 flex items-center overflow-x-auto [&::-webkit-scrollbar]:hidden [scrollbar-width:none]">
          <div className="flex items-center gap-4 sm:gap-8 min-w-max">
            {/* Brand */}
            <Link to="/" className="flex items-center gap-1.5 text-xs shrink-0 py-1">
              <span className="font-semibold text-zinc-900 tracking-tight">
                ai-gateway
              </span>
              <span className="text-zinc-300">/</span>
              <span className="text-zinc-500">claude-code</span>
            </Link>

            {/* Navigation Tabs */}
            <nav className="flex items-center space-x-1">
              {nav.map((item) => {
                const active =
                  item.to === '/'
                    ? location.pathname === '/'
                    : location.pathname.startsWith(item.to);
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                      active
                        ? 'text-zinc-900 bg-zinc-100 font-semibold'
                        : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-50'
                    }`}
                  >
                    {item.label}
                  </NavLink>
                );
              })}
            </nav>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-6">
        {children}
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-200 bg-white mt-auto py-3">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-zinc-500">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[11px] text-zinc-600">PORT :3000</span>
            <span className="text-zinc-300">•</span>
            <span>Claude Code Bridge</span>
          </div>
          <div className="text-[11px] text-zinc-500 font-mono">
            POST /v1/messages → OpenAI Compatible
          </div>
        </div>
      </footer>
    </div>
  );
}
