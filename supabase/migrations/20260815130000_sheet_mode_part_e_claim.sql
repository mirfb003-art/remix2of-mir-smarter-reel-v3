-- Sheet Mode Part E: atomic per-row/channel publish claim.
-- The worker calls this through supabaseAdmin; authenticated users never call it directly.
create or replace function public.claim_sheet_mode_channel(
  _row_id uuid,
  _channel_target_id uuid,
  _now timestamptz,
  _stale_before timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed boolean;
begin
  update public.sheet_mode_row_channel_status s
     set last_attempt_at = _now,
         last_error = null
   where s.row_id = _row_id
     and s.channel_target_id = _channel_target_id
     and s.status = 'F'
     and (s.last_error is not null or s.last_attempt_at is null or s.last_attempt_at <= _stale_before)
     and exists (
       select 1
       from public.sheet_mode_rows r
       join public.sheet_mode_channel_targets t on t.id = s.channel_target_id
       where r.id = s.row_id
         and r.sheet_id = t.sheet_id
         and t.is_active = true
     )
  returning true into claimed;
  return coalesce(claimed, false);
end;
$$;

revoke all on function public.claim_sheet_mode_channel(uuid, uuid, timestamptz, timestamptz) from public, authenticated;
grant execute on function public.claim_sheet_mode_channel(uuid, uuid, timestamptz, timestamptz) to service_role;
