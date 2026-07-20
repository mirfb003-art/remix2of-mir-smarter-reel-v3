
CREATE OR REPLACE FUNCTION public.stamp_campaign_from_run()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.campaign_id IS NULL AND NEW.run_id IS NOT NULL THEN
    SELECT campaign_id INTO NEW.campaign_id FROM public.runs WHERE id = NEW.run_id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_stamp_camp_captions ON public.captions;
CREATE TRIGGER trg_stamp_camp_captions BEFORE INSERT ON public.captions FOR EACH ROW EXECUTE FUNCTION public.stamp_campaign_from_run();

DROP TRIGGER IF EXISTS trg_stamp_camp_video_analyses ON public.video_analyses;
CREATE TRIGGER trg_stamp_camp_video_analyses BEFORE INSERT ON public.video_analyses FOR EACH ROW EXECUTE FUNCTION public.stamp_campaign_from_run();

DROP TRIGGER IF EXISTS trg_stamp_camp_learning_reports ON public.learning_reports;
CREATE TRIGGER trg_stamp_camp_learning_reports BEFORE INSERT ON public.learning_reports FOR EACH ROW EXECUTE FUNCTION public.stamp_campaign_from_run();

DROP TRIGGER IF EXISTS trg_stamp_camp_strategies ON public.strategies;
CREATE TRIGGER trg_stamp_camp_strategies BEFORE INSERT ON public.strategies FOR EACH ROW EXECUTE FUNCTION public.stamp_campaign_from_run();

DROP TRIGGER IF EXISTS trg_stamp_camp_predictions ON public.predictions;
CREATE TRIGGER trg_stamp_camp_predictions BEFORE INSERT ON public.predictions FOR EACH ROW EXECUTE FUNCTION public.stamp_campaign_from_run();

DROP TRIGGER IF EXISTS trg_stamp_camp_published_posts ON public.published_posts;
CREATE TRIGGER trg_stamp_camp_published_posts BEFORE INSERT ON public.published_posts FOR EACH ROW EXECUTE FUNCTION public.stamp_campaign_from_run();

-- memory_insights are keyed by user_id and (optionally) run_id. When inserted with a run_id, stamp campaign_id too.
CREATE OR REPLACE FUNCTION public.stamp_memory_campaign()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.campaign_id IS NULL THEN
    SELECT r.campaign_id INTO NEW.campaign_id
    FROM public.runs r
    WHERE r.user_id = NEW.user_id AND r.status = 'analyzing'
    ORDER BY r.started_at DESC NULLS LAST LIMIT 1;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_stamp_camp_memory_insights ON public.memory_insights;
CREATE TRIGGER trg_stamp_camp_memory_insights BEFORE INSERT ON public.memory_insights FOR EACH ROW EXECUTE FUNCTION public.stamp_memory_campaign();
