import { makeBufferClient, resolveBufferCredential, type BufferPostMetric } from "./buffer.server";

const STORY_MAX_ATTEMPTS = 3;
const STORY_RETRY_HOURS = 3;
const STORY_FIRST_SYNC_MIN_HOURS = 19;
const STORY_FIRST_SYNC_WINDOW_HOURS = 2;

export function formulaStoryFirstSyncDueAt(publishedAt: string | null | undefined, random = Math.random()) {
  const base = Date.parse(publishedAt ?? "");
  const publishedMs = Number.isFinite(base) ? base : Date.now();
  const windowHours = STORY_FIRST_SYNC_MIN_HOURS + Math.max(0, Math.min(1, random)) * STORY_FIRST_SYNC_WINDOW_HOURS;
  return new Date(publishedMs + windowHours * 60 * 60 * 1000).toISOString();
}

function nextStoryRetryAt(now: Date) {
  return new Date(now.getTime() + STORY_RETRY_HOURS * 60 * 60 * 1000).toISOString();
}

function insightMetrics(value: unknown): BufferPostMetric[] {
  return Array.isArray(value) ? value as BufferPostMetric[] : [];
}

async function loadFormulaInsightContext(sb: any, insightId: string, userId?: string) {
  let insightQuery = sb.from("formula_run_insights").select("*").eq("id", insightId);
  const { data: insight, error: insightError } = await insightQuery.maybeSingle();
  if (insightError) throw new Error(insightError.message);
  if (!insight) throw new Error("Formula insight not found");

  let scheduleQuery = sb.from("recurring_schedules")
    .select("id,user_id,campaign_id,channel_id,channels(*,buffer_credentials(*))")
    .eq("id", insight.recurring_schedule_id);
  if (userId) scheduleQuery = scheduleQuery.eq("user_id", userId);
  const { data: schedule, error: scheduleError } = await scheduleQuery.maybeSingle();
  if (scheduleError) throw new Error(scheduleError.message);
  if (!schedule || (userId && schedule.user_id !== userId)) throw new Error("Formula insight is not owned by this user");
  return { insight, schedule };
}

async function fetchAndPersistFormulaInsight(sb: any, insight: any, schedule: any, options: { automaticStorySync: boolean; now?: Date }) {
  const now = options.now ?? new Date();
  const credential = await resolveBufferCredential(sb, schedule.user_id, schedule.campaign_id, schedule.channels?.buffer_credentials);
  const buffer = makeBufferClient(credential.api_token, credential.graphql_endpoint);
  const snapshot = await buffer.getPostMetrics(insight.buffer_post_id);
  if (!snapshot) throw new Error("Buffer returned no post metrics record");

  const metrics = insightMetrics(snapshot.metrics);
  const hasMetrics = metrics.length > 0;
  const attemptCount = Number(insight.sync_attempts ?? 0);
  const exhausted = options.automaticStorySync && !hasMetrics && attemptCount >= STORY_MAX_ATTEMPTS;
  const update = {
    metrics,
    metrics_updated_at: snapshot.metricsUpdatedAt ?? null,
    last_synced_at: now.toISOString(),
    sync_status: hasMetrics ? "synced" : exhausted ? "failed" : "pending",
    next_sync_due_at: hasMetrics || exhausted ? null : options.automaticStorySync ? nextStoryRetryAt(now) : null,
    last_error: hasMetrics ? null : exhausted ? "Buffer metrics were still unavailable after the automatic Story sync attempts" : "Buffer has not ingested metrics yet",
  };
  const { data: updated, error: updateError } = await sb.from("formula_run_insights").update(update).eq("id", insight.id).select("*").maybeSingle();
  if (updateError) throw new Error(updateError.message);
  return updated ?? { ...insight, ...update };
}

async function markFormulaInsightSyncFailure(sb: any, insightId: string, message: string, automaticStorySync: boolean, now = new Date()) {
  const { data: insight } = await sb.from("formula_run_insights").select("sync_attempts,post_type").eq("id", insightId).maybeSingle();
  const attemptCount = Number(insight?.sync_attempts ?? 0);
  const exhausted = automaticStorySync && attemptCount >= STORY_MAX_ATTEMPTS;
  const { error } = await sb.from("formula_run_insights").update({
    sync_status: exhausted ? "failed" : "pending",
    next_sync_due_at: exhausted ? null : automaticStorySync ? nextStoryRetryAt(now) : null,
    last_error: message,
  }).eq("id", insightId);
  if (error) throw new Error(error.message);
}

export async function syncFormulaInsightById(sb: any, insightId: string, options: { userId?: string; automaticStorySync: boolean; now?: Date }) {
  const { insight, schedule } = await loadFormulaInsightContext(sb, insightId, options.userId);
  if (options.automaticStorySync && insight.post_type !== "story") return { skipped: true, reason: "not_story" };
  return fetchAndPersistFormulaInsight(sb, insight, schedule, options);
}

export async function runDueFormulaStoryInsights(sb: any, now = new Date()) {
  const nowIso = now.toISOString();
  const { data: due, error } = await sb.from("formula_run_insights")
    .select("*")
    .eq("post_type", "story")
    .neq("sync_status", "synced")
    .not("next_sync_due_at", "is", null)
    .lte("next_sync_due_at", nowIso)
    .order("next_sync_due_at", { ascending: true })
    .limit(20);
  if (error) throw new Error(error.message);

  const results: Array<{ id: string; ok: boolean; status?: string; error?: string; skipped?: string }> = [];
  for (const insight of due ?? []) {
    const leaseUntil = new Date(now.getTime() + 15 * 60 * 1000).toISOString();
    const { data: claimed, error: claimError } = await sb.rpc("claim_formula_run_insight", {
      _insight_id: insight.id,
      _now: nowIso,
      _lease_until: leaseUntil,
    });
    if (claimError) {
      results.push({ id: insight.id, ok: false, error: `claim: ${claimError.message}` });
      continue;
    }
    if (!claimed) {
      results.push({ id: insight.id, ok: true, skipped: "already_claimed" });
      continue;
    }
    try {
      const updated = await syncFormulaInsightById(sb, insight.id, {
        automaticStorySync: true,
        now,
      });
      results.push({ id: insight.id, ok: true, status: updated?.sync_status ?? "pending" });
    } catch (syncError) {
      const message = syncError instanceof Error ? syncError.message : String(syncError);
      try {
        await markFormulaInsightSyncFailure(sb, insight.id, message, true, now);
      } catch (recordError) {
        results.push({ id: insight.id, ok: false, error: `${message}; record failure: ${recordError instanceof Error ? recordError.message : String(recordError)}` });
        continue;
      }
      results.push({ id: insight.id, ok: false, error: message });
    }
  }
  return results;
}
