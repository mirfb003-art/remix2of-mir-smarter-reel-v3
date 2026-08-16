alter table public.sheet_mode_sheets
  add column if not exists cloudinary_transform_enabled boolean not null default false,
  add column if not exists cloudinary_transform text not null default '',
  add column if not exists cloudinary_transform_mode text not null default 'replace';

alter table public.sheet_mode_sheets
  drop constraint if exists sheet_mode_sheets_cloudinary_transform_mode_check;
alter table public.sheet_mode_sheets
  add constraint sheet_mode_sheets_cloudinary_transform_mode_check
  check (cloudinary_transform_mode in ('replace', 'stack'));
