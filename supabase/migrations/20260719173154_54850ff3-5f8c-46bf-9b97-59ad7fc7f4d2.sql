
-- Extensions for scheduler
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Enums
CREATE TYPE public.run_status AS ENUM ('pending','analyzing','generating','publishing','awaiting_analytics','complete','failed');
CREATE TYPE public.queue_status AS ENUM ('pending','processing','done','failed','skipped');
CREATE TYPE public.schedule_mode AS ENUM ('interval','daily_times','manual');
CREATE TYPE public.channel_objective AS ENUM ('followers','likes','comments','shares','saves','watch_time','profile_visits','ctr','reach','engagement','brand_awareness','custom');
CREATE TYPE public.analysis_scope AS ENUM ('last_n','top_n','highest_engagement','highest_views','highest_saves','all','custom');
CREATE TYPE public.insight_category AS ENUM ('hook','length','emoji','hashtag','cta','topic','style','timing','other');

-- updated_at helper
CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

-- profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  display_name TEXT,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile" ON public.profiles FOR ALL USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name) VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email,'@',1)));
  INSERT INTO public.ai_settings (user_id) VALUES (NEW.id);
  INSERT INTO public.analysis_settings (user_id) VALUES (NEW.id);
  INSERT INTO public.settings (user_id) VALUES (NEW.id);
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- buffer_credentials
CREATE TABLE public.buffer_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  label TEXT NOT NULL DEFAULT 'Default',
  api_token TEXT NOT NULL,
  graphql_endpoint TEXT NOT NULL DEFAULT 'https://graphql.buffer.com',
  status TEXT NOT NULL DEFAULT 'unknown',
  last_tested_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.buffer_credentials TO authenticated;
GRANT ALL ON public.buffer_credentials TO service_role;
ALTER TABLE public.buffer_credentials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own buffer creds" ON public.buffer_credentials FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_buffer_creds_updated BEFORE UPDATE ON public.buffer_credentials FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- channels
CREATE TABLE public.channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  credential_id UUID REFERENCES public.buffer_credentials ON DELETE SET NULL,
  buffer_channel_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  name TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.channels TO authenticated;
GRANT ALL ON public.channels TO service_role;
ALTER TABLE public.channels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own channels" ON public.channels FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_channels_updated BEFORE UPDATE ON public.channels FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ai_settings
CREATE TABLE public.ai_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users ON DELETE CASCADE,
  objective public.channel_objective NOT NULL DEFAULT 'engagement',
  custom_objective TEXT,
  brand_tone TEXT NOT NULL DEFAULT 'friendly, energetic, authentic',
  language TEXT NOT NULL DEFAULT 'en',
  default_hashtags TEXT[] NOT NULL DEFAULT '{}',
  max_caption_length INT NOT NULL DEFAULT 2200,
  temperature NUMERIC NOT NULL DEFAULT 0.8,
  model TEXT NOT NULL DEFAULT 'google/gemini-3-flash-preview',
  platform_rules JSONB NOT NULL DEFAULT '{}'::jsonb,
  user_instructions TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_settings TO authenticated;
GRANT ALL ON public.ai_settings TO service_role;
ALTER TABLE public.ai_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own ai settings" ON public.ai_settings FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_ai_settings_updated BEFORE UPDATE ON public.ai_settings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- analysis_settings
CREATE TABLE public.analysis_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users ON DELETE CASCADE,
  scope public.analysis_scope NOT NULL DEFAULT 'last_n',
  n_value INT NOT NULL DEFAULT 5,
  custom_query TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.analysis_settings TO authenticated;
GRANT ALL ON public.analysis_settings TO service_role;
ALTER TABLE public.analysis_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own analysis settings" ON public.analysis_settings FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_analysis_settings_updated BEFORE UPDATE ON public.analysis_settings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- schedules
CREATE TABLE public.schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  channel_id UUID NOT NULL REFERENCES public.channels ON DELETE CASCADE,
  mode public.schedule_mode NOT NULL DEFAULT 'manual',
  interval_hours NUMERIC,
  daily_times TEXT[] NOT NULL DEFAULT '{}',
  next_run_at TIMESTAMPTZ,
  last_run_at TIMESTAMPTZ,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.schedules TO authenticated;
GRANT ALL ON public.schedules TO service_role;
ALTER TABLE public.schedules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own schedules" ON public.schedules FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_schedules_updated BEFORE UPDATE ON public.schedules FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_schedules_next_run ON public.schedules (next_run_at) WHERE active;

-- video_queue
CREATE TABLE public.video_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  channel_id UUID REFERENCES public.channels ON DELETE SET NULL,
  position INT NOT NULL,
  cloudinary_url TEXT NOT NULL,
  status public.queue_status NOT NULL DEFAULT 'pending',
  attempts INT NOT NULL DEFAULT 0,
  error TEXT,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.video_queue TO authenticated;
GRANT ALL ON public.video_queue TO service_role;
ALTER TABLE public.video_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own queue" ON public.video_queue FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_queue_user_pos ON public.video_queue (user_id, channel_id, position) WHERE status = 'pending';

-- runs
CREATE TABLE public.runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  channel_id UUID REFERENCES public.channels ON DELETE SET NULL,
  queue_item_id UUID REFERENCES public.video_queue ON DELETE SET NULL,
  run_number INT NOT NULL,
  status public.run_status NOT NULL DEFAULT 'pending',
  strategy_used TEXT,
  next_strategy TEXT,
  error TEXT,
  duration_ms INT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.runs TO authenticated;
GRANT ALL ON public.runs TO service_role;
ALTER TABLE public.runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own runs" ON public.runs FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_runs_updated BEFORE UPDATE ON public.runs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_runs_user_started ON public.runs (user_id, started_at DESC);

-- video_analyses
CREATE TABLE public.video_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.runs ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  summary TEXT,
  objects TEXT[] DEFAULT '{}',
  people TEXT,
  scene TEXT,
  actions TEXT[] DEFAULT '{}',
  emotions TEXT[] DEFAULT '{}',
  topic TEXT,
  story TEXT,
  message TEXT,
  raw JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.video_analyses TO authenticated;
GRANT ALL ON public.video_analyses TO service_role;
ALTER TABLE public.video_analyses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own analyses" ON public.video_analyses FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- captions
CREATE TABLE public.captions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.runs ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  text TEXT NOT NULL,
  hook TEXT,
  cta TEXT,
  hashtags TEXT[] DEFAULT '{}',
  emoji_count INT DEFAULT 0,
  length INT,
  style_tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.captions TO authenticated;
GRANT ALL ON public.captions TO service_role;
ALTER TABLE public.captions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own captions" ON public.captions FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- published_posts
CREATE TABLE public.published_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.runs ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  channel_id UUID REFERENCES public.channels ON DELETE SET NULL,
  buffer_post_id TEXT,
  platform TEXT,
  permalink TEXT,
  posted_at TIMESTAMPTZ,
  raw JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.published_posts TO authenticated;
GRANT ALL ON public.published_posts TO service_role;
ALTER TABLE public.published_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own posts" ON public.published_posts FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- post_analytics
CREATE TABLE public.post_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  published_post_id UUID NOT NULL REFERENCES public.published_posts ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  views INT, likes INT, comments INT, shares INT, saves INT, reach INT, impressions INT,
  raw JSONB
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.post_analytics TO authenticated;
GRANT ALL ON public.post_analytics TO service_role;
ALTER TABLE public.post_analytics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own analytics" ON public.post_analytics FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- learning_reports
CREATE TABLE public.learning_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.runs ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  worked BOOLEAN,
  hook_verdict TEXT,
  length_verdict TEXT,
  emoji_verdict TEXT,
  hashtag_verdict TEXT,
  cta_verdict TEXT,
  cause TEXT,
  change_recommendation TEXT,
  raw JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.learning_reports TO authenticated;
GRANT ALL ON public.learning_reports TO service_role;
ALTER TABLE public.learning_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own reports" ON public.learning_reports FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- memory_insights
CREATE TABLE public.memory_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  channel_id UUID REFERENCES public.channels ON DELETE CASCADE,
  category public.insight_category NOT NULL,
  insight TEXT NOT NULL,
  confidence NUMERIC NOT NULL DEFAULT 0.5,
  support_count INT NOT NULL DEFAULT 1,
  contradiction_count INT NOT NULL DEFAULT 0,
  last_reinforced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.memory_insights TO authenticated;
GRANT ALL ON public.memory_insights TO service_role;
ALTER TABLE public.memory_insights ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own memory" ON public.memory_insights FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_memory_updated BEFORE UPDATE ON public.memory_insights FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_memory_user_active ON public.memory_insights (user_id, active, confidence DESC);

-- settings
CREATE TABLE public.settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users ON DELETE CASCADE,
  max_retries INT NOT NULL DEFAULT 3,
  retry_interval_s INT NOT NULL DEFAULT 30,
  analytics_delay_h INT NOT NULL DEFAULT 24,
  rate_limit_per_min INT NOT NULL DEFAULT 30,
  notifications JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.settings TO authenticated;
GRANT ALL ON public.settings TO service_role;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own settings" ON public.settings FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_settings_updated BEFORE UPDATE ON public.settings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- logs
CREATE TABLE public.logs (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  run_id UUID REFERENCES public.runs ON DELETE CASCADE,
  level TEXT NOT NULL DEFAULT 'info',
  module TEXT,
  message TEXT NOT NULL,
  meta JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.logs TO authenticated;
GRANT ALL ON public.logs TO service_role;
ALTER TABLE public.logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own logs" ON public.logs FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_logs_user_time ON public.logs (user_id, created_at DESC);
