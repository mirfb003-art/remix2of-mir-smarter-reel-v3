import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { listQueue, addToQueue, removeFromQueue, resetQueueItem } from "@/lib/queue.functions";
import { listChannels } from "@/lib/channels.functions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Trash2, RotateCcw, Plus, ListVideo } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/queue")({ component: QueuePage });

function QueuePage() {
  const list = useServerFn(listQueue);
  const add = useServerFn(addToQueue);
  const remove = useServerFn(removeFromQueue);
  const reset = useServerFn(resetQueueItem);
  const chans = useServerFn(listChannels);
  const qc = useQueryClient();

  const [text, setText] = useState("");
  const [channelId, setChannelId] = useState<string>("");

  const { data: items } = useQuery({ queryKey: ["queue"], queryFn: () => list() });
  const { data: channels } = useQuery({ queryKey: ["channels"], queryFn: () => chans() });

  const addMut = useMutation({
    mutationFn: (urls: string[]) => add({ data: { urls, channel_id: channelId || null } }),
    onSuccess: (r) => { toast.success(`Added ${r.added} videos`); setText(""); qc.invalidateQueries({ queryKey: ["queue"] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  const rmMut = useMutation({ mutationFn: (id: string) => remove({ data: { id } }), onSuccess: () => qc.invalidateQueries({ queryKey: ["queue"] }) });
  const resetMut = useMutation({ mutationFn: (id: string) => reset({ data: { id } }), onSuccess: () => qc.invalidateQueries({ queryKey: ["queue"] }) });

  function submit() {
    const urls = text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    if (!urls.length) return toast.error("Paste one or more URLs");
    addMut.mutate(urls);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Queue</h1>
        <p className="text-sm text-muted-foreground">Paste Cloudinary URLs. Each run consumes one URL from the top.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Plus className="h-4 w-4"/>Add videos</CardTitle>
          <CardDescription>One URL per line. Assign a default channel (optional).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea rows={6} placeholder="https://res.cloudinary.com/.../video.mp4" value={text} onChange={(e) => setText(e.target.value)} className="font-mono text-xs" />
          <div className="flex gap-2 items-center">
            <Select value={channelId} onValueChange={setChannelId}>
              <SelectTrigger className="w-64"><SelectValue placeholder="Default channel (optional)" /></SelectTrigger>
              <SelectContent>
                {(channels ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name} · {c.platform}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={submit} disabled={addMut.isPending}>Add to queue</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ListVideo className="h-4 w-4"/>Queue ({items?.length ?? 0})</CardTitle>
        </CardHeader>
        <CardContent>
          {(items ?? []).length === 0 ? (
            <div className="text-sm text-muted-foreground">Queue is empty.</div>
          ) : (
            <ul className="divide-y divide-border">
              {(items ?? []).map((it) => (
                <li key={it.id} className="py-3 flex items-center gap-3">
                  <span className="text-xs text-muted-foreground w-8">#{it.position}</span>
                  <Badge variant="outline" className="capitalize">{it.status}</Badge>
                  <span className="font-mono text-xs truncate flex-1 text-muted-foreground">{it.cloudinary_url}</span>
                  {it.error && <span className="text-xs text-destructive truncate max-w-[180px]">{it.error}</span>}
                  {it.status !== "pending" && (
                    <Button size="icon" variant="ghost" onClick={() => resetMut.mutate(it.id)} title="Reset to pending">
                      <RotateCcw className="h-4 w-4" />
                    </Button>
                  )}
                  <Button size="icon" variant="ghost" onClick={() => rmMut.mutate(it.id)} title="Remove">
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
