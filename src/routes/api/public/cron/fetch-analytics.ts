// Analytics fetcher — called by pg_cron (default hourly).
// For each channel that has published posts awaiting analytics, batch-fetch
// recent post metrics from Buffer via a single GraphQL query, then match
// them back to our published_posts by buffer_post_id and upsert analytics.
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

        // Candidate published posts (have a buffer id and a channel).
        const { data: posts, error } = await supabaseAdmin
          .from("published_posts")
          .select("id,user_id,run_id,buffer_post_id,posted_at,channel_id,channels(buffer_channel_id,buffer_credentials(api_token,graphql_endpoint))")
          .not("buffer_post_id", "is", null)
          .not("channel_id", "is", null)
          .order("posted_at", { ascending: true })
          .limit(200);
        if (error) return Response.json({ error: error.message }, { status: 500 });

        const rows = posts ?? [];

        // Per-user analytics delay.
        const userIds = Array.from(new Set(rows.map((p) => p.user_id)));
        const { data: settings } = userIds.length
          ? await supabaseAdmin.from("settings").select("user_id,analytics_delay_h").in("user_id", userIds)
          : { data: [] as { user_id: string; analytics_delay_h: number }[] };
        const delayByUser = new Map((settings ?? []).map((s) => [s.user_id, s.analytics_delay_h ?? 24]));

        const now = Date.now();

        // Only process posts past the user's delay window.
        const eligible = rows.filter((p) => {
          const delayH = delayByUser.get(p.user_id) ?? 24;
          const readyAt = new Date(p.posted_at ?? 0).getTime() + delayH * 3600_000;
          return readyAt <= now;
        });

        // Group by channel to make one Buffer call per channel.
        const byChannel = new Map<string, typeof eligible>();
        for (const p of eligible) {
          const arr = byChannel.get(p.channel_id as string) ?? [];
          arr.push(p);
          byChannel.set(p.channel_id as string, arr);
        }

        const results: Array<{ post_id: string; ok: boolean; error?: string }> = [];
        const usersTouched = new Set<string>();

        for (const [channelId, channelPosts] of byChannel) {
          const cred = (channelPosts[0] as any).channels?.buffer_credentials;
          const bufferChannelId = (channelPosts[0] as any).channels?.buffer_channel_id;
          if (!cred?.api_token || !bufferChannelId) {
            for (const p of channelPosts) results.push({ post_id: p.id, ok: false, error: "no credentials or channel id" });
            continue;
          }

          let nodes: Awaited<ReturnType<ReturnType<typeof makeBufferClient>["getChannelPostsMetrics"]>> = [];
          try {
            const buffer = makeBufferClient(cred.api_token, cred.graphql_endpoint || "https://api.buffer.com");
            nodes = await buffer.getChannelPostsMetrics(bufferChannelId, 50);
          } catch (e) {
            for (const p of channelPosts) results.push({ post_id: p.id, ok: false, error: e instanceof Error ? e.message : String(e) });
            continue;
          }
          const byBufferId = new Map(nodes.map((n) => [n.id, n]));

          for (const p of channelPosts) {
            const node = byBufferId.get(p.buffer_post_id as string);
            if (!node) { results.push({ post_id: p.id, ok: false, error: "not found in Buffer response" }); continue; }
            const a = node.metrics;
            const metrics = {
              views: a.views != null ? Math.round(a.views) : null,
              likes: a.likes != null ? Math.round(a.likes) : null,
              comments: a.comments != null ? Math.round(a.comments) : null,
              shares: a.shares != null ? Math.round(a.shares) : null,
              saves: a.saves != null ? Math.round(a.saves) : null,
              reach: a.reach != null ? Math.round(a.reach) : null,
              impressions: a.impressions != null ? Math.round(a.impressions) : null,
            };
            try {
              // Upsert post_analytics (one row per published post — replace latest).
              const { data: existing } = await supabaseAdmin
                .from("post_analytics").select("id").eq("published_post_id", p.id).maybeSingle();
              if (existing) {
                await supabaseAdmin.from("post_analytics").update({
                  ...metrics, fetched_at: new Date().toISOString(), raw: node.raw as never,
                }).eq("id", existing.id);
              } else {
                await supabaseAdmin.from("post_analytics").insert({
                  published_post_id: p.id, user_id: p.user_id, ...metrics, raw: node.raw as never,
                });
              }
              await supabaseAdmin.from("published_posts").update({
                metrics_updated_at: node.metricsUpdatedAt ?? new Date().toISOString(),
              }).eq("id", p.id);

              // Evaluate prediction accuracy if this run had a prediction.
              const { data: run } = await supabaseAdmin
                .from("runs").select("prediction_id").eq("id", (p as any).run_id ?? "").maybeSingle();
              if (run?.prediction_id) {
                const { evaluatePrediction } = await import("@/lib/prediction-engine.server");
                await evaluatePrediction(supabaseAdmin, run.prediction_id, metrics);
              }
              usersTouched.add(p.user_id);
              results.push({ post_id: p.id, ok: true });
            } catch (e) {
              results.push({ post_id: p.id, ok: false, error: e instanceof Error ? e.message : String(e) });
            }
          }
        }

        // Recompute durable trend insights for each user that got fresh analytics.
        if (usersTouched.size) {
          const { recomputeTrends } = await import("@/lib/trend-analyzer.server");
          for (const uid of usersTouched) {
            try { await recomputeTrends(supabaseAdmin, uid); } catch { /* trend failure must not break ingestion */ }
          }
        }

        return Response.json({
          scanned: rows.length,
          eligible: eligible.length,
          channels: byChannel.size,
          processed: results.length,
          results,
        });
      },
    },
  },
});
