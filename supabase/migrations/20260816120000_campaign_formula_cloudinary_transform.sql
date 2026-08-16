alter table public.campaigns
  add column if not exists cloudinary_transform_enabled boolean not null default false,
  add column if not exists cloudinary_transform text not null default '',
  add column if not exists cloudinary_transform_mode text not null default 'replace';

alter table public.campaigns
  drop constraint if exists campaigns_cloudinary_transform_mode_check;
alter table public.campaigns
  add constraint campaigns_cloudinary_transform_mode_check
  check (cloudinary_transform_mode in ('replace', 'stack'));

alter table public.recurring_schedules
  add column if not exists cloudinary_transform_enabled boolean not null default false,
  add column if not exists cloudinary_transform text not null default '',
  add column if not exists cloudinary_transform_mode text not null default 'replace';

alter table public.recurring_schedules
  drop constraint if exists recurring_schedules_cloudinary_transform_mode_check;
alter table public.recurring_schedules
  add constraint recurring_schedules_cloudinary_transform_mode_check
  check (cloudinary_transform_mode in ('replace', 'stack'));
