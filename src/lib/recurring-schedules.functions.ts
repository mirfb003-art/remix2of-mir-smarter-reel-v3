import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const platform = z.enum(["instagram", "tiktok"]);
const postType = z.enum(["reel", "story", "video"]);
const scheduleInput = z.object({
  campaign_id: z.string().uuid().nullable().optional(),
  channel_id: z.string().uuid(),
  platform,
  post_type: postType,
  media_url: z.string().url().max(2000),
  caption: z.string().max(4000).default(""),
  share_to_feed: z.boolean().default(true),
  thumbnail_timestamp: z.number().min(0).max(86400).default(0),
  privacy_level: z.enum(["PUBLIC", "MUTUAL_FOLLOWS", "SELF_ONLY"]).nullable().optional(),
  allow_comments: z.boolean().default(true),
  allow_duet: z.boolean().default(false),
  allow_stitch: z.boolean().default(false),
  interval_hours: z.number().int().min(1).max(8760),
  start_at: z.string().datetime().nullable().optional(),
});

async function assertOwner(sb: any, userId: string, campaignId: string | null | undefined, channelId: string, expectedPlatform: string) {
  const [{ data: channel, error: channelError }, campaignResult] = await Promise.all([
    sb.from("channels").select("id,platform,active").eq("id", channelId).eq("user_id", userId).maybeSingle(),
    campaignId ? sb.from("campaigns").select("id").eq("id", campaignId).eq("user_id", userId).maybeSingle() : Promise.resolve({ data: { id: null }, error: null }),
  ]);
  if (channelError) throw new Error(channelError.message);
  if (!channel) throw new Error("Connected channel not found");
  if (!channel.active) throw new Error("Selected channel is inactive");
  if (String(channel.platform).toLowerCase() !== expectedPlatform) throw new Error("Selected channel platform does not match the form");
  if (campaignResult.error) throw new Error(campaignResult.error.message);
  if (campaignId && !campaignResult.data) throw new Error("Campaign not found");
}

export const listRecurringSchedules = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("recurring_schedules")
      .select("*,channels(name,platform),campaigns(name)")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const activateRecurringSchedule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => scheduleInput.parse(d))
  .handler(async ({ data, context }) => {
    const normalizedPlatform = data.platform.toLowerCase();
    const normalizedPostType = data.post_type === "reel" || data.post_type === "video" ? data.post_type : "story";
    if (normalizedPlatform === "instagram" && !["reel", "story"].includes(normalizedPostType)) throw new Error("Instagram supports Reel or Story only");
    if (normalizedPlatform === "tiktok" && !["video", "story"].includes(normalizedPostType)) throw new Error("TikTok supports Video or Story only");
    if (normalizedPlatform === "instagram" && normalizedPostType === "story") data.caption = "";
    await assertOwner(context.supabase, context.userId, data.campaign_id, data.channel_id, normalizedPlatform);
    const nextRun = data.start_at ?? new Date().toISOString();
    const { data: row, error } = await context.supabase.from("recurring_schedules").insert({
      user_id: context.userId,
      campaign_id: data.campaign_id ?? null,
      channel_id: data.channel_id,
      platform: normalizedPlatform,
      post_type: normalizedPostType,
      media_url: data.media_url,
      caption: data.caption,
      share_to_feed: normalizedPlatform === "instagram" && normalizedPostType === "reel" ? data.share_to_feed : false,
      thumbnail_timestamp: data.thumbnail_timestamp,
      privacy_level: normalizedPlatform === "tiktok" ? (data.privacy_level ?? "PUBLIC") : null,
      allow_comments: data.allow_comments,
      allow_duet: normalizedPlatform === "tiktok" ? data.allow_duet : false,
      allow_stitch: normalizedPlatform === "tiktok" ? data.allow_stitch : false,
      interval_hours: data.interval_hours,
      start_at: data.start_at ?? null,
      next_run_at: nextRun,
      is_active: true,
    }).select("*").single();
    if (error) throw new Error(error.message);
    return row;
  });

export const setRecurringScheduleActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), is_active: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase.from("recurring_schedules")
      .update({ is_active: data.is_active, last_error: null })
      .eq("id", data.id).eq("user_id", context.userId)
      .select("*").maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Recurring schedule not found");
    return row;
  });

export const deleteRecurringSchedule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error, count } = await context.supabase.from("recurring_schedules")
      .delete({ count: "exact" }).eq("id", data.id).eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    if (!count) throw new Error("Recurring schedule not found");
    return { ok: true };
  });

export const listFormulaRunHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ schedule_id: z.string().uuid().optional() }).optional().parse(d))
  .handler(async ({ data, context }) => {
    let q = context.supabase.from("runs")
      .select("id,status,error,started_at,finished_at,duration_ms,strategy_used,published_posts(buffer_post_id,permalink,posted_at,buffer_status,due_at,verified_at,platform,text_content),audit_events(event_type,status,error,created_at,payload)")
      .eq("user_id", context.userId).eq("strategy_used", "1_reel_formula")
      .order("started_at", { ascending: false }).limit(100);
    if (data?.schedule_id) q = q.contains("step_state", { recurring_schedule_id: data.schedule_id });
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });
