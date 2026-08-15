import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { runSheetModeCycle } from "./sheet-mode.server";

const sheetId = z.string().uuid();
const channelId = z.string().uuid();
const rowId = z.string().uuid();
const selectionRule = z.enum([
  "first_ready",
  "random_ready",
  "highest_priority",
  "lowest_priority",
  "newest_created",
  "oldest_created",
  "round_robin",
  "weighted_random",
  "ai_smart_score",
]);

const sheetSettingsSchema = z.object({
  name: z.string().trim().min(1).max(160),
  rows_per_run: z.number().int().min(1).max(500).default(1),
  schedule_label: z.string().trim().max(200).nullable().optional(),
  selection_rule: selectionRule.default("first_ready"),
  after_publish_mark_status: z.boolean().default(true),
  after_publish_save_post_id: z.boolean().default(true),
  after_publish_save_time: z.boolean().default(true),
  after_publish_save_url: z.boolean().default(true),
  retry_failed: z.boolean().default(true),
});

const targetInput = z.object({
  channel_id: channelId,
  backfill_applied: z.boolean().default(false),
});

const rowValues = z.object({
  caption: z.string().max(20000),
  video_url: z.string().max(2000),
  priority: z.number().int().nullable(),
  weight: z.number().int().min(0).nullable(),
});

type SheetModeChannelStatus = {
  id: string;
  row_id: string;
  channel_target_id: string;
  status: string;
  published_post_id: string | null;
  published_url: string | null;
  published_at: string | null;
  last_error: string | null;
  last_attempt_at: string | null;
};

type SheetModeTargetSummary = {
  id: string;
  sheet_id: string;
  buffer_connection_id: string;
  channel_id: string;
  channel_label: string;
  platform: string;
  is_active: boolean;
  backfill_applied: boolean;
  added_at: string;
  removed_at: string | null;
};

async function assertSheetOwner(sb: any, userId: string, id: string) {
  const { data, error } = await sb
    .from("sheet_mode_sheets")
    .select("id")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Sheet not found");
}

async function recalculateRowStatus(sb: any, rowIdValue: string) {
  const { data: row, error: rowError } = await sb.from("sheet_mode_rows").select("id").eq("id", rowIdValue).maybeSingle();
  if (rowError) throw new Error(rowError.message);
  if (!row) throw new Error("Row not found");
  const { data: statuses, error: statusError } = await sb
    .from("sheet_mode_row_channel_status")
    .select("status,channel_target_id")
    .eq("row_id", rowIdValue);
  if (statusError) throw new Error(statusError.message);
  const targetIds = (statuses ?? []).map((status: { channel_target_id: string }) => status.channel_target_id);
  let activeIds: string[] = [];
  if (targetIds.length) {
    const { data: targets, error: targetError } = await sb
      .from("sheet_mode_channel_targets")
      .select("id")
      .in("id", targetIds)
      .eq("is_active", true);
    if (targetError) throw new Error(targetError.message);
    activeIds = (targets ?? []).map((target: { id: string }) => target.id);
  }
  const activeCount = activeIds.length;
  const activeSet = new Set(activeIds);
  const doneCount = (statuses ?? []).filter((status: { channel_target_id: string; status: string }) => activeSet.has(status.channel_target_id) && status.status === "T").length;
  const nextStatus = activeCount === 0 || doneCount === 0 ? "pending" : doneCount >= activeCount ? "complete" : "partial";
  const { error: updateError } = await sb.from("sheet_mode_rows").update({ status: nextStatus }).eq("id", rowIdValue);
  if (updateError) throw new Error(updateError.message);
}

async function getOwnedChannels(sb: any, userId: string, ids: string[]) {
  const uniqueIds = [...new Set(ids)];
  if (!uniqueIds.length) return [];
  const { data, error } = await sb
    .from("channels")
    .select("id,name,platform,credential_id,active,missing_since,buffer_credentials(id,label)")
    .eq("user_id", userId)
    .in("id", uniqueIds)
    .eq("active", true)
    .is("missing_since", null);
  if (error) throw new Error(error.message);
  if ((data ?? []).length !== uniqueIds.length) throw new Error("One or more selected channels are unavailable.");
  return data ?? [];
}

export const listSheetModeWorkspace = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [sheetsResult, channelsResult] = await Promise.all([
      context.supabase
        .from("sheet_mode_sheets")
        .select("id,name,rows_per_run,schedule_label,selection_rule,after_publish_mark_status,after_publish_save_post_id,after_publish_save_time,after_publish_save_url,retry_failed,is_enabled,created_at,updated_at")
        .order("created_at", { ascending: false }),
      context.supabase
        .from("channels")
        .select("id,name,platform,credential_id,active,missing_since,buffer_credentials(id,label)")
        .eq("user_id", context.userId)
        .eq("active", true)
        .is("missing_since", null)
        .order("created_at", { ascending: false }),
    ]);
    if (sheetsResult.error) throw new Error(sheetsResult.error.message);
    if (channelsResult.error) throw new Error(channelsResult.error.message);

    const sheets = sheetsResult.data ?? [];
    const targetsBySheet = new Map<string, SheetModeTargetSummary[]>();
    if (sheets.length) {
      const { data: targets, error } = await context.supabase
        .from("sheet_mode_channel_targets")
        .select("id,sheet_id,buffer_connection_id,channel_id,channel_label,platform,is_active,backfill_applied,added_at,removed_at")
        .in("sheet_id", sheets.map((sheet) => sheet.id))
        .eq("is_active", true)
        .order("added_at", { ascending: true });
      if (error) throw new Error(error.message);
      for (const target of targets ?? []) {
        const list = targetsBySheet.get(target.sheet_id) ?? [];
        list.push(target);
        targetsBySheet.set(target.sheet_id, list);
      }
    }

    return {
      sheets: sheets.map((sheet) => ({ ...sheet, channel_targets: targetsBySheet.get(sheet.id) ?? [] })),
      channels: channelsResult.data ?? [],
    };
  });

export const createSheetModeSheet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => sheetSettingsSchema.extend({ targets: z.array(targetInput).max(50) }).parse(d))
  .handler(async ({ data, context }) => {
    const channels = await getOwnedChannels(context.supabase, context.userId, data.targets.map((target) => target.channel_id));
    const { data: sheet, error } = await context.supabase
      .from("sheet_mode_sheets")
      .insert({
        user_id: context.userId,
        name: data.name,
        rows_per_run: data.rows_per_run,
        schedule_label: data.schedule_label ?? null,
        selection_rule: data.selection_rule,
        after_publish_mark_status: data.after_publish_mark_status,
        after_publish_save_post_id: data.after_publish_save_post_id,
        after_publish_save_time: data.after_publish_save_time,
        after_publish_save_url: data.after_publish_save_url,
        retry_failed: data.retry_failed,
        is_enabled: true,
      })
      .select("id,name")
      .single();
    if (error) throw new Error(error.message);

    if (data.targets.length) {
      const channelById = new Map(channels.map((channel: any) => [channel.id, channel]));
      const { error: targetError } = await context.supabase.from("sheet_mode_channel_targets").insert(
        data.targets.map((target) => {
          const channel = channelById.get(target.channel_id) as any;
          const credential = Array.isArray(channel.buffer_credentials) ? channel.buffer_credentials[0] : channel.buffer_credentials;
          return {
            sheet_id: sheet.id,
            buffer_connection_id: channel.credential_id,
            channel_id: channel.id,
            channel_label: `${credential?.label ?? "Buffer"} · ${channel.name ?? channel.platform}`,
            platform: channel.platform ?? "unknown",
            is_active: true,
            backfill_applied: target.backfill_applied,
          };
        }),
      );
      if (targetError) throw new Error(targetError.message);
    }
    return { id: sheet.id };
  });

export const updateSheetModeSheet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => sheetSettingsSchema.extend({ id: sheetId }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("sheet_mode_sheets")
      .update({
        name: data.name,
        rows_per_run: data.rows_per_run,
        schedule_label: data.schedule_label ?? null,
        selection_rule: data.selection_rule,
        after_publish_mark_status: data.after_publish_mark_status,
        after_publish_save_post_id: data.after_publish_save_post_id,
        after_publish_save_time: data.after_publish_save_time,
        after_publish_save_url: data.after_publish_save_url,
        retry_failed: data.retry_failed,
      })
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setSheetModeEnabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: sheetId, is_enabled: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("sheet_mode_sheets")
      .update({ is_enabled: data.is_enabled })
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteSheetModeSheet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: sheetId }).parse(d))
  .handler(async ({ data, context }) => {
    const { error, count } = await context.supabase
      .from("sheet_mode_sheets")
      .delete({ count: "exact" })
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    if (!count) throw new Error("Sheet not found");
    return { ok: true };
  });

export const getSheetModeSheet = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: sheetId }).parse(d))
  .handler(async ({ data, context }) => {
    await assertSheetOwner(context.supabase, context.userId, data.id);
    const [sheetResult, targetsResult, rowsResult] = await Promise.all([
      context.supabase.from("sheet_mode_sheets").select("*").eq("id", data.id).eq("user_id", context.userId).single(),
      context.supabase.from("sheet_mode_channel_targets").select("*").eq("sheet_id", data.id).order("added_at", { ascending: true }),
      context.supabase.from("sheet_mode_rows").select("*").eq("sheet_id", data.id).order("position", { ascending: true }),
    ]);
    if (sheetResult.error) throw new Error(sheetResult.error.message);
    if (targetsResult.error) throw new Error(targetsResult.error.message);
    if (rowsResult.error) throw new Error(rowsResult.error.message);

    const rows = rowsResult.data ?? [];
    const statusesByRow = new Map<string, SheetModeChannelStatus[]>();
    if (rows.length) {
      const { data: statuses, error } = await context.supabase
        .from("sheet_mode_row_channel_status")
        .select("*")
        .in("row_id", rows.map((row) => row.id));
      if (error) throw new Error(error.message);
      for (const status of statuses ?? []) {
        const list = statusesByRow.get(status.row_id) ?? [];
        list.push(status);
        statusesByRow.set(status.row_id, list);
      }
    }
    return {
      sheet: sheetResult.data,
      channel_targets: targetsResult.data ?? [],
      rows: rows.map((row) => ({ ...row, channel_statuses: statusesByRow.get(row.id) ?? [] })),
    };
  });

export const addSheetModeChannelTargets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ sheet_id: sheetId, targets: z.array(targetInput).max(50) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertSheetOwner(context.supabase, context.userId, data.sheet_id);
    const channels = await getOwnedChannels(context.supabase, context.userId, data.targets.map((target) => target.channel_id));
    const channelById = new Map(channels.map((channel: any) => [channel.id, channel]));
    for (const target of data.targets) {
      const channel = channelById.get(target.channel_id) as any;
      const credential = Array.isArray(channel.buffer_credentials) ? channel.buffer_credentials[0] : channel.buffer_credentials;
      const { data: inserted, error } = await context.supabase.from("sheet_mode_channel_targets").upsert({
        sheet_id: data.sheet_id,
        buffer_connection_id: channel.credential_id,
        channel_id: channel.id,
        channel_label: `${credential?.label ?? "Buffer"} · ${channel.name ?? channel.platform}`,
        platform: channel.platform ?? "unknown",
        is_active: true,
        backfill_applied: target.backfill_applied,
        removed_at: null,
      }, { onConflict: "sheet_id,buffer_connection_id,channel_id" }).select("id").single();
      if (error) throw new Error(error.message);
      const { data: rows, error: rowsError } = await context.supabase.from("sheet_mode_rows").select("id").eq("sheet_id", data.sheet_id);
      if (rowsError) throw new Error(rowsError.message);
      if (rows?.length) {
        const { error: statusError } = await context.supabase.from("sheet_mode_row_channel_status").upsert(
          rows.map((row) => ({ row_id: row.id, channel_target_id: inserted.id, status: "F" })),
          { onConflict: "row_id,channel_target_id" },
        );
        if (statusError) throw new Error(statusError.message);
      }
    }
    return { ok: true };
  });

export const removeSheetModeChannelTarget = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ sheet_id: sheetId, target_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertSheetOwner(context.supabase, context.userId, data.sheet_id);
    const { error } = await context.supabase
      .from("sheet_mode_channel_targets")
      .update({ is_active: false, removed_at: new Date().toISOString() })
      .eq("id", data.target_id)
      .eq("sheet_id", data.sheet_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const createSheetModeRow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ sheet_id: sheetId, ...rowValues.shape }).parse(d))
  .handler(async ({ data, context }) => {
    await assertSheetOwner(context.supabase, context.userId, data.sheet_id);
    const { data: lastRow, error: lastError } = await context.supabase
      .from("sheet_mode_rows")
      .select("position")
      .eq("sheet_id", data.sheet_id)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (lastError) throw new Error(lastError.message);
    const { data: row, error } = await context.supabase
      .from("sheet_mode_rows")
      .insert({ sheet_id: data.sheet_id, position: (lastRow?.position ?? 0) + 1, caption: data.caption, video_url: data.video_url, priority: data.priority, weight: data.weight })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    const { data: targets, error: targetError } = await context.supabase.from("sheet_mode_channel_targets").select("id,backfill_applied").eq("sheet_id", data.sheet_id).eq("is_active", true);
    if (targetError) throw new Error(targetError.message);
    if (targets?.length) {
      const { error: statusError } = await context.supabase.from("sheet_mode_row_channel_status").insert(targets.map((target) => ({ row_id: row.id, channel_target_id: target.id, status: "F" })));
      if (statusError) throw new Error(statusError.message);
    }
    return row;
  });

export const updateSheetModeRow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: rowId, ...rowValues.shape }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("sheet_mode_rows")
      .update({ caption: data.caption, video_url: data.video_url, priority: data.priority, weight: data.weight })
      .eq("id", data.id)
      .select("*")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Row not found");
    return row;
  });

export const deleteSheetModeRow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: rowId }).parse(d))
  .handler(async ({ data, context }) => {
    const { error, count } = await context.supabase.from("sheet_mode_rows").delete({ count: "exact" }).eq("id", data.id);
    if (error) throw new Error(error.message);
    if (!count) throw new Error("Row not found");
    return { ok: true };
  });

export const updateSheetModeChannelCell = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), status: z.enum(["F", "T"]), published_url: z.string().nullable() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: current, error: currentError } = await context.supabase
      .from("sheet_mode_row_channel_status")
      .select("row_id")
      .eq("id", data.id)
      .maybeSingle();
    if (currentError) throw new Error(currentError.message);
    if (!current) throw new Error("Channel cell not found");
    const { data: updated, error } = await context.supabase
      .from("sheet_mode_row_channel_status")
      .update({ status: data.status, published_url: data.published_url })
      .eq("id", data.id)
      .select("*")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!updated) throw new Error("Channel cell not found");
    await recalculateRowStatus(context.supabase, current.row_id);
    return updated;
  });


const importRowSchema = z.object({
  caption: z.string().max(20000),
  video_url: z.string().max(2000),
  priority: z.number().int().nullable().optional(),
  weight: z.number().int().min(0).nullable().optional(),
});

const cellType = z.enum(["caption", "video_url", "status", "published_url"]);

function validateCellValue(type: z.infer<typeof cellType>, value: string) {
  const trimmed = value.trim();
  if ((type === "video_url" || type === "published_url") && trimmed && !/^https?:\/\//i.test(trimmed)) return "Value must start with http:// or https://";
  if (type === "caption" && trimmed && /^https?:\/\/\S+$/i.test(trimmed)) return "Caption cannot be only a bare URL";
  if (type === "status" && trimmed !== "F" && trimmed !== "T") return "Status must be F or T";
  return null;
}

async function insertImportedRows(sb: any, sheetIdValue: string, rows: Array<{ caption: string; video_url: string; priority?: number | null; weight?: number | null }>) {
  const { data: targets, error: targetError } = await sb.from("sheet_mode_channel_targets").select("id").eq("sheet_id", sheetIdValue).eq("is_active", true);
  if (targetError) throw new Error(targetError.message);
  const { data: last, error: lastError } = await sb.from("sheet_mode_rows").select("position").eq("sheet_id", sheetIdValue).order("position", { ascending: false }).limit(1).maybeSingle();
  if (lastError) throw new Error(lastError.message);
  const payload = rows.map((row, index) => ({ sheet_id: sheetIdValue, position: (last?.position ?? 0) + index + 1, caption: row.caption, video_url: row.video_url, priority: row.priority ?? null, weight: row.weight ?? null, status: "pending" }));
  if (!payload.length) return { inserted: 0 };
  const { data: inserted, error } = await sb.from("sheet_mode_rows").insert(payload).select("id");
  if (error) throw new Error(error.message);
  if ((targets ?? []).length && (inserted ?? []).length) {
    const { error: statusError } = await sb.from("sheet_mode_row_channel_status").insert((inserted ?? []).flatMap((row: { id: string }) => (targets ?? []).map((target: { id: string }) => ({ row_id: row.id, channel_target_id: target.id, status: "F" }))));
    if (statusError) throw new Error(statusError.message);
  }
  return { inserted: inserted?.length ?? 0 };
}

export const importSheetModeRows = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ sheet_id: sheetId, rows: z.array(importRowSchema).max(5000) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertSheetOwner(context.supabase, context.userId, data.sheet_id);
    const errors: Array<{ row: number; message: string }> = [];
    const seen = new Set<string>();
    const valid: Array<{ caption: string; video_url: string; priority?: number | null; weight?: number | null }> = [];
    data.rows.forEach((row, index) => {
      const urlError = validateCellValue("video_url", row.video_url);
      const captionError = validateCellValue("caption", row.caption);
      if (!row.video_url.trim() || urlError || captionError) {
        errors.push({ row: index + 1, message: urlError ?? captionError ?? "Video URL is required" });
        return;
      }
      const key = row.video_url.trim().toLowerCase();
      if (seen.has(key)) { errors.push({ row: index + 1, message: "Duplicate video URL" }); return; }
      seen.add(key);
      valid.push({ ...row, caption: row.caption.trim(), video_url: row.video_url.trim() });
    });
    const result = await insertImportedRows(context.supabase, data.sheet_id, valid);
    return { ...result, skipped: errors.length, errors };
  });

export const removeEmptySheetModeRows = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ sheet_id: sheetId }).parse(d))
  .handler(async ({ data, context }) => {
    await assertSheetOwner(context.supabase, context.userId, data.sheet_id);
    const { data: rows, error } = await context.supabase.from("sheet_mode_rows").select("id,caption,video_url").eq("sheet_id", data.sheet_id);
    if (error) throw new Error(error.message);
    const ids = (rows ?? []).filter((row) => !row.caption.trim() && !row.video_url.trim()).map((row) => row.id);
    if (ids.length) { const result = await context.supabase.from("sheet_mode_rows").delete().in("id", ids); if (result.error) throw new Error(result.error.message); }
    return { removed: ids.length };
  });

export const removeDuplicateSheetModeRows = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ sheet_id: sheetId }).parse(d))
  .handler(async ({ data, context }) => {
    await assertSheetOwner(context.supabase, context.userId, data.sheet_id);
    const { data: rows, error } = await context.supabase.from("sheet_mode_rows").select("id,video_url,position").eq("sheet_id", data.sheet_id).order("position", { ascending: true });
    if (error) throw new Error(error.message);
    const seen = new Set<string>(); const ids: string[] = [];
    for (const row of rows ?? []) { const key = row.video_url.trim().toLowerCase(); if (!key) continue; if (seen.has(key)) ids.push(row.id); else seen.add(key); }
    if (ids.length) { const result = await context.supabase.from("sheet_mode_rows").delete().in("id", ids); if (result.error) throw new Error(result.error.message); }
    return { removed: ids.length };
  });

export const retryFailedSheetModeRows = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ sheet_id: sheetId }).parse(d))
  .handler(async ({ data, context }) => {
    await assertSheetOwner(context.supabase, context.userId, data.sheet_id);
    const { data: rows, error } = await context.supabase.from("sheet_mode_rows").select("id").eq("sheet_id", data.sheet_id);
    if (error) throw new Error(error.message);
    const ids = (rows ?? []).map((row) => row.id);
    if (ids.length) { const result = await context.supabase.from("sheet_mode_row_channel_status").update({ status: "F", last_error: null }).in("row_id", ids).not("last_error", "is", null); if (result.error) throw new Error(result.error.message); }
    return { reset: ids.length };
  });

export const publishNextSheetMode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ sheet_id: sheetId }).parse(d))
  .handler(async ({ data, context }) => {
    await assertSheetOwner(context.supabase, context.userId, data.sheet_id);
    return runSheetModeCycle(context.supabase, data.sheet_id, "manual", `manual-${crypto.randomUUID()}`);
  });

export const bulkUpdateSheetModeCells = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ sheet_id: sheetId, column: cellType, row_ids: z.array(rowId).min(1).max(5000), mode: z.enum(["clear", "overwrite", "add"]), value: z.string().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertSheetOwner(context.supabase, context.userId, data.sheet_id);
    const values = data.mode === "clear" ? data.row_ids.map(() => "") : (data.mode === "add" ? (data.value ?? "").split(/\r?\n/) : data.row_ids.map(() => data.value ?? ""));
    if (data.mode !== "clear" && !values.length) throw new Error("A value is required");
    const { data: scopedRows, error: scopedRowsError } = await context.supabase
      .from("sheet_mode_rows")
      .select("id")
      .eq("sheet_id", data.sheet_id)
      .in("id", data.row_ids);
    if (scopedRowsError) throw new Error(scopedRowsError.message);
    const scopedRowIds = new Set((scopedRows ?? []).map((row: { id: string }) => row.id));
    const outOfScope = data.row_ids.filter((id) => !scopedRowIds.has(id));
    if (outOfScope.length) throw new Error("One or more selected rows do not belong to this sheet");
    const errors: Array<{ row_id: string; message: string }> = [];
    const changed: string[] = [];
    for (let index = 0; index < data.row_ids.length; index++) {
      const value = values[data.mode === "add" ? index : 0] ?? "";
      const validation = validateCellValue(data.column, value);
      if (validation) { errors.push({ row_id: data.row_ids[index], message: validation }); continue; }
      const rowIdValue = data.row_ids[index];
      if (data.column === "caption" || data.column === "video_url") {
        const update = data.column === "caption" ? { caption: value } : { video_url: value };
        const result = await context.supabase.from("sheet_mode_rows").update(update).eq("id", rowIdValue).eq("sheet_id", data.sheet_id);
        if (result.error) throw new Error(result.error.message);
      } else {
        const { data: statuses, error } = await context.supabase.from("sheet_mode_row_channel_status").select("id").eq("row_id", rowIdValue);
        if (error) throw new Error(error.message);
        const update = data.column === "status" ? { status: value } : { published_url: value || null };
        if ((statuses ?? []).length) { const result = await context.supabase.from("sheet_mode_row_channel_status").update(update).eq("row_id", rowIdValue); if (result.error) throw new Error(result.error.message); }
      }
      changed.push(rowIdValue);
    }
    return { changed: changed.length, skipped: errors.length, errors };
  });
