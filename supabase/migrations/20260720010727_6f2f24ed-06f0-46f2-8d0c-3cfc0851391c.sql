
-- Extend enums
ALTER TYPE queue_status ADD VALUE IF NOT EXISTS 'dead_letter';
ALTER TYPE run_status ADD VALUE IF NOT EXISTS 'stale';

-- runs: reliability columns
ALTER TABLE public.runs
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS current_step text,
  ADD COLUMN IF NOT EXISTS step_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS heartbeat_at timestamptz,
  ADD COLUMN IF NOT EXISTS attempts int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS prompt_version_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS runs_user_idem_uidx
  ON public.runs(user_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

-- channels: lock columns
ALTER TABLE public.channels
  ADD COLUMN IF NOT EXISTS active_run_id uuid,
  ADD COLUMN IF NOT EXISTS lock_expires_at timestamptz;

-- video_queue: idempotency + dead letter
ALTER TABLE public.video_queue
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS max_attempts int NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS dead_letter_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_error_module text;

CREATE UNIQUE INDEX IF NOT EXISTS video_queue_user_idem_uidx
  ON public.video_queue(user_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

-- audit_events: immutable trail
CREATE TABLE IF NOT EXISTS public.audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  run_id uuid,
  queue_item_id uuid,
  event_type text NOT NULL,      -- e.g. queue.claimed, ai.request, ai.response, publish.request, publish.response, analytics.fetched, retry, strategy.change, lock.acquired, lock.released
  module text,                    -- ai, buffer, cloudinary, db, orchestrator
  attempt int NOT NULL DEFAULT 0,
  status text,                    -- success, error, skipped
  duration_ms int,
  payload jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.audit_events TO authenticated;
GRANT ALL ON public.audit_events TO service_role;
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit_events read own"   ON public.audit_events FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "audit_events insert own" ON public.audit_events FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS audit_events_user_time_idx ON public.audit_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_events_run_idx ON public.audit_events(run_id);

-- prompt_versions
CREATE TABLE IF NOT EXISTS public.prompt_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,                  -- null = system default
  name text NOT NULL,
  version int NOT NULL,
  vision_prompt text NOT NULL,
  learning_prompt text NOT NULL,
  caption_prompt text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, name, version)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prompt_versions TO authenticated;
GRANT ALL ON public.prompt_versions TO service_role;
ALTER TABLE public.prompt_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "prompt_versions read"   ON public.prompt_versions FOR SELECT TO authenticated USING (user_id IS NULL OR auth.uid() = user_id);
CREATE POLICY "prompt_versions write"  ON public.prompt_versions FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Seed system default prompt version
INSERT INTO public.prompt_versions (user_id, name, version, vision_prompt, learning_prompt, caption_prompt, notes)
SELECT NULL, 'default', 1,
'Analyze this short-form video (frames sampled below). Return STRICT JSON only, no prose, matching this shape: {"summary":string,"objects":string[],"people":string,"scene":string,"actions":string[],"emotions":string[],"topic":string,"story":string,"message":string}',
'You are a social-media performance analyst. Given the previous post''s caption and metrics, produce STRICT JSON only with fields: worked, hook_verdict, length_verdict, emoji_verdict, hashtag_verdict, cta_verdict, cause, change_recommendation, new_insights[]{category,insight,confidence}',
'You are Loop, an adaptive short-form caption engine. Blend objective, brand tone, durable learnings, and current video understanding. Return STRICT JSON only: {"caption":string,"hook":string,"cta":string,"hashtags":string[],"style_tags":string[]}',
'Initial system default prompt set.'
WHERE NOT EXISTS (SELECT 1 FROM public.prompt_versions WHERE user_id IS NULL AND name='default' AND version=1);

-- Atomic channel lock claim
CREATE OR REPLACE FUNCTION public.try_claim_channel_lock(
  _channel_id uuid, _run_id uuid, _ttl_seconds int
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _ok boolean;
BEGIN
  UPDATE public.channels
     SET active_run_id = _run_id,
         lock_expires_at = now() + make_interval(secs => _ttl_seconds)
   WHERE id = _channel_id
     AND (active_run_id IS NULL OR lock_expires_at IS NULL OR lock_expires_at < now());
  GET DIAGNOSTICS _ok = ROW_COUNT;
  RETURN _ok::int > 0;
END $$;

CREATE OR REPLACE FUNCTION public.release_channel_lock(_channel_id uuid, _run_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.channels
     SET active_run_id = NULL, lock_expires_at = NULL
   WHERE id = _channel_id AND (active_run_id = _run_id OR active_run_id IS NULL);
$$;

GRANT EXECUTE ON FUNCTION public.try_claim_channel_lock(uuid,uuid,int) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.release_channel_lock(uuid,uuid) TO authenticated, service_role;
