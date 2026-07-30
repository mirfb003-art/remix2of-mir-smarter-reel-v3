ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS publish_mode text NOT NULL DEFAULT 'addToQueue',
  ADD COLUMN IF NOT EXISTS custom_scheduled_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS publish_delay_minutes integer;

ALTER TABLE public.campaigns
  ADD CONSTRAINT campaigns_publish_mode_check
  CHECK (publish_mode IN ('addToQueue','shareNow','customScheduled'));

ALTER TABLE public.schedules
  ADD COLUMN IF NOT EXISTS publish_mode text,
  ADD COLUMN IF NOT EXISTS custom_scheduled_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS publish_delay_minutes integer;

ALTER TABLE public.schedules
  ADD CONSTRAINT schedules_publish_mode_check
  CHECK (publish_mode IS NULL OR publish_mode IN ('addToQueue','shareNow','customScheduled'));