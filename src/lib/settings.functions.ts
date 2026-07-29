import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const getAllSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const uid = context.userId;
    const sb = context.supabase;

    let [ai, analysis, general, profile] = await Promise.all([
      sb.from("ai_settings").select("*").eq("user_id", uid).maybeSingle(),
      sb.from("analysis_settings").select("*").eq("user_id", uid).maybeSingle(),
      sb.from("settings").select("*").eq("user_id", uid).maybeSingle(),
      sb.from("profiles").select("*").eq("id", uid).maybeSingle(),
    ]);

    // Self-heal: accounts created before the defaults trigger (or partially
    // seeded rows) would otherwise leave the settings pages stuck loading.
    if (!ai.data) ai = await sb.from("ai_settings").insert({ user_id: uid }).select().maybeSingle();
    if (!analysis.data) analysis = await sb.from("analysis_settings").insert({ user_id: uid }).select().maybeSingle();
    if (!general.data) general = await sb.from("settings").insert({ user_id: uid }).select().maybeSingle();
    if (!profile.data) profile = await sb.from("profiles").insert({ id: uid }).select().maybeSingle();

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
    const { error } = await context.supabase
      .from("ai_settings")
      .upsert({ ...data, user_id: context.userId }, { onConflict: "user_id" });
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
    const { error } = await context.supabase
      .from("analysis_settings")
      .upsert({ ...data, user_id: context.userId }, { onConflict: "user_id" });
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
    const { error } = await context.supabase
      .from("settings")
      .upsert({ ...data, user_id: context.userId }, { onConflict: "user_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const profileSchema = z.object({ display_name: z.string().nullable().optional(), timezone: z.string() });
export const updateProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => profileSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("profiles")
      .upsert({ ...data, id: context.userId }, { onConflict: "id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

