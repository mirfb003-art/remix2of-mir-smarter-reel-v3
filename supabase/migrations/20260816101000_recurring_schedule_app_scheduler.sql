alter table public.recurring_schedules
  alter column next_run_at drop not null;

alter table public.recurring_schedules
  add column if not exists scheduler_mode text not null default 'every_x_hours',
  add column if not exists daily_times jsonb not null default '[]'::jsonb;

alter table public.recurring_schedules
  drop constraint if exists recurring_schedules_scheduler_mode_check;
alter table public.recurring_schedules
  add constraint recurring_schedules_scheduler_mode_check
  check (scheduler_mode in ('every_x_hours', 'daily_times', 'manual'));

create index if not exists recurring_schedules_scheduler_due_idx
  on public.recurring_schedules(is_active, scheduler_mode, next_run_at);
