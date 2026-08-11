ALTER TABLE public.channels
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz,
  ADD COLUMN IF NOT EXISTS missing_since timestamptz;

UPDATE public.channels SET last_seen_at = COALESCE(last_seen_at, updated_at) WHERE last_seen_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_channels_missing_since ON public.channels(missing_since);