import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listCampaigns, upsertCampaign, setCampaignStatus, deleteCampaign, updateCampaignPublishing, resetCampaign } from "@/lib/campaigns.functions";
import { PublishModeFields, PUBLISH_MODES, isoToLocalInput, localInputToIso, type PublishMode } from "@/components/publish-mode-fields";
import { setActiveCampaignId, useActiveCampaignId } from "@/lib/active-campaign";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { useState } from "react";
import { Play, Pause, Square, Trash2, Plus, CircleCheck, RotateCcw, RefreshCw, Eraser } from "lucide-react";

export const Route = createFileRoute("/_authenticated/campaigns")({ component: CampaignsPage });

const OBJECTIVES = [
  { v: "followers", l: "Followers growth" },
  { v: "likes", l: "Likes" },
  { v: "comments", l: "Comments" },
  { v: "saves", l: "Saves" },
  { v: "shares", l: "Shares" },
  { v: "reach", l: "Reach" },
  { v: "watch_time", l: "Watch time" },
  { v: "ctr", l: "Click-through" },
  { v: "engagement", l: "Overall engagement" },
  { v: "custom", l: "Custom" },
];

function CampaignsPage() {
  const list = useServerFn(listCampaigns);
  const upsert = useServerFn(upsertCampaign);
  const setStatus = useServerFn(setCampaignStatus);
  const del = useServerFn(deleteCampaign);
  const reset = useServerFn(resetCampaign);
  const updatePublishing = useServerFn(updateCampaignPublishing);
  const qc = useQueryClient();
  const activeId = useActiveCampaignId();

  const { data: campaigns } = useQuery({ queryKey: ["campaigns"], queryFn: () => list() });

  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [objective, setObjective] = useState("engagement");
  const [customObj, setCustomObj] = useState("");
  const [shareLearning, setShareLearning] = useState(false);
  const [publishMode, setPublishMode] = useState<PublishMode>("addToQueue");
  const [scheduledAt, setScheduledAt] = useState("");
  const [delayMinutes, setDelayMinutes] = useState<number | null>(null);

  const create = useMutation({
    mutationFn: () => upsert({ data: {
      name, description: desc || null, objective,
      custom_objective: objective === "custom" ? customObj : null,
      share_learning: shareLearning,
      publish_mode: publishMode,
      custom_scheduled_at: publishMode === "customScheduled" ? localInputToIso(scheduledAt) : null,
      publish_delay_minutes: publishMode === "customScheduled" ? delayMinutes : null,
    } }),
    onSuccess: (r) => {
      toast.success("Campaign created");
      setName(""); setDesc(""); setCustomObj("");
      setActiveCampaignId(r.id);
      qc.invalidateQueries({ queryKey: ["campaigns"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const statusMut = useMutation({
    mutationFn: (p: { id: string; status: "active" | "paused" | "stopped" }) => setStatus({ data: p }),
    onSuccess: () => { toast.success("Updated"); qc.invalidateQueries(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  const publishMut = useMutation({
    mutationFn: (p: { id: string; publish_mode: PublishMode; custom_scheduled_at?: string | null; publish_delay_minutes?: number | null }) =>
      updatePublishing({ data: p }),
    onSuccess: () => { toast.success("Publishing updated"); qc.invalidateQueries({ queryKey: ["campaigns"] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  const delMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => { toast.success("Deleted"); qc.invalidateQueries(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  const resetMut = useMutation({
    mutationFn: (p: { id: string; clear_queue?: boolean; clear_runs?: boolean; clear_memory?: boolean }) => reset({ data: p }),
    onSuccess: () => { toast.success("Campaign reset"); qc.invalidateQueries(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Campaigns</h1>
        <p className="text-sm text-muted-foreground">
          A campaign is a fully isolated publishing context — queue, schedule, memory, and learning are scoped to it.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Plus className="h-4 w-4"/>New campaign</CardTitle>
          <CardDescription>Give it a niche name, pick an objective, and press Create.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1 md:col-span-2"><Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Fitness Reels — August"/>
          </div>
          <div className="space-y-1 md:col-span-2"><Label>Description (optional)</Label>
            <Textarea rows={2} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Niche, audience, tone…" />
          </div>
          <div className="space-y-1"><Label>Objective</Label>
            <Select value={objective} onValueChange={setObjective}>
              <SelectTrigger><SelectValue/></SelectTrigger>
              <SelectContent>
                {OBJECTIVES.map((o) => <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {objective === "custom" && (
            <div className="space-y-1"><Label>Custom objective</Label>
              <Input value={customObj} onChange={(e) => setCustomObj(e.target.value)} placeholder="Describe the goal" />
            </div>
          )}
          <div className="md:col-span-2">
            <PublishModeFields
              mode={publishMode} onModeChange={setPublishMode}
              scheduledAt={scheduledAt} onScheduledAtChange={setScheduledAt}
              delayMinutes={delayMinutes} onDelayMinutesChange={setDelayMinutes}
            />
          </div>
          <div className="flex items-center gap-3 md:col-span-2 pt-2">
            <Switch id="sl" checked={shareLearning} onCheckedChange={setShareLearning}/>
            <Label htmlFor="sl" className="text-sm font-normal">Share learning across all campaigns (default: isolated)</Label>
          </div>
          <div className="md:col-span-2">
            <Button onClick={() => create.mutate()} disabled={!name.trim() || create.isPending}>
              Create campaign
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
          <div className="space-y-1.5">
            <CardTitle>All campaigns ({campaigns?.length ?? 0})</CardTitle>
            <CardDescription>Each campaign is its own room — queue, run numbers, schedule, memory and sheet are isolated. The active campaign at top-left scopes every page.</CardDescription>
          </div>
          <Button size="sm" variant="outline" onClick={() => { qc.invalidateQueries(); toast.success("Refreshed"); }}>
            <RefreshCw className="h-4 w-4 mr-1"/>Refresh
          </Button>
        </CardHeader>
        <CardContent>
          {!campaigns?.length ? (
            <div className="text-sm text-muted-foreground">No campaigns yet. Create one above to start.</div>
          ) : (
            <ul className="divide-y divide-border">
              {campaigns.map((c) => {
                const isActive = c.id === activeId;
                return (
                  <li key={c.id} className="py-3 flex items-center gap-3 text-sm flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium flex items-center gap-2">
                        {c.name}
                        {isActive && <Badge variant="outline" className="text-[10px]"><CircleCheck className="h-3 w-3 mr-1"/>current</Badge>}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        Objective: {c.custom_objective || c.objective} · {c.share_learning ? "Shared learning" : "Isolated learning"}
                        {c.description ? ` · ${c.description}` : ""}
                      </div>
                    </div>
                    <div className="w-full md:w-auto flex items-center gap-2 order-last md:order-none">
                      <Select
                        value={(c as any).publish_mode ?? "addToQueue"}
                        onValueChange={(v) => publishMut.mutate({
                          id: c.id, publish_mode: v as PublishMode,
                          custom_scheduled_at: v === "customScheduled" ? ((c as any).custom_scheduled_at ?? new Date(Date.now() + 5 * 60000).toISOString()) : null,
                          publish_delay_minutes: v === "customScheduled" ? ((c as any).publish_delay_minutes ?? null) : null,
                        })}
                      >
                        <SelectTrigger className="h-8 w-[190px] text-xs"><SelectValue/></SelectTrigger>
                        <SelectContent>
                          {PUBLISH_MODES.map((m) => <SelectItem key={m.v} value={m.v}>{m.l}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      {(c as any).publish_mode === "customScheduled" && (
                        <>
                          <Input
                            type="datetime-local" className="h-8 w-[190px] text-xs"
                            value={isoToLocalInput((c as any).custom_scheduled_at)}
                            onChange={(e) => publishMut.mutate({ id: c.id, publish_mode: "customScheduled", custom_scheduled_at: localInputToIso(e.target.value), publish_delay_minutes: null })}
                          />
                          <Button size="sm" variant="outline" className="h-8 text-xs"
                            onClick={() => publishMut.mutate({ id: c.id, publish_mode: "customScheduled", custom_scheduled_at: null, publish_delay_minutes: 5 })}>
                            +5 min
                          </Button>
                        </>
                      )}
                    </div>
                    <Badge variant={c.status === "active" ? "default" : c.status === "paused" ? "secondary" : "destructive"} className="capitalize">
                      {c.status}
                    </Badge>
                    {!isActive && (
                      <Button size="sm" variant="outline" onClick={() => setActiveCampaignId(c.id)}>Switch to</Button>
                    )}
                    {c.status !== "active" ? (
                      <Button size="icon" variant="ghost" title="Resume" onClick={() => statusMut.mutate({ id: c.id, status: "active" })}>
                        <Play className="h-4 w-4 text-success"/>
                      </Button>
                    ) : (
                      <Button size="icon" variant="ghost" title="Pause" onClick={() => statusMut.mutate({ id: c.id, status: "paused" })}>
                        <Pause className="h-4 w-4"/>
                      </Button>
                    )}
                    {c.status !== "stopped" && (
                      <Button size="icon" variant="ghost" title="Stop" onClick={() => statusMut.mutate({ id: c.id, status: "stopped" })}>
                        <Square className="h-4 w-4 text-destructive"/>
                      </Button>
                    )}
                    <Button size="icon" variant="ghost" title="Reset runs & requeue videos (starts numbering at 1)"
                      disabled={resetMut.isPending}
                      onClick={() => {
                        if (confirm(`Reset "${c.name}"? Its run history is deleted and its videos go back to pending — numbering restarts at 1. Other campaigns are untouched.`))
                          resetMut.mutate({ id: c.id, clear_runs: true, clear_queue: false });
                      }}>
                      <RotateCcw className="h-4 w-4"/>
                    </Button>
                    <Button size="icon" variant="ghost" title="Wipe everything in this campaign (queue + runs + memory)"
                      disabled={resetMut.isPending}
                      onClick={() => {
                        if (confirm(`Wipe ALL data in "${c.name}" — queue, runs and learned memory? The campaign itself stays.`))
                          resetMut.mutate({ id: c.id, clear_runs: true, clear_queue: true, clear_memory: true });
                      }}>
                      <Eraser className="h-4 w-4 text-warning"/>
                    </Button>
                    <Button size="icon" variant="ghost" title="Delete" onClick={() => {
                      if (confirm(`Delete campaign "${c.name}"? All queue/runs/memory scoped to it will be removed.`)) delMut.mutate(c.id);
                    }}>
                      <Trash2 className="h-4 w-4 text-destructive"/>
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
