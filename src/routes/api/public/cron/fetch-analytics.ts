// Analytics fetcher — called by pg_cron (default hourly).
// Finds published_posts that are older than the user's analytics_delay_h
// and don't yet have a post_analytics row, then queries Buffer for metrics.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/cron/fetch-analytics")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apikey = request.headers.get("apikey");
        if (!apikey || apikey !== process.env.SUPABASE_PUBLISHABLE_KEY) {
          return new Response("Unauthorized", { status: 401 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { makeBufferClient } = await import("@/lib/buffer.server");

        // Candidates: posts with a buffer id and no analytics yet.
        const { data: posts, error } = await supabaseAdmin
          .from("published_posts")
          .select("id,user_id,buffer_post_id,posted_at,channel_id,channels(buffer_credentials(api_token,graphql_endpoint))")
          .not("buffer_post_id", "is", null)
          .order("posted_at", { ascending: true })
          .limit(50);
        if (error) return Response.json({ error: error.message }, { status: 500 });

        // Filter out posts that already have analytics (batch query).
        const ids = (posts ?? []).map((p) => p.id);
        const { data: existing } = ids.length
          ? await supabaseAdmin.from("post_analytics").select("published_post_id").in("published_post_id", ids)
          : { data: [] as { published_post_id: string }[] };
        const hasAnalytics = new Set((existing ?? []).map((r) => r.published_post_id));

        // Load delay settings per user (batch).
        const userIds = Array.from(new Set((posts ?? []).map((p) => p.user_id)));
        const { data: settings } = userIds.length
          ? await supabaseAdmin.from("settings").select("user_id,analytics_delay_h").in("user_id", userIds)
          : { data: [] as { user_id: string; analytics_delay_h: number }[] };
        const delayByUser = new Map((settings ?? []).map((s) => [s.user_id, s.analytics_delay_h ?? 24]));

        const now = Date.now();
        const results: Array<{ id: string; ok: boolean; error?: string }> = [];

        const usersTouched = new Set<string>();
        for (const p of posts ?? []) {
          if (hasAnalytics.has(p.id)) continue;
          const delayH = delayByUser.get(p.user_id) ?? 24;
          const readyAt = new Date(p.posted_at ?? 0).getTime() + delayH * 3600_000;
          if (readyAt > now) continue;

          const cred = (p as any).channels?.buffer_credentials;
          if (!cred?.api_token) { results.push({ id: p.id, ok: false, error: "no credentials" }); continue; }

          try {
            const buffer = makeBufferClient(cred.api_token, cred.graphql_endpoint);
            const res = await buffer.getPost(p.buffer_post_id!);
            if (!res) { results.push({ id: p.id, ok: false, error: "post not found" }); continue; }
            const a = res.analytics ?? {};
            const metrics = {
              views: Number(a.views ?? a.impressions ?? 0) || null,
              likes: Number(a.likes ?? a.reactions ?? 0) || null,
              comments: Number(a.comments ?? 0) || null,
              shares: Number(a.shares ?? 0) || null,
              saves: Number(a.saves ?? 0) || null,
              reach: Number(a.reach ?? 0) || null,
              impressions: Number(a.impressions ?? 0) || null,
            };
            await supabaseAdmin.from("post_analytics").insert({
              published_post_id: p.id,
              user_id: p.user_id,
              ...metrics,
              raw: res.raw as never,
            });

            // Score the run's prediction if there is one.
            const { data: run } = await supabaseAdmin
              .from("runs").select("prediction_id")
              .eq("id", (p as any).run_id ?? "").maybeSingle();
            if (run?.prediction_id) {
              const { evaluatePrediction } = await import("@/lib/prediction-engine.server");
              await evaluatePrediction(supabaseAdmin, run.prediction_id, metrics);
            }
            usersTouched.add(p.user_id);
            results.push({ id: p.id, ok: true });
          } catch (e) {
            results.push({ id: p.id, ok: false, error: e instanceof Error ? e.message : String(e) });
          }
        }

        // Recompute cross-run trends for every user that got new analytics.
        if (usersTouched.size) {
          const { recomputeTrends } = await import("@/lib/trend-analyzer.server");
          for (const uid of usersTouched) {
            try { await recomputeTrends(supabaseAdmin, uid); } catch { /* trend failure must not break analytics ingestion */ }
          }
        }

        return Response.json({ scanned: posts?.length ?? 0, processed: results.length, results });
      },
    },
  },
});
