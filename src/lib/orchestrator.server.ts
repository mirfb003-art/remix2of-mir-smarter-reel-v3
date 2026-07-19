// Orchestrator: runs the full learning loop for one video.
// Called from manualRun and the cron tick.
import { generateText } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAiGateway, requireLovableApiKey } from "./ai-gateway.server";

type Sb = SupabaseClient;

function cloudinaryThumb(url: string, offset: string = "auto"): string {
  // Insert transformation after /upload/ and change extension to jpg
  const m = url.match(/^(.*\/upload\/)(.*)$/);
  if (!m) return url;
  const rest = m[2].replace(/\.[a-zA-Z0-9]+$/, ".jpg");
  return `${m[1]}so_${offset},w_640,c_fill,q_auto,f_jpg/${rest}`;
}

async function log(sb: Sb, userId: string, runId: string | null, level: string, module: string, message: string, meta?: unknown) {
  await sb.from("logs").insert({ user_id: userId, run_id: runId, level, module, message, meta: (meta ?? null) as never });
}

async function analyzeVideo(sb: Sb, userId: string, runId: string, url: string, apiKey: string, model: string) {
  const provider = createAiGateway(apiKey);
  const frames = ["auto", "25%", "50%", "75%"].map((o) => cloudinaryThumb(url, o));
  const { text } = await generateText({
    model: provider(model),
    messages: [{
      role: "user",
      content: [
        { type: "text", text: `Analyze this short-form video (frames sampled below). Return STRICT JSON only, no prose, matching this shape:
{"summary":string,"objects":string[],"people":string,"scene":string,"actions":string[],"emotions":string[],"topic":string,"story":string,"message":string}` },
        ...frames.map((u) => ({ type: "image" as const, image: u })),
      ],
    }],
  });
  let parsed: Record<string, unknown> = {};
  try {
    const clean = text.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
    parsed = JSON.parse(clean);
  } catch {
    parsed = { summary: text.slice(0, 500) };
  }
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

async function analyzePrevious(sb: Sb, userId: string, runId: string, apiKey: string, model: string) {
  // Fetch last completed run with analytics
  const { data: prev } = await sb.from("runs")
    .select(`id, captions(text,hashtags,cta,hook,length),
      published_posts(post_analytics(views,likes,comments,shares,saves,reach,impressions))`)
    .eq("user_id", userId)
    .eq("status", "complete")
    .neq("id", runId)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!prev) return null;

  const cap = (prev as any).captions?.[0];
  const analytics = (prev as any).published_posts?.[0]?.post_analytics?.[0];
  if (!cap) return null;

  const provider = createAiGateway(apiKey);
  const { text } = await generateText({
    model: provider(model),
    prompt: `You are a social-media performance analyst. Given the previous post's caption and metrics, produce STRICT JSON only:
{"worked":boolean,"hook_verdict":string,"length_verdict":string,"emoji_verdict":string,"hashtag_verdict":string,"cta_verdict":string,"cause":string,"change_recommendation":string,"new_insights":[{"category":"hook|length|emoji|hashtag|cta|topic|style|timing","insight":string,"confidence":number}]}

Previous caption: ${JSON.stringify(cap)}
Analytics: ${JSON.stringify(analytics ?? {})}`,
  });
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

  // Reinforce memory
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
  return report;
}

async function generateCaption(sb: Sb, userId: string, apiKey: string, videoSummary: any) {
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
  const { text } = await generateText({
    model: provider(ai?.model ?? "google/gemini-3-flash-preview"),
    temperature: ai?.temperature ?? 0.8,
    prompt: `You are Loop, an adaptive short-form caption engine.

OBJECTIVE: Maximize ${objective}
BRAND TONE: ${ai?.brand_tone}
LANGUAGE: ${ai?.language}
MAX LENGTH: ${ai?.max_caption_length}
DEFAULT HASHTAGS (may include): ${(ai?.default_hashtags ?? []).join(" ")}
USER INSTRUCTIONS: ${ai?.user_instructions ?? "(none)"}

DURABLE LEARNINGS (highest confidence first):
${(memory ?? []).map((m) => `- [${m.category}] ${m.insight} (${Math.round(m.confidence*100)}%)`).join("\n") || "(none yet — cold start)"}

RECENT CAPTIONS (avoid repeating structure):
${(prevCaps ?? []).map((c) => `- ${c.text}`).join("\n") || "(none)"}

CURRENT VIDEO UNDERSTANDING:
${JSON.stringify(videoSummary)}

Return STRICT JSON only:
{"caption":string,"hook":string,"cta":string,"hashtags":string[],"style_tags":string[]}`,
  });
  let out: any = {};
  try { out = JSON.parse(text.replace(/^```json\s*/i,"").replace(/```$/,"").trim()); } catch { out = { caption: text.slice(0, ai?.max_caption_length ?? 2200) }; }
  return { ai_settings: ai, caption: out };
}

export async function runOrchestrator({
  supabase: sb, userId, channelId,
}: { supabase: Sb; userId: string; channelId: string }) {
  // 1. Claim next queue item
  const { data: qItem, error: qErr } = await sb
    .from("video_queue")
    .select("id, cloudinary_url")
    .eq("status", "pending")
    .order("position", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (qErr) throw new Error(qErr.message);
  if (!qItem) throw new Error("Queue is empty. Add Cloudinary URLs first.");

  await sb.from("video_queue").update({ status: "processing" }).eq("id", qItem.id);

  // 2. Get channel + credentials
  const { data: channel } = await sb.from("channels").select("*,buffer_credentials(*)").eq("id", channelId).maybeSingle();
  if (!channel) throw new Error("Channel not found");
  const cred = (channel as any).buffer_credentials;
  if (!cred) throw new Error("This channel has no Buffer credential attached.");

  // 3. Create run
  const { data: lastRun } = await sb.from("runs").select("run_number").eq("user_id", userId).order("run_number", { ascending: false }).limit(1).maybeSingle();
  const nextNum = (lastRun?.run_number ?? 0) + 1;
  const { data: run, error: runErr } = await sb.from("runs").insert({
    user_id: userId, channel_id: channelId, queue_item_id: qItem.id,
    run_number: nextNum, status: "analyzing",
  }).select("*").single();
  if (runErr || !run) throw new Error(runErr?.message ?? "Failed to create run");

  const t0 = Date.now();
  const apiKey = requireLovableApiKey();
  const { data: aiSet } = await sb.from("ai_settings").select("model").eq("user_id", userId).maybeSingle();
  const model = aiSet?.model ?? "google/gemini-3-flash-preview";

  try {
    await log(sb, userId, run.id, "info", "orchestrator", `Run #${nextNum} started for ${qItem.cloudinary_url}`);

    // Phase 2: learn from previous
    await analyzePrevious(sb, userId, run.id, apiKey, model);

    // Analyze current video
    const summary = await analyzeVideo(sb, userId, run.id, qItem.cloudinary_url, apiKey, model);

    // Generate caption
    await sb.from("runs").update({ status: "generating" }).eq("id", run.id);
    const { caption } = await generateCaption(sb, userId, apiKey, summary);
    await sb.from("captions").insert({
      run_id: run.id, user_id: userId,
      text: String(caption.caption ?? ""),
      hook: caption.hook ?? null,
      cta: caption.cta ?? null,
      hashtags: caption.hashtags ?? [],
      length: String(caption.caption ?? "").length,
      style_tags: caption.style_tags ?? [],
    });

    // Publish
    await sb.from("runs").update({ status: "publishing" }).eq("id", run.id);
    const { makeBufferClient } = await import("./buffer.server");
    const buffer = makeBufferClient(cred.api_token, cred.graphql_endpoint);
    const { postId, raw } = await buffer.createPost({
      channelId: channel.buffer_channel_id,
      text: caption.caption,
      mediaUrl: qItem.cloudinary_url,
    });

    await sb.from("published_posts").insert({
      run_id: run.id, user_id: userId, channel_id: channelId,
      buffer_post_id: postId, platform: channel.platform,
      posted_at: new Date().toISOString(), raw: raw as never,
    });

    await sb.from("video_queue").update({ status: "done", processed_at: new Date().toISOString() }).eq("id", qItem.id);
    await sb.from("runs").update({
      status: "complete", finished_at: new Date().toISOString(),
      duration_ms: Date.now() - t0, strategy_used: `objective=${(aiSet as any)?.objective ?? "engagement"}`,
    }).eq("id", run.id);
    await log(sb, userId, run.id, "info", "orchestrator", `Run #${nextNum} complete`);

    return { runId: run.id, postId };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await sb.from("runs").update({ status: "failed", error: msg, finished_at: new Date().toISOString(), duration_ms: Date.now() - t0 }).eq("id", run.id);
    await sb.from("video_queue").update({ status: "failed", error: msg, attempts: 1 }).eq("id", qItem.id);
    await log(sb, userId, run.id, "error", "orchestrator", msg);
    throw e;
  }
}
