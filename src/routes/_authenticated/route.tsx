import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";

const UNLOCK_KEY = "loop:unlocked";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: () => {
    if (typeof window !== "undefined" && window.localStorage.getItem(UNLOCK_KEY) !== "true") {
      throw redirect({ to: "/auth" });
    }
  },
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});
