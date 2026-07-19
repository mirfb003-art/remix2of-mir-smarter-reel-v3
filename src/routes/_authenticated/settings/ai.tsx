import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getAllSettings, updateAiSettings } from "@/lib/settings.functions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { toast } from "sonner";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/_authenticated/settings/ai")({ component: AiSettings });

const objectives = [
  { v: "followers", d: "Grow follower count" },
  { v: "likes", d: "Maximize likes" },
  { v: "comments", d: "Spark conversations" },
  { v: "shares", d: "Get shared widely" },
  { v: "saves", d: "Encourage saves (value)" },
  { v: "watch_time", d: "Increase watch time" },
  { v: "profile_visits", d: "Drive profile visits" },
  { v: "ctr", d: "Click-through to link" },
  { v: "reach", d: "Maximize reach" },
  { v: "engagement", d: "Overall engagement" },
  { v: "brand_awareness", d: "Brand awareness" },
  { v: "custom", d: "Custom (describe below)" },
];

function AiSettings() {
  const get = useServerFn(getAllSettings);
  const upd = useServerFn(updateAiSettings);
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["settings"], queryFn: () => get() });

  const [state, setState] = useState<any>(null);
  useEffect(() => { if (data?.ai) setState(data.ai); }, [data]);

  const mut = useMutation({
    mutationFn: () => upd({ data: {
      objective: state.objective, custom_objective: state.custom_objective ?? null,
      brand_tone: state.brand_tone, language: state.language,
      default_hashtags: state.default_hashtags ?? [], max_caption_length: state.max_caption_length,
      temperature: Number(state.temperature), model: state.model,
      user_instructions: state.user_instructions ?? null,
    } }),
    onSuccess: () => { toast.success("Saved"); qc.invalidateQueries({ queryKey: ["settings"] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  if (!state) return <div className="text-sm text-muted-foreground">Loading…</div>;

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">AI Objective & Style</h1>
        <p className="text-sm text-muted-foreground">Every caption is optimized for this goal.</p>
      </div>

      <Card>
        <CardHeader><CardTitle>Objective</CardTitle><CardDescription>What should Loop optimize for?</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1"><Label>Primary objective</Label>
              <Select value={state.objective} onValueChange={(v) => setState({ ...state, objective: v })}>
                <SelectTrigger><SelectValue/></SelectTrigger>
                <SelectContent>{objectives.map(o => <SelectItem key={o.v} value={o.v}>{o.d}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label>Language</Label><Input value={state.language} onChange={(e) => setState({ ...state, language: e.target.value })}/></div>
          </div>
          {state.objective === "custom" && (
            <div className="space-y-1"><Label>Custom objective</Label>
              <Input value={state.custom_objective ?? ""} onChange={(e) => setState({ ...state, custom_objective: e.target.value })} placeholder="e.g. drive newsletter signups"/></div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Voice</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1"><Label>Brand tone</Label>
            <Input value={state.brand_tone} onChange={(e) => setState({ ...state, brand_tone: e.target.value })} placeholder="witty, direct, curious"/></div>
          <div className="space-y-1"><Label>Default hashtags (comma-separated)</Label>
            <Input value={(state.default_hashtags ?? []).join(", ")} onChange={(e) => setState({ ...state, default_hashtags: e.target.value.split(",").map((s: string) => s.trim()).filter(Boolean) })} placeholder="#growth, #startup"/></div>
          <div className="space-y-1"><Label>Extra instructions</Label>
            <Textarea rows={4} value={state.user_instructions ?? ""} onChange={(e) => setState({ ...state, user_instructions: e.target.value })} placeholder="Anything else the AI should always know."/></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Model</CardTitle></CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div className="space-y-1 md:col-span-1"><Label>Model</Label>
            <Select value={state.model} onValueChange={(v) => setState({ ...state, model: v })}>
              <SelectTrigger><SelectValue/></SelectTrigger>
              <SelectContent>
                <SelectItem value="google/gemini-2.5-flash">Gemini 2.5 Flash (default)</SelectItem>
                <SelectItem value="google/gemini-2.5-pro">Gemini 2.5 Pro</SelectItem>
                <SelectItem value="google/gemini-2.5-flash-lite">Gemini 2.5 Flash Lite</SelectItem>
                <SelectItem value="openai/gpt-5-mini">GPT-5 mini</SelectItem>
                <SelectItem value="openai/gpt-5">GPT-5</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 md:col-span-2">
            <div className="flex items-center justify-between"><Label>Creativity (temperature)</Label><span className="text-xs text-muted-foreground">{Number(state.temperature).toFixed(2)}</span></div>
            <Slider min={0} max={1.5} step={0.05} value={[Number(state.temperature)]} onValueChange={([v]) => setState({ ...state, temperature: v })}/>
          </div>
          <div className="space-y-1"><Label>Max caption length</Label>
            <Input type="number" value={state.max_caption_length} onChange={(e) => setState({ ...state, max_caption_length: Number(e.target.value) })}/></div>
        </CardContent>
      </Card>

      <Button onClick={() => mut.mutate()}>Save AI settings</Button>
    </div>
  );
}
