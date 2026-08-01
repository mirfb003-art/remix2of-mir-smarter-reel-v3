-- Multi-tenant campaign scoping: additive columns only, nothing removed.
ALTER TABLE public.ai_settings ADD COLUMN IF NOT EXISTS campaign_id uuid REFERENCES public.campaigns(id) ON DELETE CASCADE;
ALTER TABLE public.buffer_credentials ADD COLUMN IF NOT EXISTS campaign_id uuid REFERENCES public.campaigns(id) ON DELETE CASCADE;
ALTER TABLE public.post_analytics ADD COLUMN IF NOT EXISTS campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL;
ALTER TABLE public.channels ADD COLUMN IF NOT EXISTS campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL;

-- Backfill analytics campaign from their published post.
UPDATE public.post_analytics pa
   SET campaign_id = pp.campaign_id
  FROM public.published_posts pp
 WHERE pa.published_post_id = pp.id AND pa.campaign_id IS NULL AND pp.campaign_id IS NOT NULL;

-- Composite indexes for campaign-scoped querying at scale.
CREATE INDEX IF NOT EXISTS idx_queue_campaign_status ON public.video_queue(campaign_id, status);
CREATE INDEX IF NOT EXISTS idx_queue_user_status ON public.video_queue(user_id, status);
CREATE INDEX IF NOT EXISTS idx_runs_campaign_created ON public.runs(campaign_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_runs_campaign_status ON public.runs(campaign_id, status);
CREATE INDEX IF NOT EXISTS idx_analytics_campaign ON public.post_analytics(campaign_id);
CREATE INDEX IF NOT EXISTS idx_captions_campaign ON public.captions(campaign_id);
CREATE INDEX IF NOT EXISTS idx_memory_campaign_active ON public.memory_insights(campaign_id, active);
CREATE INDEX IF NOT EXISTS idx_schedules_campaign ON public.schedules(campaign_id);
CREATE INDEX IF NOT EXISTS idx_published_campaign ON public.published_posts(campaign_id);
CREATE INDEX IF NOT EXISTS idx_predictions_campaign ON public.predictions(campaign_id);
CREATE INDEX IF NOT EXISTS idx_insight_trends_campaign ON public.insight_trends(campaign_id);
CREATE INDEX IF NOT EXISTS idx_strategies_campaign ON public.strategies(campaign_id);
CREATE INDEX IF NOT EXISTS idx_video_analyses_campaign ON public.video_analyses(campaign_id);
CREATE INDEX IF NOT EXISTS idx_learning_reports_campaign ON public.learning_reports(campaign_id);
CREATE INDEX IF NOT EXISTS idx_ai_settings_campaign ON public.ai_settings(campaign_id);
CREATE INDEX IF NOT EXISTS idx_buffer_creds_campaign ON public.buffer_credentials(campaign_id);
CREATE INDEX IF NOT EXISTS idx_channels_campaign ON public.channels(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_user_status ON public.campaigns(user_id, status);