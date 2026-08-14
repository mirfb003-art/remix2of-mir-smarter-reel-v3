import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { listCampaigns } from "@/lib/campaigns.functions";
import { listChannels } from "@/lib/channels.functions";
import {
  activateRecurringSchedule,
  deleteRecurringSchedule,
  listFormulaRunHistory,
  listRecurringSchedules,
  setRecurringScheduleActive,
} from "@/lib/recurring-schedules.functions";
import { useCampaignScope } from "@/components/campaign-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Pause, Play, Repeat2, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/reel-formula")({ component: ReelFormulaPage });

type Platform = "instagram" | "tiktok";

function localInputToIso(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function ReelFormulaPage() {
  const { campaignId } = useCampaignScope();
  const listCampaignsFn = useServerFn(listCampaigns);
  const listChannelsFn = useServerFn(listChannels);
  const listSchedulesFn = useServerFn(listRecurringSchedules);
  const activateFn = useServerFn(activateRecurringSchedule);
  const setActiveFn = useServerFn(setRecurringScheduleActive);
  const deleteFn = useServerFn(deleteRecurringSchedule);
  const listHistoryFn = useServerFn(listFormulaRunHistory);
  const qc = useQueryClient();

  const { data: campaigns } = useQuery({ queryKey: ["campaigns"], queryFn: () => listCampaignsFn() });
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>(campaignId ?? "none");
  const scopeCampaignId = selectedCampaignId === "none" ? null : selectedCampaignId;
  const { data: channels } = useQuery({
    queryKey: ["channels", scopeCampaignId],
    queryFn: () => listChannelsFn({ data: { campaign_id: scopeCampaignId } }),
  });
  const { data: schedules } = useQuery({ queryKey: ["recurring-schedules"], queryFn: () => listSchedulesFn() });
  const { data: history } = useQuery({ queryKey: ["formula-history"], queryFn: () => listHistoryFn() });

  const [channelId, setChannelId] = useState("");
  const [postType, setPostType] = useState("reel");
  const [mediaUrl, setMediaUrl] = useState("");
  const [caption, setCaption] = useState("");
  const [shareToFeed, setShareToFeed] = useState(true);
  const [thumbnailTimestamp, setThumbnailTimestamp] = useState(0);
  const [privacyLevel, setPrivacyLevel] = useState("PUBLIC");
  const [allowComments, setAllowComments] = useState(true);
  const [allowDuet, setAllowDuet] = useState(false);
  const [allowStitch, setAllowStitch] = useState(false);
  const [intervalHours, setIntervalHours] = useState(24);
  const [startImmediately, setStartImmediately] = useState(true);
  const [startAt, setStartAt] = useState("");

  const selectedChannel = (channels ?? []).find((channel: any) => channel.id === channelId) as any;
  const platform = (String(selectedChannel?.platform ?? "instagram").toLowerCase().includes("tiktok") ? "tiktok" : "instagram") as Platform;
  const platformChannels = useMemo(() => (channels ?? []).filter((channel: any) => channel.active && !channel.missing_since), [channels]);

  useEffect(() => {
    if (!channelId && platformChannels[0]) setChannelId(platformChannels[0].id);
    if (platform === "instagram" && !["reel", "story"].includes(postType)) setPostType("reel");
    if (platform === "tiktok" && !["video", "story"].includes(postType)) setPostType("video");
  }, [channelId, platformChannels, platform, postType]);

  const activateMut = useMutation({
    mutationFn: () => activateFn({
      data: {
        campaign_id: scopeCampaignId,
        channel_id: channelId,
        platform,
        post_type: postType as "reel" | "story" | "video",
        media_url: mediaUrl,
        caption,
        share_to_feed: shareToFeed,
        thumbnail_timestamp: Number(thumbnailTimestamp),
        privacy_level: platform === "tiktok" ? privacyLevel as "PUBLIC" | "MUTUAL_FOLLOWS" | "SELF_ONLY" : null,
        allow_comments: allowComments,
        allow_duet: allowDuet,
        allow_stitch: allowStitch,
        interval_hours: Number(intervalHours),
        start_at: startImmediately ? null : localInputToIso(startAt),
      },
    }),
    onSuccess: () => {
      toast.success("1 Reel Formula activated");
      qc.invalidateQueries({ queryKey: ["recurring-schedules"] });
      setMediaUrl("");
      setCaption("");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Activation failed"),
  });

  const activeMut = useMutation({
    mutationFn: (value: { id: string; is_active: boolean }) => setActiveFn({ data: value }),
    onSuccess: () => { toast.success("Formula updated"); qc.invalidateQueries({ queryKey: ["recurring-schedules"] }); },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Update failed"),
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => { toast.success("Formula deleted"); qc.invalidateQueries({ queryKey: ["recurring-schedules"] }); },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Delete failed"),
  });

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2"><Repeat2 className="h-5 w-5 text-primary" />1 Reel Formula</h1>
        <p className="text-sm text-muted-foreground">A separate recurring publisher for one fixed media asset. It does not use AI captions, the adaptive queue, or campaign learning.</p>
      </div>

      <Card>
        <CardHeader><CardTitle>Activate 1 Reel Formula</CardTitle><CardDescription>Choose an existing connected Buffer channel and configure one recurring post.</CardDescription></CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1"><Label>Campaign (optional)</Label><Select value={selectedCampaignId} onValueChange={(value) => { setSelectedCampaignId(value); setChannelId(""); }}><SelectTrigger><SelectValue placeholder="Shared workspace" /></SelectTrigger><SelectContent><SelectItem value="none">Shared workspace</SelectItem>{(campaigns ?? []).map((campaign: any) => <SelectItem key={campaign.id} value={campaign.id}>{campaign.name}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1"><Label>Buffer Connection & Channel</Label><Select value={channelId} onValueChange={setChannelId}><SelectTrigger><SelectValue placeholder="Select a connected channel" /></SelectTrigger><SelectContent>{platformChannels.map((channel: any) => <SelectItem key={channel.id} value={channel.id}>{channel.name} · {channel.platform}</SelectItem>)}</SelectContent></Select></div>
          </div>

          {selectedChannel ? (
            <div className="rounded-md border p-4 space-y-4">
              <div className="text-sm font-medium">{platform === "instagram" ? "Instagram settings" : "TikTok settings"}</div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1"><Label>Post Type</Label><Select value={postType} onValueChange={setPostType}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{platform === "instagram" ? <><SelectItem value="reel">Reel</SelectItem><SelectItem value="story">Story</SelectItem></> : <><SelectItem value="video">Video</SelectItem><SelectItem value="story">Story</SelectItem></>}</SelectContent></Select></div>
                <div className="space-y-1"><Label>Media URL</Label><Input type="url" value={mediaUrl} onChange={(event) => setMediaUrl(event.target.value)} placeholder="https://…/video.mp4" /></div>
              </div>
              <div className="space-y-1"><Label>Caption</Label><Textarea value={caption} onChange={(event) => setCaption(event.target.value)} disabled={platform === "instagram" && postType === "story"} placeholder={platform === "instagram" && postType === "story" ? "Disabled for Instagram Stories" : "Caption to publish each time"} /></div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1"><Label>Thumbnail Timestamp (seconds)</Label><Input type="number" min={0} step="0.1" value={thumbnailTimestamp} onChange={(event) => setThumbnailTimestamp(Number(event.target.value))} /></div>
                {platform === "tiktok" && <div className="space-y-1"><Label>Privacy Level</Label><Select value={privacyLevel} onValueChange={setPrivacyLevel}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="PUBLIC">PUBLIC</SelectItem><SelectItem value="MUTUAL_FOLLOWS">MUTUAL_FOLLOWS</SelectItem><SelectItem value="SELF_ONLY">SELF_ONLY</SelectItem></SelectContent></Select></div>}
              </div>
              {platform === "instagram" ? <label className="flex items-center gap-2 text-sm"><Checkbox checked={shareToFeed && postType === "reel"} disabled={postType !== "reel"} onCheckedChange={(checked) => setShareToFeed(Boolean(checked))} />Share to Feed</label> : <div className="flex flex-wrap gap-5"><label className="flex items-center gap-2 text-sm"><Checkbox checked={allowComments} onCheckedChange={(checked) => setAllowComments(Boolean(checked))} />Allow Comments</label><label className="flex items-center gap-2 text-sm"><Checkbox checked={allowDuet} onCheckedChange={(checked) => setAllowDuet(Boolean(checked))} />Allow Duet</label><label className="flex items-center gap-2 text-sm"><Checkbox checked={allowStitch} onCheckedChange={(checked) => setAllowStitch(Boolean(checked))} />Allow Stitch</label></div>}
            </div>
          ) : <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">Connect and select a Buffer channel before configuring the formula.</div>}

          <div className="rounded-md border p-4 space-y-4">
            <div className="font-medium text-sm">Scheduler interval</div>
            <div className="grid gap-4 md:grid-cols-2"><div className="space-y-1"><Label>Repeat every (hours)</Label><Input type="number" min={1} max={8760} value={intervalHours} onChange={(event) => setIntervalHours(Number(event.target.value))} /></div><div className="space-y-1"><Label>Start</Label><div className="flex gap-2"><Button type="button" variant={startImmediately ? "default" : "outline"} onClick={() => setStartImmediately(true)}>Start Immediately</Button><Button type="button" variant={!startImmediately ? "default" : "outline"} onClick={() => setStartImmediately(false)}>Specific time</Button></div>{!startImmediately && <Input className="mt-2" type="datetime-local" value={startAt} onChange={(event) => setStartAt(event.target.value)} />}</div></div>
          </div>
          <Button onClick={() => activateMut.mutate()} disabled={!channelId || !mediaUrl || !intervalHours || (!startImmediately && !startAt) || activateMut.isPending}><Repeat2 className="h-4 w-4 mr-2" />Activate 1 Reel Formula</Button>
        </CardContent>
      </Card>

      <Card><CardHeader><CardTitle>Active formulas</CardTitle><CardDescription>Pause, resume, or delete recurring formulas. Each formula runs independently from the main adaptive loop.</CardDescription></CardHeader><CardContent>{!schedules?.length ? <div className="text-sm text-muted-foreground">No formulas activated yet.</div> : <div className="space-y-3">{schedules.map((schedule: any) => <div key={schedule.id} className="flex flex-wrap items-center gap-3 rounded-md border p-3"><div className="min-w-0 flex-1"><div className="font-medium">{schedule.channels?.name ?? "Channel"} · {schedule.platform} {schedule.post_type}</div><div className="text-xs text-muted-foreground truncate">Every {schedule.interval_hours}h · next {new Date(schedule.next_run_at).toLocaleString()} · {schedule.media_url}</div>{schedule.last_error && <div className="text-xs text-destructive">{schedule.last_error}</div>}</div><Badge variant={schedule.is_active ? "default" : "secondary"}>{schedule.is_active ? "active" : "paused"}</Badge><Button size="icon" variant="ghost" title={schedule.is_active ? "Pause" : "Resume"} onClick={() => activeMut.mutate({ id: schedule.id, is_active: !schedule.is_active })}>{schedule.is_active ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}</Button><Button size="icon" variant="ghost" title="Delete" onClick={() => deleteMut.mutate(schedule.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button></div>)}</div>}</CardContent></Card>

      <Card><CardHeader><CardTitle>Recent formula runs</CardTitle><CardDescription>Formula publishes are logged to the shared runs and audit history with the `1_reel_formula` marker.</CardDescription></CardHeader><CardContent>{!history?.length ? <div className="text-sm text-muted-foreground">No formula runs yet.</div> : <div className="space-y-2">{history.map((run: any) => <div key={run.id} className="flex flex-wrap items-center gap-3 rounded-md border p-3 text-sm"><Badge variant={run.status === "complete" ? "default" : run.status === "failed" ? "destructive" : "secondary"}>{run.status}</Badge><span>{new Date(run.started_at).toLocaleString()}</span><span className="text-muted-foreground">{run.published_posts?.[0]?.permalink ?? run.error ?? "No proof yet"}</span></div>)}</div>}</CardContent></Card>
    </div>
  );
}
