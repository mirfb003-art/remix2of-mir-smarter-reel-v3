import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const getAllSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [ai, analysis, general, profile] = await Promise.all([
      context.supabase.from("ai_settings").select("*").eq("user_id", context.userId).maybeSingle(),
      context.supabase.from("analysis_settings").select("*").eq("user_id", context.userId).maybeSingle(),
      context.supabase.from("settings").select("*").eq("user_id", context.userId).maybeSingle(),
      context.supabase.from("profiles").select("*").eq("id", context.userId).maybeSingle(),
    ]);
    return { ai: ai.data, analysis: analysis.data, general: general.data, profile: profile.data };
  });

const aiSchema = z.object({
  objective: z.enum(["followers","likes","comments","shares","saves","watch_time","profile_visits","ctr","reach","engagement","brand_awareness","custom"]),
  custom_objective: z.string().nullable().optional(),
  brand_tone: z.string(),
  language: z.string(),
  default_hashtags: z.array(z.string()),
  max_caption_length: z.number().int().min(50).max(5000),
  temperature: z.number().min(0).max(2),
  model: z.string(),
  user_instructions: z.string().nullable().optional(),
});
export const updateAiSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => aiSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("ai_settings").update(data).eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const analysisSchema = z.object({
  scope: z.enum(["last_n","top_n","highest_engagement","highest_views","highest_saves","all","custom"]),
  n_value: z.number().int().min(1).max(500),
  custom_query: z.string().nullable().optional(),
});
export const updateAnalysisSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => analysisSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("analysis_settings").update(data).eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const generalSchema = z.object({
  max_retries: z.number().int().min(0).max(10),
  retry_interval_s: z.number().int().min(1).max(3600),
  analytics_delay_h: z.number().int().min(0).max(168),
  rate_limit_per_min: z.number().int().min(1).max(1000),
});
export const updateGeneralSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => generalSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("settings").update(data).eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const profileSchema = z.object({ display_name: z.string().nullable().optional(), timezone: z.string() });
export const updateProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => profileSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("profiles").update(data).eq("id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
