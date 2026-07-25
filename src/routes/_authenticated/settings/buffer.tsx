import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listBufferCreds, saveBufferCred, deleteBufferCred, testBufferCred, verifyBufferSchema, syncBufferChannels } from "@/lib/buffer.functions";
import { listChannels, saveChannel, deleteChannel } from "@/lib/channels.functions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useState } from "react";
import { Plug, Trash2, CheckCircle2, ShieldCheck, RefreshCw } from "lucide-react";

export const Route = createFileRoute("/_authenticated/settings/buffer")({ component: BufferSettings });

function BufferSettings() {
  const list = useServerFn(listBufferCreds);
  const save = useServerFn(saveBufferCred);
  const del = useServerFn(deleteBufferCred);
  const test = useServerFn(testBufferCred);
  const verify = useServerFn(verifyBufferSchema);
  const sync = useServerFn(syncBufferChannels);
  const chansFn = useServerFn(listChannels);
  const saveChan = useServerFn(saveChannel);
  const delChan = useServerFn(deleteChannel);
  const qc = useQueryClient();

  const { data: creds } = useQuery({ queryKey: ["buffer-creds"], queryFn: () => list() });
  const { data: chans } = useQuery({ queryKey: ["channels"], queryFn: () => chansFn() });

  const [label, setLabel] = useState("");
  const [token, setToken] = useState("");
  const [endpoint, setEndpoint] = useState("https://graphql.buffer.com");

  const [chName, setChName] = useState("");
  const [chPlatform, setChPlatform] = useState("instagram");
  const [chBufferId, setChBufferId] = useState("");
  const [chCredId, setChCredId] = useState<string>("");
  const [syncedPreview, setSyncedPreview] = useState<Array<{ id: string; name: string; platform: string; avatar?: string }>>([]);

  const syncMut = useMutation({
    mutationFn: (id: string) => sync({ data: { id } }),
    onSuccess: (r) => {
      setSyncedPreview(r.channels);
      toast.success(`Successfully synced ${r.count} channel${r.count === 1 ? "" : "s"} from Buffer`);
      qc.invalidateQueries({ queryKey: ["channels"] });
      qc.invalidateQueries({ queryKey: ["buffer-creds"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Sync failed"),
  });

  const saveMut = useMutation({
    mutationFn: () => save({ data: { label, api_token: token, graphql_endpoint: endpoint } }),
    onSuccess: (r) => {
      toast.success("Saved");
      setLabel(""); setToken("");
      qc.invalidateQueries({ queryKey: ["buffer-creds"] });
      if (r?.id) syncMut.mutate(r.id);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  const delMut = useMutation({ mutationFn: (id: string) => del({ data: { id } }), onSuccess: () => qc.invalidateQueries({ queryKey: ["buffer-creds"] }) });
  const testMut = useMutation({
    mutationFn: (id: string) => test({ data: { id } }),
    onSuccess: (r) => { r.ok ? toast.success("Connected") : toast.error(r.message ?? "Failed"); qc.invalidateQueries({ queryKey: ["buffer-creds"] }); },
  });
  const verifyMut = useMutation({
    mutationFn: async (id: string) => {
      const r = await verify({ data: { id } });
      return { r, id };
    },
    onSuccess: ({ r, id }) => {
      if (r.ok) toast.success(`${r.message} · args: ${r.inputFields.join(", ") || "(none)"}`, { duration: 8000 });
      else toast.error(r.message, { duration: 10000 });
      syncMut.mutate(id);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  const chanMut = useMutation({
    mutationFn: () => saveChan({ data: { name: chName, platform: chPlatform, buffer_channel_id: chBufferId, credential_id: chCredId || null, active: true } }),
    onSuccess: () => { toast.success("Channel added"); setChName(""); setChBufferId(""); qc.invalidateQueries({ queryKey: ["channels"] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  const delChanMut = useMutation({ mutationFn: (id: string) => delChan({ data: { id } }), onSuccess: () => qc.invalidateQueries({ queryKey: ["channels"] }) });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Buffer</h1>
        <p className="text-sm text-muted-foreground">Store API tokens once, reuse across channels.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Plug className="h-4 w-4"/>Add credential</CardTitle>
          <CardDescription>Buffer GraphQL API token. Kept encrypted server-side.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <div className="space-y-1"><Label>Label</Label><Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="My Buffer" /></div>
          <div className="space-y-1"><Label>API Token</Label><Input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="1/abc…" /></div>
          <div className="space-y-1"><Label>GraphQL Endpoint</Label><Input value={endpoint} onChange={(e) => setEndpoint(e.target.value)} /></div>
          <div className="md:col-span-3"><Button onClick={() => saveMut.mutate()} disabled={!label || !token}>Save credential</Button></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Saved credentials</CardTitle></CardHeader>
        <CardContent>
          {(creds ?? []).length === 0 ? <div className="text-sm text-muted-foreground">None yet.</div> : (
            <ul className="divide-y divide-border">
              {(creds ?? []).map((c) => (
                <li key={c.id} className="py-3 flex flex-wrap items-center gap-2">
                  <div className="flex-1 min-w-[180px]">
                    <div className="text-sm font-medium">{c.label}</div>
                    <div className="text-xs text-muted-foreground font-mono">{c.graphql_endpoint}</div>
                  </div>
                  <Badge variant={c.status === "connected" ? "default" : "outline"}>{c.status}</Badge>
                  <Button size="sm" variant="outline" onClick={() => testMut.mutate(c.id)} disabled={testMut.isPending}><CheckCircle2 className="h-4 w-4 mr-1"/>Test</Button>
                  <Button size="sm" variant="outline" onClick={() => verifyMut.mutate(c.id)} disabled={verifyMut.isPending}><ShieldCheck className="h-4 w-4 mr-1"/>Verify publish</Button>
                  <Button size="sm" variant="outline" onClick={() => syncMut.mutate(c.id)} disabled={syncMut.isPending}><RefreshCw className={`h-4 w-4 mr-1 ${syncMut.isPending ? "animate-spin" : ""}`}/>Sync channels</Button>
                  <Button size="icon" variant="ghost" onClick={() => delMut.mutate(c.id)}><Trash2 className="h-4 w-4 text-destructive"/></Button>
                </li>
              ))}
            </ul>
          )}
          {syncedPreview.length > 0 && (
            <div className="mt-4 rounded-md border border-border bg-muted/30 p-3">
              <div className="text-xs font-medium mb-2">Last synced ({syncedPreview.length})</div>
              <ul className="flex flex-wrap gap-2">
                {syncedPreview.map((s) => (
                  <li key={s.id} className="flex items-center gap-2 rounded-full border border-border bg-background px-2 py-1 text-xs">
                    {s.avatar && <img src={s.avatar} alt="" className="h-4 w-4 rounded-full" />}
                    <span className="font-medium">{s.name}</span>
                    <span className="text-muted-foreground">· {s.platform}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Publishing channels</CardTitle>
          <CardDescription>A channel = one Buffer profile Loop can post to.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-5">
            <div className="space-y-1"><Label>Name</Label><Input value={chName} onChange={(e) => setChName(e.target.value)} placeholder="Brand IG"/></div>
            <div className="space-y-1"><Label>Platform</Label>
              <Select value={chPlatform} onValueChange={setChPlatform}>
                <SelectTrigger><SelectValue/></SelectTrigger>
                <SelectContent>
                  {["instagram","tiktok","youtube","facebook","x","linkedin","threads"].map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label>Buffer Channel ID</Label><Input value={chBufferId} onChange={(e) => setChBufferId(e.target.value)} placeholder="5f…"/></div>
            <div className="space-y-1"><Label>Credential</Label>
              <Select value={chCredId} onValueChange={setChCredId}>
                <SelectTrigger><SelectValue placeholder="Optional"/></SelectTrigger>
                <SelectContent>
                  {(creds ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end"><Button onClick={() => chanMut.mutate()} disabled={!chName || !chBufferId} className="w-full">Add</Button></div>
          </div>
          {(chans ?? []).length === 0 ? <div className="text-sm text-muted-foreground">No channels yet.</div> : (
            <ul className="divide-y divide-border">
              {(chans ?? []).map((c) => (
                <li key={c.id} className="py-2 flex items-center gap-3 text-sm">
                  <div className="flex-1">
                    <div className="font-medium">{c.name}</div>
                    <div className="text-xs text-muted-foreground">{c.platform} · {c.buffer_channel_id}</div>
                  </div>
                  <Badge variant={c.active ? "default" : "outline"}>{c.active ? "active" : "off"}</Badge>
                  <Button size="icon" variant="ghost" onClick={() => delChanMut.mutate(c.id)}><Trash2 className="h-4 w-4 text-destructive"/></Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
