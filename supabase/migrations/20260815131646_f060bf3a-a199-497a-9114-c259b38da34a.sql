CREATE OR REPLACE FUNCTION public.claim_sheet_mode_channel(_row_id uuid, _channel_target_id uuid, _now timestamptz, _stale_before timestamptz)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _ok integer;
BEGIN
  UPDATE public.sheet_mode_row_channel_status
     SET last_attempt_at = _now
   WHERE row_id = _row_id
     AND channel_target_id = _channel_target_id
     AND status = 'F'
     AND (last_attempt_at IS NULL OR last_attempt_at < _stale_before);
  GET DIAGNOSTICS _ok = ROW_COUNT;
  RETURN _ok > 0;
END $$;

REVOKE ALL ON FUNCTION public.claim_sheet_mode_channel(uuid, uuid, timestamptz, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_sheet_mode_channel(uuid, uuid, timestamptz, timestamptz) FROM anon;
REVOKE ALL ON FUNCTION public.claim_sheet_mode_channel(uuid, uuid, timestamptz, timestamptz) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claim_sheet_mode_channel(uuid, uuid, timestamptz, timestamptz) TO service_role;