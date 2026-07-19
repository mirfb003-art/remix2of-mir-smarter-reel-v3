import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const listChannels = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("channels")
      .select("id,name,platform,buffer_channel_id,active,credential_id")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const saveSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1),
  platform: z.string().min(1),
  buffer_channel_id: z.string().min(1),
  credential_id: z.string().uuid().nullable().optional(),
  active: z.boolean().default(true),
});

export const saveChannel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => saveSchema.parse(d))
  .handler(async ({ data, context }) => {
    if (data.id) {
      const { error } = await context.supabase.from("channels").update({
        name: data.name,
        platform: data.platform,
        buffer_channel_id: data.buffer_channel_id,
        credential_id: data.credential_id ?? null,
        active: data.active,
      }).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await context.supabase.from("channels").insert({
      user_id: context.userId,
      name: data.name,
      platform: data.platform,
      buffer_channel_id: data.buffer_channel_id,
      credential_id: data.credential_id ?? null,
      active: data.active,
    }).select("id").single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const deleteChannel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("channels").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
