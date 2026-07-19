import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const listQueue = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("video_queue")
      .select("id,position,cloudinary_url,status,attempts,error,added_at,processed_at,channel_id")
      .order("position", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const addSchema = z.object({
  urls: z.array(z.string().url()).min(1),
  channel_id: z.string().uuid().nullable().optional(),
});
export const addToQueue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => addSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { data: maxRow } = await context.supabase
      .from("video_queue")
      .select("position")
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();
    const start = (maxRow?.position ?? 0) + 1;
    const rows = data.urls.map((u, i) => ({
      user_id: context.userId,
      cloudinary_url: u,
      channel_id: data.channel_id ?? null,
      position: start + i,
    }));
    const { error } = await context.supabase.from("video_queue").insert(rows);
    if (error) throw new Error(error.message);
    return { added: rows.length };
  });

export const removeFromQueue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("video_queue").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const resetQueueItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("video_queue")
      .update({ status: "pending", error: null, attempts: 0, processed_at: null })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
