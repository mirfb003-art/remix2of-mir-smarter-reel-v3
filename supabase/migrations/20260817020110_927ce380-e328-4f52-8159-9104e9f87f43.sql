REVOKE ALL ON FUNCTION public.claim_multi_channel_queue_item(uuid, uuid) FROM anon, PUBLIC;
REVOKE ALL ON FUNCTION public.claim_multi_channel_schedule(uuid, timestamptz, timestamptz) FROM anon, PUBLIC;
REVOKE ALL ON FUNCTION public.claim_recurring_schedule_slot(uuid, text, uuid, timestamptz) FROM anon, authenticated, PUBLIC;

GRANT EXECUTE ON FUNCTION public.claim_multi_channel_queue_item(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_multi_channel_schedule(uuid, timestamptz, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_recurring_schedule_slot(uuid, text, uuid, timestamptz) TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.recurring_schedule_items TO authenticated;
GRANT ALL ON public.recurring_schedule_items TO service_role;