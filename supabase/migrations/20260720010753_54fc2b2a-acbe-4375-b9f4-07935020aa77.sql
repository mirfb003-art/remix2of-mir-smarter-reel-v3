
REVOKE ALL ON FUNCTION public.try_claim_channel_lock(uuid,uuid,int) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_channel_lock(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.try_claim_channel_lock(uuid,uuid,int) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_channel_lock(uuid,uuid) TO service_role;
