
-- 1. campaigns table
CREATE TABLE public.campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  objective text NOT NULL DEFAULT 'engagement',
  custom_objective text,
  status text NOT NULL DEFAULT 'active', -- active | paused | stopped
  share_learning boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaigns TO authenticated;
GRANT ALL ON public.campaigns TO service_role;
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own campaigns" ON public.campaigns FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_campaigns_updated BEFORE UPDATE ON public.campaigns FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. add campaign_id to scoped tables
ALTER TABLE public.video_queue      ADD COLUMN campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL;
ALTER TABLE public.runs             ADD COLUMN campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL;
ALTER TABLE public.memory_insights  ADD COLUMN campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL;
ALTER TABLE public.learning_reports ADD COLUMN campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL;
ALTER TABLE public.strategies       ADD COLUMN campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL;
ALTER TABLE public.predictions      ADD COLUMN campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL;
ALTER TABLE public.insight_trends   ADD COLUMN campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL;
ALTER TABLE public.published_posts  ADD COLUMN campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL;
ALTER TABLE public.captions         ADD COLUMN campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL;
ALTER TABLE public.video_analyses   ADD COLUMN campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL;
ALTER TABLE public.schedules        ADD COLUMN campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL;

-- 3. scheduler pause flag
ALTER TABLE public.schedules ADD COLUMN paused boolean NOT NULL DEFAULT false;

-- 4. backfill: create one Default Campaign per distinct user across all scoped tables + settings
INSERT INTO public.campaigns (user_id, name, description, objective)
SELECT DISTINCT user_id, 'Default Campaign', 'Auto-created for existing data', COALESCE((SELECT objective::text FROM public.ai_settings a WHERE a.user_id = u.user_id LIMIT 1), 'engagement')
FROM (
  SELECT user_id FROM public.video_queue
  UNION SELECT user_id FROM public.runs
  UNION SELECT user_id FROM public.channels
  UNION SELECT user_id FROM public.settings
) u
WHERE user_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.campaigns c WHERE c.user_id = u.user_id);

-- 5. backfill campaign_id everywhere using the user's default campaign
WITH def AS (
  SELECT DISTINCT ON (user_id) user_id, id FROM public.campaigns ORDER BY user_id, created_at ASC
)
UPDATE public.video_queue v SET campaign_id = d.id FROM def d WHERE v.user_id = d.user_id AND v.campaign_id IS NULL;

WITH def AS (SELECT DISTINCT ON (user_id) user_id, id FROM public.campaigns ORDER BY user_id, created_at ASC)
UPDATE public.runs v SET campaign_id = d.id FROM def d WHERE v.user_id = d.user_id AND v.campaign_id IS NULL;

WITH def AS (SELECT DISTINCT ON (user_id) user_id, id FROM public.campaigns ORDER BY user_id, created_at ASC)
UPDATE public.memory_insights v SET campaign_id = d.id FROM def d WHERE v.user_id = d.user_id AND v.campaign_id IS NULL;

WITH def AS (SELECT DISTINCT ON (user_id) user_id, id FROM public.campaigns ORDER BY user_id, created_at ASC)
UPDATE public.learning_reports v SET campaign_id = d.id FROM def d WHERE v.user_id = d.user_id AND v.campaign_id IS NULL;

WITH def AS (SELECT DISTINCT ON (user_id) user_id, id FROM public.campaigns ORDER BY user_id, created_at ASC)
UPDATE public.strategies v SET campaign_id = d.id FROM def d WHERE v.user_id = d.user_id AND v.campaign_id IS NULL;

WITH def AS (SELECT DISTINCT ON (user_id) user_id, id FROM public.campaigns ORDER BY user_id, created_at ASC)
UPDATE public.predictions v SET campaign_id = d.id FROM def d WHERE v.user_id = d.user_id AND v.campaign_id IS NULL;

WITH def AS (SELECT DISTINCT ON (user_id) user_id, id FROM public.campaigns ORDER BY user_id, created_at ASC)
UPDATE public.insight_trends v SET campaign_id = d.id FROM def d WHERE v.user_id = d.user_id AND v.campaign_id IS NULL;

WITH def AS (SELECT DISTINCT ON (user_id) user_id, id FROM public.campaigns ORDER BY user_id, created_at ASC)
UPDATE public.published_posts v SET campaign_id = d.id FROM def d WHERE v.user_id = d.user_id AND v.campaign_id IS NULL;

WITH def AS (SELECT DISTINCT ON (user_id) user_id, id FROM public.campaigns ORDER BY user_id, created_at ASC)
UPDATE public.captions v SET campaign_id = d.id FROM def d WHERE v.user_id = d.user_id AND v.campaign_id IS NULL;

WITH def AS (SELECT DISTINCT ON (user_id) user_id, id FROM public.campaigns ORDER BY user_id, created_at ASC)
UPDATE public.video_analyses v SET campaign_id = d.id FROM def d WHERE v.user_id = d.user_id AND v.campaign_id IS NULL;

WITH def AS (SELECT DISTINCT ON (user_id) user_id, id FROM public.campaigns ORDER BY user_id, created_at ASC)
UPDATE public.schedules v SET campaign_id = d.id FROM def d WHERE v.user_id = d.user_id AND v.campaign_id IS NULL;

-- 6. helpful indexes
CREATE INDEX IF NOT EXISTS idx_video_queue_campaign ON public.video_queue(campaign_id);
CREATE INDEX IF NOT EXISTS idx_runs_campaign ON public.runs(campaign_id);
CREATE INDEX IF NOT EXISTS idx_memory_insights_campaign ON public.memory_insights(campaign_id);
CREATE INDEX IF NOT EXISTS idx_insight_trends_campaign ON public.insight_trends(campaign_id);
CREATE INDEX IF NOT EXISTS idx_published_posts_campaign ON public.published_posts(campaign_id);
