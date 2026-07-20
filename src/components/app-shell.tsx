import type { ReactNode } from "react";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import {
  LayoutDashboard, ListVideo, Table2, Brain, LogOut, Sparkles, TrendingUp,
  Cable, Wand2, Search, Clock, SlidersHorizontal, FolderKanban,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { CampaignSelector } from "@/components/campaign-selector";

const UNLOCK_KEY = "loop:unlocked";

const nav = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/campaigns", label: "Campaigns", icon: FolderKanban },
  { to: "/queue", label: "Queue", icon: ListVideo },
  { to: "/sheet", label: "Sheet", icon: Table2 },
  { to: "/learning", label: "Learning", icon: Brain },
  { to: "/insights", label: "Insights", icon: TrendingUp },
];


const settingsNav = [
  { to: "/settings/buffer", label: "Buffer", icon: Cable },
  { to: "/settings/ai", label: "AI", icon: Wand2 },
  { to: "/settings/analysis", label: "Analysis", icon: Search },
  { to: "/settings/scheduler", label: "Scheduler", icon: Clock },
  { to: "/settings/general", label: "General", icon: SlidersHorizontal },
];

export function AppShell({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();

  function lock() {
    if (typeof window !== "undefined") window.localStorage.removeItem(UNLOCK_KEY);
    navigate({ to: "/auth" });
  }

  return (
    <div className="min-h-screen flex bg-background text-foreground">
      <aside className="w-60 shrink-0 border-r border-sidebar-border bg-sidebar flex flex-col">
        <div className="p-4 flex items-center gap-2 border-b border-sidebar-border">
          <div className="h-8 w-8 rounded-md bg-primary/15 flex items-center justify-center">
            <Sparkles className="h-4 w-4 text-primary" />
          </div>
          <div>
            <div className="text-sm font-semibold">Loop</div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Adaptive Publisher</div>
          </div>
        </div>

        <nav className="p-3 space-y-1">
          {nav.map((item) => {
            const active = location.pathname === item.to || location.pathname.startsWith(item.to + "/");
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="px-3 mt-2 mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">Settings</div>
        <nav className="p-3 pt-1 space-y-1">
          {settingsNav.map((item) => {
            const active = location.pathname === item.to;
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60",
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto p-3 border-t border-sidebar-border">
          <Button variant="ghost" size="sm" className="w-full justify-start" onClick={lock}>
            <LogOut className="h-4 w-4 mr-2" /> Sign out
          </Button>
        </div>
      </aside>

      <main className="flex-1 min-w-0 overflow-x-hidden">
        <div className="max-w-7xl mx-auto p-6 lg:p-8">{children}</div>
      </main>
    </div>
  );
}
