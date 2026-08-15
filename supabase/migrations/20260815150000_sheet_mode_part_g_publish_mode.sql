alter table public.sheet_mode_sheets
  add column if not exists publish_mode text not null default 'shareNow'
    check (publish_mode in ('shareNow', 'addToQueue', 'customScheduled')),
  add column if not exists custom_schedule_offset_minutes integer,
  add column if not exists custom_schedule_at timestamptz;

alter table public.sheet_mode_sheets
  drop constraint if exists sheet_mode_custom_schedule_offset_check;

alter table public.sheet_mode_sheets
  add constraint sheet_mode_custom_schedule_offset_check
  check (custom_schedule_offset_minutes is null or custom_schedule_offset_minutes between 0 and 43200);

create index if not exists sheet_mode_sheets_publish_mode_idx
  on public.sheet_mode_sheets(publish_mode, is_enabled);
