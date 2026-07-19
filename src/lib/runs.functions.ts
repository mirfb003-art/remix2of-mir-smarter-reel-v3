import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const listRuns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("runs")
      .select(`
        id, run_number, status, strategy_used, next_strategy, error, duration_ms,
        started_at, finished_at,
        video_queue!runs_queue_item_id_fkey(cloudinary_url),
        video_analyses(summary, topic),
        captions(text, hashtags),
        published_posts(buffer_post_id, permalink, posted_at,
          post_analytics(views,likes,comments,shares,saves,reach,impressions,fetched_at)),
        learning_reports(worked, hook_verdict, change_recommendation)
      `)
      .order("started_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const manualRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ channel_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { runOrchestrator } = await import("./orchestrator.server");
    return await runOrchestrator({
      supabase: context.supabase,
      userId: context.userId,
      channelId: data.channel_id,
    });
  });

export const dashboardStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [queue, runs, memory, schedules] = await Promise.all([
      context.supabase.from("video_queue").select("status", { count: "exact" }),
      context.supabase.from("runs").select("id,status,run_number,started_at,strategy_used").order("started_at", { ascending: false }).limit(20),
      context.supabase.from("memory_insights").select("id,category,confidence,insight").eq("active", true).order("confidence", { ascending: false }).limit(5),
      context.supabase.from("schedules").select("next_run_at,active,channel_id").eq("active", true).order("next_run_at", { ascending: true }).limit(5),
    ]);

    const queueRows = queue.data ?? [];
    const total = queueRows.length;
    const done = queueRows.filter((r) => r.status === "done").length;
    const pending = queueRows.filter((r) => r.status === "pending").length;
    const failed = queueRows.filter((r) => r.status === "failed").length;

    const runsList = runs.data ?? [];
    const successRuns = runsList.filter((r) => r.status === "complete").length;
    const successRate = runsList.length ? Math.round((successRuns / runsList.length) * 100) : 0;

    // Top / worst captions by engagement
    const { data: perf } = await context.supabase
      .from("post_analytics")
      .select("views,likes,comments,shares,saves,published_post_id, published_posts!inner(run_id, runs!inner(captions(text)))")
      .order("fetched_at", { ascending: false })
      .limit(100);

    return {
      queue: { total, done, pending, failed, remaining: pending },
      runs: { recent: runsList, successRate, totalRuns: runsList.length },
      memory: { top: memory.data ?? [] },
      schedules: schedules.data ?? [],
      performance: perf ?? [],
    };
  });
