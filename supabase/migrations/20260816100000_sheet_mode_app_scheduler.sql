alter table public.sheet_mode_sheets
  add column if not exists scheduler_mode text not null default 'every_x_hours',
  add column if not exists scheduler_interval_hours integer not null default 0,
  add column if not exists daily_times jsonb not null default '[]'::jsonb,
  add column if not exists next_run_at timestamptz default now();

alter table public.sheet_mode_sheets
  drop constraint if exists sheet_mode_sheets_scheduler_mode_check;
alter table public.sheet_mode_sheets
  add constraint sheet_mode_sheets_scheduler_mode_check
  check (scheduler_mode in ('every_x_hours', 'daily_times', 'manual'));

alter table public.sheet_mode_sheets
  drop constraint if exists sheet_mode_sheets_scheduler_interval_hours_check;
alter table public.sheet_mode_sheets
  add constraint sheet_mode_sheets_scheduler_interval_hours_check
  check (scheduler_interval_hours >= 0);

create index if not exists sheet_mode_sheets_scheduler_due_idx
  on public.sheet_mode_sheets(is_enabled, scheduler_mode, next_run_at);

create or replace function public.claim_sheet_mode_schedule(
  _sheet_id uuid,
  _now timestamptz,
  _next_run_at timestamptz
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare claimed boolean;
begin
  update public.sheet_mode_sheets
     set next_run_at = _next_run_at, updated_at = now()
   where id = _sheet_id
     and is_enabled = true
     and scheduler_mode <> 'manual'
     and next_run_at <= _now
  returning true into claimed;
  return coalesce(claimed, false);
end;
$$;

revoke all on function public.claim_sheet_mode_schedule(uuid, timestamptz, timestamptz) from public, authenticated;
grant execute on function public.claim_sheet_mode_schedule(uuid, timestamptz, timestamptz) to service_role;
