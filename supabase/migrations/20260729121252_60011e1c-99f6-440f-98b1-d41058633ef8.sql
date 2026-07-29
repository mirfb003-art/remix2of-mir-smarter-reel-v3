
ALTER TABLE public.ai_settings
  ADD COLUMN IF NOT EXISTS provider_mode text NOT NULL DEFAULT 'strict',
  ADD COLUMN IF NOT EXISTS active_provider text NOT NULL DEFAULT 'lovable',
  ADD COLUMN IF NOT EXISTS providers_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS fallback_chain jsonb NOT NULL DEFAULT '["lovable"]'::jsonb;

ALTER TABLE public.ai_settings
  DROP CONSTRAINT IF EXISTS ai_settings_provider_mode_check;
ALTER TABLE public.ai_settings
  ADD CONSTRAINT ai_settings_provider_mode_check CHECK (provider_mode IN ('strict','fallback'));
