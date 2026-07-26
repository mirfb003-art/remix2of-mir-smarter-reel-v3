import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const listBufferCreds = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("buffer_credentials")
      .select("id,label,graphql_endpoint,status,last_tested_at,created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const saveSchema = z.object({
  id: z.string().uuid().optional(),
  label: z.string().min(1).max(80),
  api_token: z.string().min(10),
  graphql_endpoint: z.string().url().default("https://api.buffer.com"),
});

export const saveBufferCred = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => saveSchema.parse(d))
  .handler(async ({ data, context }) => {
    if (data.id) {
      const { error } = await context.supabase
        .from("buffer_credentials")
        .update({ label: data.label, api_token: data.api_token, graphql_endpoint: data.graphql_endpoint })
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await context.supabase
      .from("buffer_credentials")
      .insert({
        user_id: context.userId,
        label: data.label,
        api_token: data.api_token,
        graphql_endpoint: data.graphql_endpoint,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const deleteBufferCred = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("buffer_credentials").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const testBufferCred = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: cred, error } = await context.supabase
      .from("buffer_credentials")
      .select("api_token,graphql_endpoint")
      .eq("id", data.id)
      .single();
    if (error || !cred) throw new Error("Credential not found");
    const { makeBufferClient } = await import("./buffer.server");
    const result = await makeBufferClient(cred.api_token, cred.graphql_endpoint).testConnection();
    await context.supabase
      .from("buffer_credentials")
      .update({ status: result.ok ? "connected" : "error", last_tested_at: new Date().toISOString() })
      .eq("id", data.id);
    return result;
  });

export const verifyBufferSchema = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: cred, error } = await context.supabase
      .from("buffer_credentials")
      .select("api_token,graphql_endpoint")
      .eq("id", data.id)
      .single();
    if (error || !cred) throw new Error("Credential not found");
    const { makeBufferClient } = await import("./buffer.server");
    return await makeBufferClient(cred.api_token, cred.graphql_endpoint).verifySchema();
  });

export const syncBufferChannels = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: cred, error } = await context.supabase
      .from("buffer_credentials")
      .select("api_token,graphql_endpoint")
      .eq("id", data.id)
      .single();
    if (error || !cred) throw new Error("Credential not found");

    const endpoints = Array.from(new Set([
      cred.graphql_endpoint,
      "https://api.buffer.com",
      "https://graphql.buffer.com",
    ]));

    const query = `query { account { organizations { id channels { id name displayName service avatar } } } }`;
    let payload: any = null;
    let lastErr = "";
    for (const url of endpoints) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${cred.api_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ query }),
        });
        const body = await res.text();
        if (!res.ok) { lastErr = `${url} ${res.status}: ${body.slice(0, 200)}`; continue; }
        const parsed = JSON.parse(body);
        if (parsed?.errors?.length) { lastErr = `${url}: ${parsed.errors.map((e: any) => e.message).join("; ")}`; continue; }
        if (parsed?.data?.account?.organizations) { payload = parsed; break; }
        lastErr = `${url}: unexpected shape`;
      } catch (e) {
        lastErr = e instanceof Error ? e.message : String(e);
      }
    }
    if (!payload) throw new Error(`Buffer sync failed: ${lastErr || "no data"}`);

    const orgs: Array<{ channels?: Array<{ id: string; name?: string; displayName?: string; service?: string; avatar?: string }> }> =
      payload.data.account.organizations ?? [];
    const channels = orgs.flatMap((o) => o.channels ?? []);

    // Existing channels for this credential
    const { data: existing } = await context.supabase
      .from("channels")
      .select("id,buffer_channel_id")
      .eq("user_id", context.userId)
      .eq("credential_id", data.id);
    const existingMap = new Map((existing ?? []).map((c) => [c.buffer_channel_id, c.id]));

    const synced: Array<{ id: string; name: string; platform: string; avatar?: string }> = [];
    for (const ch of channels) {
      const name = ch.displayName || ch.name || ch.service || "Channel";
      const platform = (ch.service || "unknown").toLowerCase();
      if (existingMap.has(ch.id)) {
        await context.supabase.from("channels").update({
          name, platform,
        }).eq("id", existingMap.get(ch.id)!);
      } else {
        await context.supabase.from("channels").insert({
          user_id: context.userId,
          credential_id: data.id,
          buffer_channel_id: ch.id,
          name,
          platform,
          active: true,
        });
      }
      synced.push({ id: ch.id, name, platform, avatar: ch.avatar });
    }

    await context.supabase
      .from("buffer_credentials")
      .update({ status: "connected", last_tested_at: new Date().toISOString() })
      .eq("id", data.id);

    return { count: synced.length, channels: synced };
  });
