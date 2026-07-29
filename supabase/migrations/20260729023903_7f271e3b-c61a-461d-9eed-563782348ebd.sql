GRANT EXECUTE ON FUNCTION public.try_claim_channel_lock(uuid, uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.release_channel_lock(uuid, uuid) TO authenticated;