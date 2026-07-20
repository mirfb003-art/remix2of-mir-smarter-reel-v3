import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { listCampaigns } from "@/lib/campaigns.functions";
import { getActiveCampaignId, setActiveCampaignId, useActiveCampaignId } from "@/lib/active-campaign";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useEffect } from "react";

export function CampaignSelector() {
  const fn = useServerFn(listCampaigns);
  const { data: campaigns } = useQuery({ queryKey: ["campaigns"], queryFn: () => fn() });
  const activeId = useActiveCampaignId();

  // Auto-select first campaign if none set once loaded.
  useEffect(() => {
    if (!campaigns?.length) return;
    if (!getActiveCampaignId()) setActiveCampaignId(campaigns[0].id);
    else if (!campaigns.find((c) => c.id === getActiveCampaignId())) setActiveCampaignId(campaigns[0].id);
  }, [campaigns]);

  if (!campaigns?.length) {
    return (
      <Link to="/campaigns" className="text-xs text-primary hover:underline px-2">
        Create your first campaign →
      </Link>
    );
  }

  const value = activeId && campaigns.find((c) => c.id === activeId) ? activeId : campaigns[0].id;

  return (
    <Select value={value} onValueChange={(v) => setActiveCampaignId(v)}>
      <SelectTrigger className="h-8 text-xs w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {campaigns.map((c) => (
          <SelectItem key={c.id} value={c.id}>
            <span className="flex items-center gap-2">
              <span className={`h-1.5 w-1.5 rounded-full ${c.status === "active" ? "bg-success" : c.status === "paused" ? "bg-warning" : "bg-destructive"}`} />
              {c.name}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
