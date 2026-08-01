ALTER TABLE public.ai_settings DROP CONSTRAINT IF EXISTS ai_settings_user_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS ai_settings_user_campaign_uniq
  ON public.ai_settings(user_id, campaign_id) WHERE campaign_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ai_settings_user_global_uniq
  ON public.ai_settings(user_id) WHERE campaign_id IS NULL;