import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { syncFormulaInsightById } from "./formula-insights.server";

const scheduleIdSchema = z.object({ schedule_id: z.string().uuid() });
const insightIdSchema = z.object({ insight_id: z.string().uuid() });

export const listFormulaInsights = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => scheduleIdSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { data: schedule, error: scheduleError } = await context.supabase
      .from("recurring_schedules")
      .select("id")
      .eq("id", data.schedule_id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (scheduleError) throw new Error(scheduleError.message);
    if (!schedule) throw new Error("Recurring schedule not found");

    const { data: insights, error } = await context.supabase
      .from("formula_run_insights")
      .select("*,runs(started_at,status)")
      .eq("recurring_schedule_id", data.schedule_id)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return insights ?? [];
  });

export const syncFormulaInsight = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => insightIdSchema.parse(d))
  .handler(async ({ data, context }) => {
    const updated = await syncFormulaInsightById(context.supabase, data.insight_id, {
      userId: context.userId,
      automaticStorySync: false,
    });
    return updated;
  });
