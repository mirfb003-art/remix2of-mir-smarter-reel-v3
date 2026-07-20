// Cron tick — called by pg_cron every 5 minutes.
// Advances due schedules by running the orchestrator for each.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/cron/tick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Simple auth: require Supabase anon key
        const apikey = request.headers.get("apikey");
        if (!apikey) return new Response("Unauthorized", { status: 401 });
        if (apikey !== process.env.SUPABASE_PUBLISHABLE_KEY) {
          return new Response("Unauthorized", { status: 401 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const now = new Date().toISOString();
        const { data: due } = await supabaseAdmin
          .from("schedules")
          .select("id,user_id,channel_id,campaign_id,mode,interval_hours,daily_times,paused,campaigns(status)")
          .eq("active", true)
          .eq("paused", false)
          .lte("next_run_at", now)
          .limit(20);


        const results: Array<{ id: string; ok: boolean; error?: string }> = [];
        for (const s of due ?? []) {
          try {
            const { runOrchestrator } = await import("@/lib/orchestrator.server");
            await runOrchestrator({ supabase: supabaseAdmin as any, userId: s.user_id, channelId: s.channel_id });
            results.push({ id: s.id, ok: true });
          } catch (e) {
            results.push({ id: s.id, ok: false, error: e instanceof Error ? e.message : String(e) });
          }
          // Advance next_run_at
          let next: string | null = null;
          const nowD = new Date();
          if (s.mode === "interval" && s.interval_hours) {
            next = new Date(nowD.getTime() + Number(s.interval_hours) * 3600_000).toISOString();
          } else if (s.mode === "daily_times" && s.daily_times?.length) {
            const cands = s.daily_times.map((t: string) => {
              const [h, m] = t.split(":").map(Number);
              const d = new Date(nowD); d.setUTCHours(h ?? 0, m ?? 0, 0, 0);
              if (d <= nowD) d.setUTCDate(d.getUTCDate() + 1);
              return d;
            }).sort((a, b) => a.getTime() - b.getTime());
            next = cands[0].toISOString();
          }
          await supabaseAdmin.from("schedules").update({ next_run_at: next, last_run_at: now }).eq("id", s.id);
        }
        return Response.json({ processed: results.length, results });
      },
    },
  },
});
