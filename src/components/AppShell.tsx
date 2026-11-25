import React from 'react';
import {
  BarChart3,
  ClipboardCheck,
  Monitor,
  Plus,
  Users,
} from 'lucide-react';

export type ActiveTab = 'student' | 'board' | 'staff' | 'analytics';

interface AppShellProps {
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  onOpenJoinModal: () => void;
  children: React.ReactNode;
}

const NAV_ITEMS: Array<{
  id: ActiveTab;
  desktopLabel: string;
  mobileLabel: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'student', desktopLabel: 'Student Hub', mobileLabel: 'Hub', icon: Users },
  { id: 'board', desktopLabel: 'Display Board', mobileLabel: 'Board', icon: Monitor },
  { id: 'staff', desktopLabel: 'Staff Console', mobileLabel: 'Staff', icon: ClipboardCheck },
  { id: 'analytics', desktopLabel: 'Analytics & SQL', mobileLabel: 'Analytics', icon: BarChart3 },
];

export function AppShell({
  activeTab,
  onSelectTab,
  onOpenJoinModal,
  children,
}: AppShellProps) {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900 overflow-x-hidden">
      {/* Top Bar: strict 3-zone contract on desktop, compact 52px header on mobile */}
      <header className="sticky top-0 z-30 h-[52px] md:h-16 bg-white/95 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-[1360px] mx-auto h-full px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-4 lg:gap-8">
          {/* Zone 1: Single-element brand wordmark */}
          <button
            type="button"
            onClick={() => onSelectTab('student')}
            className="text-lg md:text-xl font-bold tracking-tight text-slate-950 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 rounded"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            QueuePulse
          </button>

          {/* Zone 2: 4 clean single-line navigation links (desktop/tablet) */}
          <nav
            aria-label="Primary navigation"
            className="hidden md:flex items-center gap-4 lg:gap-8 h-full"
          >
            {NAV_ITEMS.map((item) => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelectTab(item.id)}
                  aria-current={isActive ? 'page' : undefined}
                  className={`relative h-full inline-flex items-center text-sm font-medium whitespace-nowrap shrink-0 transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 rounded-sm px-1 ${
                    isActive
                      ? 'text-blue-700'
                      : 'text-slate-600 hover:text-slate-950'
                  }`}
                >
                  {item.desktopLabel}
                  {isActive && (
                    <span
                      aria-hidden="true"
                      className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-700"
                    />
                  )}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: Single primary action */}
          <div className="shrink-0">
            <button
              type="button"
              onClick={onOpenJoinModal}
              className="inline-flex items-center justify-center gap-1.5 min-h-[38px] md:min-h-[40px] px-3.5 md:px-4 py-2 text-xs md:text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 active:scale-[0.98] rounded-lg transition-all duration-150 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2"
            >
              <Plus className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>Get Token</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area (padded on bottom for mobile thumb tab bar) */}
      <main className="flex-1 w-full max-w-[1360px] mx-auto px-4 sm:px-6 lg:px-8 pt-5 sm:pt-7 pb-24 md:pb-12">
        {children}
      </main>

      {/* Quiet Footer (desktop/tablet) */}
      <footer className="hidden md:block border-t border-slate-200 bg-white">
        <div className="max-w-[1360px] mx-auto px-6 lg:px-8 py-5 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-500">
          <p>
            QueuePulse Campus Convenience Platform · Rajalakshmi Engineering College, Chennai
          </p>
          <p>
            Polymorphic Queue Scheduling · Anti-Starvation Aging · EWMA Wait Forecasting
          </p>
        </div>
      </footer>

      {/* Mobile Bottom Tab Bar (60px fixed -> 52px + 60px = 112px <= 15% of 844px) */}
      <nav
        aria-label="Mobile navigation"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 h-[60px] bg-white/95 backdrop-blur-md border-t border-slate-200 pb-safe"
      >
        <div className="grid grid-cols-4 h-full">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                aria-current={isActive ? 'page' : undefined}
                className={`flex flex-col items-center justify-center min-h-[48px] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-700 ${
                  isActive ? 'text-blue-700' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <Icon className="w-5 h-5" aria-hidden="true" />
                <span className="text-[11px] font-medium mt-0.5 leading-none whitespace-nowrap">
                  {item.mobileLabel}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
