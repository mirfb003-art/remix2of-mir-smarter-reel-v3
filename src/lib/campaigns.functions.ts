import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const listCampaigns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("campaigns")
      .select("id,name,description,objective,custom_objective,status,share_learning,publish_mode,custom_scheduled_at,publish_delay_minutes,created_at,updated_at")
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const upsertSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(120),
  description: z.string().optional().nullable(),
  objective: z.string().min(1),
  custom_objective: z.string().optional().nullable(),
  share_learning: z.boolean().optional(),
  publish_mode: z.enum(["addToQueue", "shareNow", "customScheduled"]).optional(),
  custom_scheduled_at: z.string().nullable().optional(),
  publish_delay_minutes: z.number().int().min(1).max(10080).nullable().optional(),
});

export const upsertCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => upsertSchema.parse(d))
  .handler(async ({ data, context }) => {
    const publishFields = {
      publish_mode: data.publish_mode ?? "addToQueue",
      custom_scheduled_at: data.custom_scheduled_at ?? null,
      publish_delay_minutes: data.publish_delay_minutes ?? null,
    };
    if (data.id) {
      const { error } = await context.supabase.from("campaigns").update({
        name: data.name, description: data.description ?? null,
        objective: data.objective, custom_objective: data.custom_objective ?? null,
        share_learning: data.share_learning ?? false,
        ...publishFields,
      }).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await context.supabase.from("campaigns").insert({
      user_id: context.userId, name: data.name, description: data.description ?? null,
      objective: data.objective, custom_objective: data.custom_objective ?? null,
      share_learning: data.share_learning ?? false,
      ...publishFields,
    }).select("id").single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const updateCampaignPublishing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    id: z.string().uuid(),
    publish_mode: z.enum(["addToQueue", "shareNow", "customScheduled"]),
    custom_scheduled_at: z.string().nullable().optional(),
    publish_delay_minutes: z.number().int().min(1).max(10080).nullable().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("campaigns").update({
      publish_mode: data.publish_mode,
      custom_scheduled_at: data.custom_scheduled_at ?? null,
      publish_delay_minutes: data.publish_delay_minutes ?? null,
    }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });


export const setCampaignStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    id: z.string().uuid(),
    status: z.enum(["active", "paused", "stopped"]),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("campaigns")
      .update({ status: data.status }).eq("id", data.id);
    if (error) throw new Error(error.message);
    // Also pause/resume all schedules attached to this campaign.
    await context.supabase.from("schedules")
      .update({ paused: data.status !== "active" })
      .eq("campaign_id", data.id);
    return { ok: true };
  });

export const deleteCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("campaigns").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// --- Per-campaign maintenance: reset / clear data, keeping the campaign itself ---
const resetSchema = z.object({
  id: z.string().uuid(),
  clear_queue: z.boolean().default(true),
  clear_runs: z.boolean().default(true),
  clear_memory: z.boolean().default(false),
});

export const resetCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => resetSchema.parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const camp = data.id;

    if (data.clear_runs) {
      const { data: runs } = await sb.from("runs").select("id").eq("campaign_id", camp);
      const runIds = (runs ?? []).map((r) => r.id);
      if (runIds.length) {
        const { data: posts } = await sb.from("published_posts").select("id").in("run_id", runIds);
        const postIds = (posts ?? []).map((p) => p.id);
        if (postIds.length) await sb.from("post_analytics").delete().in("published_post_id", postIds);
        await sb.from("published_posts").delete().in("run_id", runIds);
        await sb.from("captions").delete().in("run_id", runIds);
        await sb.from("video_analyses").delete().in("run_id", runIds);
        await sb.from("learning_reports").delete().in("run_id", runIds);
        await sb.from("predictions").delete().in("run_id", runIds);
        await sb.from("strategies").delete().in("run_id", runIds);
        await sb.from("runs").update({ prediction_id: null, strategy_id: null }).in("id", runIds);
        const { error } = await sb.from("runs").delete().in("id", runIds);
        if (error) throw new Error(error.message);
      }
    }

    if (data.clear_queue) {
      const { error } = await sb.from("video_queue").delete().eq("campaign_id", camp);
      if (error) throw new Error(error.message);
    } else {
      // Keep the videos but send everything back to pending, renumbered from 1.
      await sb.from("video_queue").update({
        status: "pending", error: null, attempts: 0, processed_at: null,
        dead_letter_at: null, last_error_module: null,
      }).eq("campaign_id", camp);
      const { data: items } = await sb.from("video_queue")
        .select("id,position").eq("campaign_id", camp).order("position", { ascending: true });
      let i = 1;
      for (const it of items ?? []) {
        if (it.position !== i) await sb.from("video_queue").update({ position: i }).eq("id", it.id);
        i++;
      }
    }

    if (data.clear_memory) {
      await sb.from("memory_insights").delete().eq("campaign_id", camp);
      await sb.from("insight_trends").delete().eq("campaign_id", camp);
    }

    // Release any lingering channel locks for this campaign.
    await sb.from("channels").update({ active_run_id: null, lock_expires_at: null }).eq("campaign_id", camp);

    return { ok: true };
  });
