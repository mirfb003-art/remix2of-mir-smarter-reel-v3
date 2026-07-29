import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import {
  PROVIDER_META, MODEL_REGISTRY, healthCheckProvider, resolveAISettings,
  type ProviderId, type ProviderConfig,
} from "./ai-gateway.server";

const providerIds = ["google","lovable","openai","openrouter","cloudflare","groq","deepseek"] as const;

const providerConfigSchema = z.object({
  id: z.enum(providerIds),
  apiKey: z.string(),
  selectedModel: z.string(),
  baseUrl: z.string().nullable().optional(),
  accountId: z.string().nullable().optional(),
});

const providersSchema = z.object({
  mode: z.enum(["strict","fallback"]),
  activeProvider: z.enum(providerIds),
  fallbackChain: z.array(z.enum(providerIds)),
  providers: z.record(z.string(), providerConfigSchema),
});

export const getProviderCatalog = createServerFn({ method: "GET" })
  .handler(async () => ({ meta: PROVIDER_META, models: MODEL_REGISTRY }));

export const updateAIProviders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => providersSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("ai_settings").upsert({
      user_id: context.userId,
      provider_mode: data.mode,
      active_provider: data.activeProvider,
      fallback_chain: data.fallbackChain as never,
      providers_config: data.providers as never,
    }, { onConflict: "user_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });


export const runHealthCheck = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => providerConfigSchema.parse(d))
  .handler(async ({ data }) => {
    const cfg: ProviderConfig = {
      id: data.id as ProviderId,
      apiKey: data.apiKey,
      selectedModel: data.selectedModel,
      baseUrl: data.baseUrl ?? undefined,
      accountId: data.accountId ?? undefined,
    };
    return healthCheckProvider(cfg);
  });

export const getResolvedAISettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.from("ai_settings").select("*").eq("user_id", context.userId).maybeSingle();
    return resolveAISettings(data);
  });

export const discoverGeminiModels = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      apiKey: z.string().min(1, "API key required"),
      verify: z.boolean().optional(),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const { discoverAndVerifyGeminiModels } = await import("./providers/gemini-verifier");
    const models = await discoverAndVerifyGeminiModels(data.apiKey, { verify: data.verify ?? true });
    return { models };
  });

