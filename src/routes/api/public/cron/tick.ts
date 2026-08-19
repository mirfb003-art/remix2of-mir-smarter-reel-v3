// Cron tick — called by pg_cron every 5 minutes.
// Advances due schedules by running the orchestrator for each.
import { timingSafeEqual } from "node:crypto";
import { createFileRoute } from "@tanstack/react-router";

function hasValidCronSecret(request: Request): boolean {
  const expected = process.env.CRON_SECRET ?? "";
  const provided = request.headers.get("x-cron-secret") ?? "";
  if (!expected || !provided) return false;

  const expectedBytes = new TextEncoder().encode(expected);
  const providedBytes = new TextEncoder().encode(provided);
  return expectedBytes.length === providedBytes.length
    && timingSafeEqual(expectedBytes, providedBytes);
}

function nextLegacyScheduleRunAt(schedule: {
  mode: string;
  interval_hours: number | null;
  daily_times: string[] | null;
}, now: Date): string | null {
  if (schedule.mode === "interval" && schedule.interval_hours) {
    return new Date(now.getTime() + Number(schedule.interval_hours) * 3600_000).toISOString();
  }
  if (schedule.mode === "daily_times" && schedule.daily_times?.length) {
    const candidates = schedule.daily_times.map((time) => {
      const [hours, minutes] = time.split(":").map(Number);
      const candidate = new Date(now);
      candidate.setUTCHours(hours ?? 0, minutes ?? 0, 0, 0);
      if (candidate <= now) candidate.setUTCDate(candidate.getUTCDate() + 1);
      return candidate;
    }).sort((a, b) => a.getTime() - b.getTime());
    return candidates[0]?.toISOString() ?? null;
  }
  return null;
}

export const Route = createFileRoute("/api/public/cron/tick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!hasValidCronSecret(request)) return new Response("Unauthorized", { status: 401 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const now = new Date().toISOString();
        const nowDate = new Date(now);
        const { data: due } = await supabaseAdmin
          .from("schedules")
          .select("id,user_id,channel_id,campaign_id,mode,interval_hours,daily_times,paused,campaigns(status)")
          .eq("active", true)
          .eq("paused", false)
          .lte("next_run_at", now)
          .order("next_run_at", { ascending: true })
          .order("id", { ascending: true })
          .limit(20);

        const results: Array<{ id: string; ok: boolean; error?: string; skipped?: string }> = [];
        for (const schedule of due ?? []) {
          const campaignStatus = (schedule as any).campaigns?.status;
          if (campaignStatus && campaignStatus !== "active") {
            results.push({ id: schedule.id, ok: false, error: `campaign ${campaignStatus}` });
            continue;
          }

          const nextRunAt = nextLegacyScheduleRunAt(schedule, nowDate);
          if (!nextRunAt) {
            results.push({ id: schedule.id, ok: false, error: "Unable to compute next run time" });
            continue;
          }

          const { data: claimed, error: claimError } = await supabaseAdmin.rpc("claim_schedule_slot", {
            _schedule_id: schedule.id,
            _now: now,
            _next_run_at: nextRunAt,
          });
          if (claimError) {
            results.push({ id: schedule.id, ok: false, error: `schedule claim: ${claimError.message}` });
            continue;
          }
          if (!claimed) {
            results.push({ id: schedule.id, ok: true, skipped: "already_claimed" });
            continue;
          }

          try {
            const { runOrchestrator } = await import("@/lib/orchestrator.server");
            await runOrchestrator({
              supabase: supabaseAdmin as any,
              userId: schedule.user_id,
              channelId: schedule.channel_id,
              campaignId: schedule.campaign_id ?? null,
            });
            results.push({ id: schedule.id, ok: true });
          } catch (error) {
            results.push({ id: schedule.id, ok: false, error: error instanceof Error ? error.message : String(error) });
          }
        }

        const { data: formulaDue } = await supabaseAdmin
          .from("recurring_schedules")
          .select("id,user_id,campaign_id,next_run_at,is_active,campaigns(status)")
          .eq("is_active", true)
          .neq("scheduler_mode", "manual")
          .lte("next_run_at", now)
          .order("next_run_at", { ascending: true })
          .order("id", { ascending: true })
          .limit(20);
        const formulaResults: Array<{ id: string; ok: boolean; error?: string; skipped?: string }> = [];
        for (const schedule of formulaDue ?? []) {
          const campaignStatus = (schedule as any).campaigns?.status;
          if (campaignStatus && campaignStatus !== "active") {
            formulaResults.push({ id: schedule.id, ok: false, error: `campaign ${campaignStatus}` });
            continue;
          }
          try {
            const { runReelFormulaSchedule } = await import("@/lib/reel-formula.server");
            const result = await runReelFormulaSchedule(supabaseAdmin as any, schedule.id, schedule.next_run_at ?? now);
            formulaResults.push({ id: schedule.id, ok: true, skipped: result.skipped ? result.reason : undefined });
          } catch (error) {
            formulaResults.push({ id: schedule.id, ok: false, error: error instanceof Error ? error.message : String(error) });
          }
        }

        const { runDueFormulaStoryInsights } = await import("@/lib/formula-insights.server");
        const formulaInsightResults = await runDueFormulaStoryInsights(supabaseAdmin as any);
        const { runDueMultiChannelSchedules } = await import("@/lib/multi-channel.server");
        const multiChannelResults = await runDueMultiChannelSchedules(supabaseAdmin as any);
        const { runDueSheetModeSheets } = await import("@/lib/sheet-mode.server");
        const sheetModeResults = await runDueSheetModeSheets(supabaseAdmin as any);
        return Response.json({
          processed: results.length + formulaResults.length + formulaInsightResults.length + multiChannelResults.length + sheetModeResults.length,
          results,
          formulaResults,
          formulaInsightResults,
          multiChannelResults,
          sheetModeResults,
        });
      },
    },
  },
});
