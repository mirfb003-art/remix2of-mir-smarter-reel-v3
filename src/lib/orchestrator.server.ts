// Orchestrator: adaptive learning loop for one video.
// Step-based state machine — resumes from last completed step on retry.
import { generateText } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAiGateway, requireLovableApiKey } from "./ai-gateway.server";
import {
  withRetry, audit, acquireChannelLock, releaseChannelLock,
  refreshHeartbeat, getActivePromptVersion, makeIdempotencyKey,
} from "./reliability.server";

import { decideStrategy, type StrategyDecision } from "./strategy-engine.server";
import { predictMetrics, computeBaseline } from "./prediction-engine.server";

type Sb = SupabaseClient;

// Ordered step list. Runs resume from the first step whose output is missing.
type Step = "analyze_previous" | "analyze_video" | "strategy" | "predict" | "generate_caption" | "publish" | "finalize";
const STEP_ORDER: Step[] = ["analyze_previous", "analyze_video", "strategy", "predict", "generate_caption", "publish", "finalize"];

interface StepState {
  analyze_previous?: { done: boolean; report?: unknown };
  analyze_video?: { done: boolean; summary?: any };
  strategy?: { done: boolean; decision?: StrategyDecision; strategyId?: string };
  predict?: { done: boolean; predictionId?: string };
  generate_caption?: { done: boolean; caption?: any };
  publish?: { done: boolean; postId?: string; postedAt?: string };
  finalize?: { done: boolean };
}

function cloudinaryThumb(url: string, offset = "auto"): string {
  const m = url.match(/^(.*\/upload\/)(.*)$/);
  if (!m) return url;
  const rest = m[2].replace(/\.[a-zA-Z0-9]+$/, ".jpg");
  return `${m[1]}so_${offset},w_640,c_fill,q_auto,f_jpg/${rest}`;
}

// Keep only frames Cloudinary can actually render; a bad offset returns 400 and
// breaks the whole vision call.
async function usableFrames(urls: string[]): Promise<string[]> {
  const checked = await Promise.all(
    urls.map(async (u) => {
      try {
        const res = await fetch(u, { method: "GET", headers: { Range: "bytes=0-0" } });
        return res.ok || res.status === 206 ? u : null;
      } catch {
        return null;
      }
    }),
  );
  return checked.filter((u): u is string => Boolean(u));
}


async function log(sb: Sb, userId: string, runId: string | null, level: string, module: string, message: string, meta?: unknown) {
  await sb.from("logs").insert({ user_id: userId, run_id: runId, level, module, message, meta: (meta ?? null) as never });
}

async function persistStepState(sb: Sb, runId: string, state: StepState, currentStep: string) {
  await sb.from("runs").update({
    step_state: state as never,
    current_step: currentStep,
    heartbeat_at: new Date().toISOString(),
  }).eq("id", runId);
}

// -------- Step implementations --------

async function stepAnalyzePrevious(sb: Sb, userId: string, runId: string, apiKey: string, model: string, learningPrompt: string) {
  const { data: prev } = await sb.from("runs")
    .select(`id, captions(text,hashtags,cta,hook,length),
      published_posts(post_analytics(views,likes,comments,shares,saves,reach,impressions))`)
    .eq("user_id", userId).eq("status", "complete").neq("id", runId)
    .order("started_at", { ascending: false }).limit(1).maybeSingle();
  if (!prev) return null;
  const cap = (prev as any).captions?.[0];
  const analytics = (prev as any).published_posts?.[0]?.post_analytics?.[0];
  if (!cap) return null;

  const provider = createAiGateway(apiKey);
  const t0 = Date.now();
  const result = await withRetry("ai",
    async () => generateText({
      model: provider(model),
      prompt: `${learningPrompt}\n\nPrevious caption: ${JSON.stringify(cap)}\nAnalytics: ${JSON.stringify(analytics ?? {})}`,
    }),
    async (attempt, err, durationMs) => {
      await audit(sb, {
        userId, runId, eventType: err ? "ai.retry" : "ai.response",
        module: "ai", attempt, status: err ? "error" : "success", durationMs,
        error: err instanceof Error ? err.message : err ? String(err) : null,
        payload: { purpose: "learning_report", model },
      });
    },
  );
  const text = result.text;
  let report: any = {};
  try { report = JSON.parse(text.replace(/^```json\s*/i,"").replace(/```$/,"").trim()); } catch { report = { cause: text.slice(0,300) }; }

  await sb.from("learning_reports").insert({
    run_id: runId, user_id: userId,
    worked: !!report.worked,
    hook_verdict: report.hook_verdict ?? null,
    length_verdict: report.length_verdict ?? null,
    emoji_verdict: report.emoji_verdict ?? null,
    hashtag_verdict: report.hashtag_verdict ?? null,
    cta_verdict: report.cta_verdict ?? null,
    cause: report.cause ?? null,
    change_recommendation: report.change_recommendation ?? null,
    raw: report,
  });

  const insights = (report.new_insights ?? []) as Array<{ category: string; insight: string; confidence: number }>;
  for (const ins of insights) {
    const { data: existing } = await sb.from("memory_insights").select("id,support_count,confidence")
      .eq("user_id", userId).eq("category", ins.category as any).ilike("insight", ins.insight).maybeSingle();
    if (existing) {
      await sb.from("memory_insights").update({
        support_count: existing.support_count + 1,
        confidence: Math.min(1, (existing.confidence + (ins.confidence ?? 0.5)) / 2 + 0.05),
        last_reinforced_at: new Date().toISOString(),
      }).eq("id", existing.id);
    } else {
      await sb.from("memory_insights").insert({
        user_id: userId, category: ins.category as any, insight: ins.insight,
        confidence: ins.confidence ?? 0.5, support_count: 1,
      });
    }
  }
  await audit(sb, { userId, runId, eventType: "learning.report_saved", module: "orchestrator", status: "success", durationMs: Date.now() - t0 });
  return report;
}

async function stepAnalyzeVideo(sb: Sb, userId: string, runId: string, url: string, apiKey: string, model: string, visionPrompt: string) {
  const provider = createAiGateway(apiKey);
  // Cloudinary percent offsets use the "p" suffix (so_25p); a literal "%" 400s.
  const candidates = ["auto", "25p", "50p", "75p"].map((o) => cloudinaryThumb(url, o));
  const ok = await usableFrames(candidates);
  const frames = ok.length ? ok : [cloudinaryThumb(url, "0")];

  const result = await withRetry("ai",
    async () => generateText({
      model: provider(model),
      messages: [{
        role: "user",
        content: [
          { type: "text", text: visionPrompt },
          ...frames.map((u) => ({ type: "image" as const, image: u })),
        ],
      }],
    }),
    async (attempt, err, durationMs) => {
      await audit(sb, {
        userId, runId, eventType: err ? "ai.retry" : "ai.response",
        module: "ai", attempt, status: err ? "error" : "success", durationMs,
        error: err instanceof Error ? err.message : err ? String(err) : null,
        payload: { purpose: "vision", model },
      });
    },
  );
  const text = result.text;
  let parsed: Record<string, unknown> = {};
  try { parsed = JSON.parse(text.replace(/^```json\s*/i,"").replace(/```$/i,"").trim()); }
  catch { parsed = { summary: text.slice(0, 500) }; }

  await sb.from("video_analyses").insert({
    run_id: runId, user_id: userId,
    summary: String(parsed.summary ?? ""),
    objects: (parsed.objects as string[]) ?? [],
    people: (parsed.people as string) ?? null,
    scene: (parsed.scene as string) ?? null,
    actions: (parsed.actions as string[]) ?? [],
    emotions: (parsed.emotions as string[]) ?? [],
    topic: (parsed.topic as string) ?? null,
    story: (parsed.story as string) ?? null,
    message: (parsed.message as string) ?? null,
    raw: parsed as never,
  });
  return parsed;
}

async function stepGenerateCaption(
  sb: Sb, userId: string, runId: string, apiKey: string, videoSummary: any, captionPrompt: string,
  strategy: StrategyDecision | null,
) {
  const [aiRes, analysisRes, memoryRes] = await Promise.all([
    sb.from("ai_settings").select("*").eq("user_id", userId).maybeSingle(),
    sb.from("analysis_settings").select("*").eq("user_id", userId).maybeSingle(),
    sb.from("memory_insights").select("category,insight,confidence").eq("user_id", userId).eq("active", true).order("confidence", { ascending: false }).limit(15),
  ]);
  const ai = aiRes.data;
  const analysisSet = analysisRes.data;
  const memory = memoryRes.data;
  const { data: prevCaps } = await sb.from("captions").select("text,hashtags").order("created_at", { ascending: false }).limit(analysisSet?.n_value ?? 5);

  const objective = ai?.objective === "custom" ? (ai?.custom_objective ?? "engagement") : (ai?.objective ?? "engagement");
  const provider = createAiGateway(apiKey);
  const prompt = `${captionPrompt}

OBJECTIVE: Maximize ${objective}
BRAND TONE: ${ai?.brand_tone}
LANGUAGE: ${ai?.language}
MAX LENGTH: ${ai?.max_caption_length}
DEFAULT HASHTAGS (may include): ${(ai?.default_hashtags ?? []).join(" ")}
USER INSTRUCTIONS: ${ai?.user_instructions ?? "(none)"}

STRATEGY (MUST FOLLOW EXACTLY):
${strategy ? JSON.stringify(strategy, null, 2) : "(no strategy — improvise sensibly)"}

DURABLE LEARNINGS (highest confidence first):
${(memory ?? []).map((m) => `- [${m.category}] ${m.insight} (${Math.round(m.confidence*100)}%)`).join("\n") || "(none yet — cold start)"}

RECENT CAPTIONS (avoid repeating structure):
${(prevCaps ?? []).map((c) => `- ${c.text}`).join("\n") || "(none)"}

CURRENT VIDEO UNDERSTANDING:
${JSON.stringify(videoSummary)}

Return JSON: { "caption", "hook", "cta", "hashtags": [...], "style_tags": [...] }. The caption's hook, length, cta, emojis, and hashtag count MUST match the STRATEGY.`;

  const result = await withRetry("ai",
    async () => generateText({
      model: provider(ai?.model ?? "google/gemini-3-flash-preview"),
      temperature: ai?.temperature ?? 0.8,
      prompt,
    }),
    async (attempt, err, durationMs) => {
      await audit(sb, {
        userId, runId, eventType: err ? "ai.retry" : "ai.response",
        module: "ai", attempt, status: err ? "error" : "success", durationMs,
        error: err instanceof Error ? err.message : err ? String(err) : null,
        payload: { purpose: "caption", model: ai?.model },
      });
    },
  );
  let out: any = {};
  try { out = JSON.parse(result.text.replace(/^```json\s*/i,"").replace(/```$/,"").trim()); }
  catch { out = { caption: result.text.slice(0, ai?.max_caption_length ?? 2200) }; }

  await sb.from("captions").insert({
    run_id: runId, user_id: userId,
    text: String(out.caption ?? ""),
    hook: out.hook ?? null,
    cta: out.cta ?? null,
    hashtags: out.hashtags ?? [],
    length: String(out.caption ?? "").length,
    style_tags: out.style_tags ?? [],
  });
  return out;
}

async function stepPublish(
  sb: Sb, userId: string, runId: string, channel: any, caption: any, videoUrl: string,
) {
  const cred = channel.buffer_credentials;
  const { makeBufferClient } = await import("./buffer.server");
  const buffer = makeBufferClient(cred.api_token, cred.graphql_endpoint);

  const t0 = Date.now();
  const published = await withRetry("buffer",
    async () => buffer.createPost({
      channelId: channel.buffer_channel_id,
      text: caption.caption,
      mediaUrl: videoUrl,
    }),
    async (attempt, err, durationMs) => {
      await audit(sb, {
        userId, runId, eventType: err ? "publish.retry" : "publish.response",
        module: "buffer", attempt, status: err ? "error" : "success", durationMs,
        error: err instanceof Error ? err.message : err ? String(err) : null,
      });
    },
  );

  const postedAt = new Date().toISOString();
  await sb.from("published_posts").insert({
    run_id: runId, user_id: userId, channel_id: channel.id,
    buffer_post_id: published.postId, platform: channel.platform,
    posted_at: postedAt, raw: published.raw as never,
  });
  await audit(sb, { userId, runId, eventType: "publish.saved", module: "orchestrator", status: "success", durationMs: Date.now() - t0, payload: { post_id: published.postId } });
  return { postId: published.postId, postedAt };
}

// -------- Main entry --------

export async function runOrchestrator({
  supabase: sb, userId, channelId, resumeRunId, campaignId: campaignIdOverride,
}: { supabase: Sb; userId: string; channelId: string; resumeRunId?: string; campaignId?: string | null }) {

  // ----- Resume path -----
  if (resumeRunId) {
    const { data: existing } = await sb.from("runs").select("*, channels(*, buffer_credentials(*))").eq("id", resumeRunId).maybeSingle();
    if (!existing) throw new Error("Run to resume not found");
    if (existing.status === "complete") return { runId: resumeRunId, resumed: true, alreadyComplete: true };
    return await executeSteps(sb, userId, existing as any, (existing as any).channels, existing.step_state as StepState);
  }


  // ----- Claim next pending queue item (optionally scoped to a campaign) -----
  let qQuery = sb.from("video_queue")
    .select("id, cloudinary_url, attempts, max_attempts, idempotency_key, campaign_id")
    .eq("user_id", userId)
    .eq("status", "pending")
    .order("position", { ascending: true })
    .limit(1);
  if (campaignIdOverride) qQuery = qQuery.eq("campaign_id", campaignIdOverride);
  const { data: qItem, error: qErr } = await qQuery.maybeSingle();
  if (qErr) throw new Error(qErr.message);
  if (!qItem) throw new Error("Queue is empty. Add Cloudinary URLs first.");
  const campaignId = campaignIdOverride ?? (qItem as any).campaign_id ?? null;


  // ----- Idempotency: if a run already exists for this queue item, reuse it -----
  const idemKey = qItem.idempotency_key ?? makeIdempotencyKey([qItem.id, channelId]);
  if (!qItem.idempotency_key) {
    await sb.from("video_queue").update({ idempotency_key: idemKey }).eq("id", qItem.id);
  }
  const { data: existingRun } = await sb.from("runs")
    .select("*, channels(*, buffer_credentials(*))")
    .eq("user_id", userId).eq("idempotency_key", idemKey)
    .maybeSingle();
  if (existingRun && existingRun.status !== "failed" && existingRun.status !== "stale") {
    if (existingRun.status === "complete") return { runId: existingRun.id, alreadyComplete: true };
    // In-flight — refuse to double-publish.
    throw new Error(`Run ${existingRun.id} already in-flight for this queue item (${existingRun.status})`);
  }

  // ----- Get channel + credentials -----
  const { data: channel } = await sb.from("channels")
    .select("*, buffer_credentials(*)").eq("id", channelId).maybeSingle();
  if (!channel) throw new Error("Channel not found");
  if (!(channel as any).buffer_credentials) throw new Error("This channel has no Buffer credential attached.");

  // ----- Create or reuse run row -----
  let runId: string;
  if (existingRun) {
    runId = existingRun.id;
    await sb.from("runs").update({
      status: "analyzing", error: null, attempts: (existingRun.attempts ?? 0) + 1,
      heartbeat_at: new Date().toISOString(),
    }).eq("id", runId);
  } else {
    const { data: lastRun } = await sb.from("runs").select("run_number").eq("user_id", userId).order("run_number", { ascending: false }).limit(1).maybeSingle();
    const nextNum = (lastRun?.run_number ?? 0) + 1;
    const promptVer = await getActivePromptVersion(sb, userId);
    const { data: run, error: runErr } = await sb.from("runs").insert({
      user_id: userId, channel_id: channelId, queue_item_id: qItem.id,
      campaign_id: campaignId,
      run_number: nextNum, status: "analyzing",
      idempotency_key: idemKey,
      current_step: "analyze_previous",
      step_state: {} as never,
      heartbeat_at: new Date().toISOString(),
      attempts: 1,
      prompt_version_id: promptVer.id,
    }).select("*").single();
    if (runErr || !run) throw new Error(runErr?.message ?? "Failed to create run");
    runId = run.id;
  }


  // ----- Acquire channel lock -----
  const gotLock = await acquireChannelLock(sb, channelId, runId);
  if (!gotLock) {
    await sb.from("runs").update({ status: "failed", error: "Channel locked by another in-flight run", finished_at: new Date().toISOString() }).eq("id", runId);
    await audit(sb, { userId, runId, eventType: "lock.denied", module: "orchestrator", status: "error" });
    throw new Error("Channel is already being processed by another run.");
  }
  await audit(sb, { userId, runId, eventType: "lock.acquired", module: "orchestrator", status: "success", payload: { channel_id: channelId } });

  // ----- Mark queue item processing (increment attempts) -----
  await sb.from("video_queue").update({
    status: "processing",
    attempts: (qItem.attempts ?? 0) + 1,
  }).eq("id", qItem.id);
  await audit(sb, { userId, runId, queueItemId: qItem.id, eventType: "queue.claimed", module: "orchestrator", status: "success", attempt: (qItem.attempts ?? 0) + 1 });

  const { data: freshRun } = await sb.from("runs").select("*").eq("id", runId).maybeSingle();
  const initialState = (freshRun?.step_state as StepState) ?? {};
  (freshRun as any).queue_item_id = qItem.id;
  (freshRun as any).queue_url = qItem.cloudinary_url;
  return await executeSteps(sb, userId, freshRun as any, channel, initialState);
}

async function executeSteps(sb: Sb, userId: string, run: any, channel: any, state: StepState) {
  const runId = run.id;
  const channelId = channel.id;
  const campaignId: string | null = run.campaign_id ?? null;
  const t0 = Date.now();
  const apiKey = requireLovableApiKey();
  const { data: aiSet } = await sb.from("ai_settings").select("model,objective").eq("user_id", userId).maybeSingle();
  const model = aiSet?.model ?? "google/gemini-3-flash-preview";

  // Determine learning scope. By default, learning is isolated per campaign.
  // If the campaign has share_learning=true (or the run has no campaign), fall back to user-wide learning.
  let scopeCampaignId: string | null = campaignId;
  if (campaignId) {
    const { data: camp } = await sb.from("campaigns").select("share_learning").eq("id", campaignId).maybeSingle();
    if (camp?.share_learning) scopeCampaignId = null;
  }


  // Load queue item info if not already on run row.
  let queueItemId: string | undefined = run.queue_item_id;
  let queueUrl: string | undefined = run.queue_url;
  if (!queueUrl && queueItemId) {
    const { data: q } = await sb.from("video_queue").select("cloudinary_url").eq("id", queueItemId).maybeSingle();
    queueUrl = q?.cloudinary_url;
  }
  if (!queueUrl) throw new Error("Queue URL missing for run");

  // Load prompt version bound to this run (falls back to active).
  let promptVer;
  if (run.prompt_version_id) {
    const { data } = await sb.from("prompt_versions")
      .select("id,name,version,vision_prompt,learning_prompt,caption_prompt")
      .eq("id", run.prompt_version_id).maybeSingle();
    promptVer = data;
  }
  if (!promptVer) promptVer = await getActivePromptVersion(sb, userId);

  try {
    await log(sb, userId, runId, "info", "orchestrator", `Run started/resumed at step ${run.current_step ?? "analyze_previous"}`);

    // Step: analyze previous
    if (!state.analyze_previous?.done) {
      await persistStepState(sb, runId, state, "analyze_previous");
      await refreshHeartbeat(sb, runId, channelId);
      const report = await stepAnalyzePrevious(sb, userId, runId, apiKey, model, promptVer.learning_prompt);
      state.analyze_previous = { done: true, report };
      await persistStepState(sb, runId, state, "analyze_video");
    }

    // Step: analyze video
    if (!state.analyze_video?.done) {
      await refreshHeartbeat(sb, runId, channelId);
      const summary = await stepAnalyzeVideo(sb, userId, runId, queueUrl, apiKey, model, promptVer.vision_prompt);
      state.analyze_video = { done: true, summary };
      await persistStepState(sb, runId, state, "strategy");
    }

    // Step: strategy — decide structured direction before writing anything.
    if (!state.strategy?.done) {
      await refreshHeartbeat(sb, runId, channelId);
      const objective = aiSet?.objective ?? "engagement";
      const memQ = sb.from("memory_insights").select("category,insight,confidence").eq("user_id", userId).eq("active", true).order("confidence", { ascending: false }).limit(15);
      const trQ = sb.from("insight_trends").select("dimension,value,metric,lift_pct,human_summary").eq("user_id", userId).order("confidence", { ascending: false }).limit(12);
      const rpQ = sb.from("learning_reports").select("worked,cause,change_recommendation").eq("user_id", userId).order("created_at", { ascending: false }).limit(3);
      const [memRes, trendRes, reportsRes] = await Promise.all([
        scopeCampaignId ? memQ.eq("campaign_id", scopeCampaignId) : memQ,
        scopeCampaignId ? trQ.eq("campaign_id", scopeCampaignId) : trQ,
        scopeCampaignId ? rpQ.eq("campaign_id", scopeCampaignId) : rpQ,
      ]);

      const { decision, strategyId } = await decideStrategy({
        sb, userId, runId, apiKey, model, objective,
        videoSummary: state.analyze_video!.summary,
        memoryTop: memRes.data ?? [],
        trends: trendRes.data ?? [],
        recentReports: reportsRes.data ?? [],
      });
      state.strategy = { done: true, decision, strategyId };
      await persistStepState(sb, runId, state, "predict");
    }

    // Step: predict — forecast metrics before publishing so we can score later.
    if (!state.predict?.done) {
      await refreshHeartbeat(sb, runId, channelId);
      const baseline = await computeBaseline(sb, userId);
      const { predictionId } = await predictMetrics({
        sb, userId, runId, apiKey, model,
        strategy: state.strategy!.decision,
        videoSummary: state.analyze_video!.summary,
        baseline,
      });
      state.predict = { done: true, predictionId };
      await persistStepState(sb, runId, state, "generate_caption");
    }

    // Step: generate caption (strategy-directed)
    if (!state.generate_caption?.done) {
      await sb.from("runs").update({ status: "generating" }).eq("id", runId);
      await refreshHeartbeat(sb, runId, channelId);
      const caption = await stepGenerateCaption(sb, userId, runId, apiKey, state.analyze_video!.summary, promptVer.caption_prompt, state.strategy?.decision ?? null);
      state.generate_caption = { done: true, caption };
      await persistStepState(sb, runId, state, "publish");
    }

    // Step: publish
    if (!state.publish?.done) {
      await sb.from("runs").update({ status: "publishing" }).eq("id", runId);
      await refreshHeartbeat(sb, runId, channelId);
      const pub = await stepPublish(sb, userId, runId, channel, state.generate_caption!.caption, queueUrl);
      state.publish = { done: true, postId: pub.postId, postedAt: pub.postedAt };
      await persistStepState(sb, runId, state, "finalize");
    }

    // Step: finalize
    if (queueItemId) {
      await sb.from("video_queue").update({
        status: "done", processed_at: new Date().toISOString(), error: null,
      }).eq("id", queueItemId);
    }
    await sb.from("runs").update({
      status: "complete", finished_at: new Date().toISOString(),
      duration_ms: Date.now() - t0,
      strategy_used: `objective=${aiSet?.objective ?? "engagement"};prompt=${promptVer.name}-v${promptVer.version}`,
      current_step: "complete",
      step_state: { ...state, finalize: { done: true } } as never,
    }).eq("id", runId);
    await releaseChannelLock(sb, channelId, runId);
    await audit(sb, { userId, runId, eventType: "run.completed", module: "orchestrator", status: "success", durationMs: Date.now() - t0, payload: { post_id: state.publish?.postId } });
    await log(sb, userId, runId, "info", "orchestrator", `Run complete`);
    return { runId, postId: state.publish?.postId };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await sb.from("runs").update({
      status: "failed", error: msg,
      finished_at: new Date().toISOString(),
      duration_ms: Date.now() - t0,
      step_state: state as never,
    }).eq("id", runId);

    // Dead-letter or requeue based on max_attempts.
    if (queueItemId) {
      const { data: q } = await sb.from("video_queue").select("attempts, max_attempts").eq("id", queueItemId).maybeSingle();
      const attempts = q?.attempts ?? 1;
      const maxAttempts = q?.max_attempts ?? 3;
      if (attempts >= maxAttempts) {
        await sb.from("video_queue").update({
          status: "dead_letter",
          dead_letter_at: new Date().toISOString(),
          error: msg,
          last_error_module: classifyErrorModule(msg),
        }).eq("id", queueItemId);
        await audit(sb, { userId, runId, queueItemId, eventType: "queue.dead_letter", module: "orchestrator", status: "error", error: msg, attempt: attempts });
      } else {
        // Return item to pending so scheduler can retry (resume-aware).
        await sb.from("video_queue").update({
          status: "pending", error: msg,
          last_error_module: classifyErrorModule(msg),
        }).eq("id", queueItemId);
        await audit(sb, { userId, runId, queueItemId, eventType: "queue.requeued", module: "orchestrator", status: "error", error: msg, attempt: attempts });
      }
    }

    await releaseChannelLock(sb, channelId, runId);
    await log(sb, userId, runId, "error", "orchestrator", msg);
    throw e;
  }
}

function classifyErrorModule(msg: string): string {
  const s = msg.toLowerCase();
  if (s.includes("ai") || s.includes("model") || s.includes("gemini") || s.includes("gateway")) return "ai";
  if (s.includes("buffer") || s.includes("graphql") || s.includes("publish")) return "buffer";
  if (s.includes("cloudinary") || s.includes("upload")) return "cloudinary";
  return "orchestrator";
}
