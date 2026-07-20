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
  graphql_endpoint: z.string().url().default("https://graphql.buffer.com"),
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
