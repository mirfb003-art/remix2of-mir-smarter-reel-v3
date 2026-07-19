import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const upsertSchema = z.object({
  id: z.string().uuid().optional(),
  channel_id: z.string().uuid(),
  mode: z.enum(["interval", "daily_times", "manual"]),
  interval_hours: z.number().nullable().optional(),
  daily_times: z.array(z.string()).default([]),
  active: z.boolean().default(true),
});

function computeNextRun(mode: string, interval_hours: number | null | undefined, daily_times: string[]): string | null {
  const now = new Date();
  if (mode === "interval" && interval_hours && interval_hours > 0) {
    return new Date(now.getTime() + interval_hours * 3600_000).toISOString();
  }
  if (mode === "daily_times" && daily_times.length) {
    const candidates = daily_times.map((t) => {
      const [h, m] = t.split(":").map(Number);
      const d = new Date(now); d.setUTCHours(h ?? 0, m ?? 0, 0, 0);
      if (d <= now) d.setUTCDate(d.getUTCDate() + 1);
      return d;
    }).sort((a, b) => a.getTime() - b.getTime());
    return candidates[0].toISOString();
  }
  return null;
}

export const listSchedules = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.from("schedules")
      .select("id,channel_id,mode,interval_hours,daily_times,next_run_at,last_run_at,active")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const upsertSchedule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => upsertSchema.parse(d))
  .handler(async ({ data, context }) => {
    const next_run_at = computeNextRun(data.mode, data.interval_hours, data.daily_times);
    if (data.id) {
      const { error } = await context.supabase.from("schedules").update({
        channel_id: data.channel_id, mode: data.mode,
        interval_hours: data.interval_hours ?? null,
        daily_times: data.daily_times, active: data.active, next_run_at,
      }).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await context.supabase.from("schedules").insert({
      user_id: context.userId, channel_id: data.channel_id, mode: data.mode,
      interval_hours: data.interval_hours ?? null, daily_times: data.daily_times,
      active: data.active, next_run_at,
    }).select("id").single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const deleteSchedule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("schedules").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
