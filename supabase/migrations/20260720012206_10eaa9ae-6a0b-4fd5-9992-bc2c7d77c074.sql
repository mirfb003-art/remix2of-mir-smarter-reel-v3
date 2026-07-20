
-- === strategies ===
CREATE TABLE public.strategies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  run_id UUID REFERENCES public.runs(id) ON DELETE CASCADE,
  hook_style TEXT,
  caption_length TEXT,
  cta_type TEXT,
  emoji_level TEXT,
  storytelling BOOLEAN DEFAULT false,
  education_level TEXT,
  hashtag_count INT DEFAULT 0,
  tone TEXT,
  posting_time_hint TEXT,
  reasoning TEXT,
  memory_refs UUID[] DEFAULT '{}',
  objective TEXT,
  raw JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.strategies TO authenticated;
GRANT ALL ON public.strategies TO service_role;
ALTER TABLE public.strategies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own strategies" ON public.strategies FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_strategies_run ON public.strategies(run_id);
CREATE INDEX idx_strategies_user ON public.strategies(user_id, created_at DESC);

-- === predictions ===
CREATE TABLE public.predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  run_id UUID REFERENCES public.runs(id) ON DELETE CASCADE,
  predicted_views INT,
  predicted_likes INT,
  predicted_comments INT,
  predicted_shares INT,
  predicted_saves INT,
  predicted_reach INT,
  confidence NUMERIC(4,3),
  rationale TEXT,
  -- Filled in when analytics land:
  actual_views INT,
  actual_likes INT,
  actual_comments INT,
  actual_shares INT,
  actual_saves INT,
  actual_reach INT,
  accuracy_score NUMERIC(4,3),
  evaluated_at TIMESTAMPTZ,
  raw JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.predictions TO authenticated;
GRANT ALL ON public.predictions TO service_role;
ALTER TABLE public.predictions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own predictions" ON public.predictions FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_predictions_run ON public.predictions(run_id);
CREATE INDEX idx_predictions_user_pending ON public.predictions(user_id) WHERE evaluated_at IS NULL;

-- === insight_trends ===
CREATE TABLE public.insight_trends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  dimension TEXT NOT NULL,     -- e.g. "hook_style"
  value TEXT NOT NULL,         -- e.g. "question"
  metric TEXT NOT NULL,        -- e.g. "comments"
  lift_pct NUMERIC(6,2),       -- +18.5 means +18.5% vs baseline
  sample_size INT DEFAULT 0,
  baseline NUMERIC(12,2),
  observed NUMERIC(12,2),
  confidence NUMERIC(4,3),
  human_summary TEXT,          -- "Questions increased comments by 18%"
  last_computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, dimension, value, metric)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.insight_trends TO authenticated;
GRANT ALL ON public.insight_trends TO service_role;
ALTER TABLE public.insight_trends ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own trends" ON public.insight_trends FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_trends_user ON public.insight_trends(user_id, dimension, metric);

-- === Extend memory_insights ===
ALTER TABLE public.memory_insights
  ADD COLUMN IF NOT EXISTS platform TEXT,
  ADD COLUMN IF NOT EXISTS applicable_topics TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS last_success_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS supporting_run_ids UUID[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS contradiction_count INT DEFAULT 0;

-- === Extend learning_reports ===
ALTER TABLE public.learning_reports
  ADD COLUMN IF NOT EXISTS time_of_day_verdict TEXT,
  ADD COLUMN IF NOT EXISTS objective_score NUMERIC(6,3),
  ADD COLUMN IF NOT EXISTS prediction_delta JSONB;

-- === Extend runs ===
ALTER TABLE public.runs
  ADD COLUMN IF NOT EXISTS strategy_id UUID REFERENCES public.strategies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS prediction_id UUID REFERENCES public.predictions(id) ON DELETE SET NULL;
