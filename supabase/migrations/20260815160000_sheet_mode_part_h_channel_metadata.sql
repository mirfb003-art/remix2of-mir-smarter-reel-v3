alter table public.sheet_mode_channel_targets
  add column if not exists customization jsonb not null default '{}'::jsonb;

alter table public.sheet_mode_channel_targets
  drop constraint if exists sheet_mode_channel_targets_customization_object_check;

alter table public.sheet_mode_channel_targets
  add constraint sheet_mode_channel_targets_customization_object_check
  check (jsonb_typeof(customization) = 'object');
