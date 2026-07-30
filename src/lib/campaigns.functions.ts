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
