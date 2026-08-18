import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { BarChart3, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { listFormulaInsights, syncFormulaInsight } from "@/lib/formula-insights.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type FormulaMetric = { type?: string; name?: string; value?: number; unit?: string };

function formatMetricValue(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric.toLocaleString() : String(value ?? "—");
}

export function FormulaInsights({ scheduleId }: { scheduleId: string }) {
  const [open, setOpen] = useState(false);
  const getInsights = useServerFn(listFormulaInsights);
  const sync = useServerFn(syncFormulaInsight);
  const query = useQuery({
    queryKey: ["formula-insights", scheduleId],
    queryFn: () => getInsights({ data: { schedule_id: scheduleId } }),
    enabled: open,
  });
  const syncMut = useMutation({
    mutationFn: (insightId: string) => sync({ data: { insight_id: insightId } }),
    onSuccess: () => { toast.success("Insights synced"); query.refetch(); },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Insights sync failed"),
  });

  return (
    <div className="w-full md:w-auto">
      <Button type="button" size="sm" variant="outline" onClick={() => setOpen((value) => !value)}>
        <BarChart3 className="h-4 w-4 mr-1" />
        {open ? "Hide insights" : "Insights"}
      </Button>
      {open && (
        <div className="mt-3 rounded-md border bg-muted/20 p-3 text-sm md:min-w-[28rem]">
          {query.isLoading ? (
            <div className="text-muted-foreground">Loading Formula insights…</div>
          ) : query.error ? (
            <div className="text-destructive">Unable to load this Formula&apos;s insights.</div>
          ) : query.data?.length ? (
            <div className="space-y-3">
              {query.data.map((insight: any) => {
                const metrics = (Array.isArray(insight.metrics) ? insight.metrics : []) as FormulaMetric[];
                const isStory = insight.post_type === "story";
                return (
                  <div key={insight.id} className="rounded border bg-background p-3 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="font-medium">{insight.runs?.started_at ? new Date(insight.runs.started_at).toLocaleString() : new Date(insight.created_at).toLocaleString()}</div>
                      <Badge variant={insight.sync_status === "synced" ? "default" : insight.sync_status === "failed" ? "destructive" : "secondary"}>{insight.sync_status}</Badge>
                    </div>
                    {metrics.length ? (
                      <div className="grid gap-1 sm:grid-cols-2">
                        {metrics.map((metric, index) => <div key={`${metric.type ?? metric.name ?? "metric"}-${index}`} className="text-xs"><span className="font-medium">{metric.name ?? metric.type ?? "Metric"}:</span> {formatMetricValue(metric.value)} {metric.unit ?? ""}</div>)}
                      </div>
                    ) : (
                      <div className="text-xs text-muted-foreground">No metrics yet — Buffer may not have ingested this post.</div>
                    )}
                    <div className="text-xs text-muted-foreground space-y-0.5">
                      <div>Last synced: {insight.last_synced_at ? new Date(insight.last_synced_at).toLocaleString() : "Not synced yet"}</div>
                      {insight.metrics_updated_at && <div>Buffer metrics updated: {new Date(insight.metrics_updated_at).toLocaleString()}</div>}
                      {insight.last_error && <div className="text-destructive">{insight.last_error}</div>}
                    </div>
                    {isStory ? (
                      <div className="text-xs text-muted-foreground">Automatic Story sync is scheduled before the Story expires.</div>
                    ) : (
                      <Button type="button" size="sm" variant="outline" onClick={() => syncMut.mutate(insight.id)} disabled={syncMut.isPending}>
                        <RefreshCw className={`h-3.5 w-3.5 mr-1 ${syncMut.isPending ? "animate-spin" : ""}`} />
                        {syncMut.isPending ? "Syncing…" : "Sync"}
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-muted-foreground">No Formula insights yet.</div>
          )}
        </div>
      )}
    </div>
  );
}
