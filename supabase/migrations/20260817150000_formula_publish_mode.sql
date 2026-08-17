-- Part BB: per-schedule Buffer publish mode for 1 Reel Formula.
-- Existing schedules retain the worker's former hardcoded shareNow behavior.
alter table public.recurring_schedules
  add column if not exists publish_mode text not null default 'shareNow',
  add column if not exists custom_schedule_offset_minutes integer,
  add column if not exists custom_schedule_at timestamptz;

alter table public.recurring_schedules
  drop constraint if exists recurring_schedules_publish_mode_check;

alter table public.recurring_schedules
  add constraint recurring_schedules_publish_mode_check
  check (publish_mode in ('shareNow', 'addToQueue', 'customScheduled'));

alter table public.recurring_schedules
  drop constraint if exists recurring_schedules_custom_schedule_check;

alter table public.recurring_schedules
  add constraint recurring_schedules_custom_schedule_check
  check (
    publish_mode <> 'customScheduled'
    or custom_schedule_offset_minutes is not null
    or custom_schedule_at is not null
  );
