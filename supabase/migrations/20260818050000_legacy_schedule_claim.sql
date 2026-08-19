-- Part GG: atomically claim and advance one legacy Loop Learner schedule.
-- The public tick worker is the only caller and runs with service_role.
create or replace function public.claim_schedule_slot(
  _schedule_id uuid,
  _now timestamptz,
  _next_run_at timestamptz
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare claimed boolean;
begin
  update public.schedules
     set next_run_at = _next_run_at,
         last_run_at = _now,
         updated_at = _now
   where id = _schedule_id
     and active = true
     and paused = false
     and next_run_at <= _now
  returning true into claimed;
  return coalesce(claimed, false);
end;
$$;

revoke all on function public.claim_schedule_slot(uuid, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.claim_schedule_slot(uuid, timestamptz, timestamptz) to service_role;
