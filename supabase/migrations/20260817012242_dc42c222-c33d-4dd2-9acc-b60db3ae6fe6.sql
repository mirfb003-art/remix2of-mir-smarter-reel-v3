-- Part: rotation cursor by item id
alter table public.recurring_schedules
  add column if not exists last_published_item_id uuid;

update public.recurring_schedules s
set last_published_item_id = (
  select i.id
  from public.recurring_schedule_items i
  where i.schedule_id = s.id
    and i.position = case
      when s.current_item_position > 1 then s.current_item_position - 1
      else (select max(i2.position) from public.recurring_schedule_items i2 where i2.schedule_id = s.id)
    end
  limit 1
)
where s.mode = 'multiple'
  and s.last_run_at is not null
  and s.current_item_position is not null
  and s.last_published_item_id is null;

alter table public.recurring_schedules
  drop constraint if exists recurring_schedules_last_published_item_fk;
alter table public.recurring_schedules
  add constraint recurring_schedules_last_published_item_fk
  foreign key (last_published_item_id)
  references public.recurring_schedule_items(id)
  on delete set null;

alter table public.recurring_schedules
  drop column if exists current_item_position;

-- Part R: sheet mode app scheduler
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

revoke all on function public.claim_sheet_mode_schedule(uuid, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.claim_sheet_mode_schedule(uuid, timestamptz, timestamptz) to service_role;

-- Part S: recurring schedules app scheduler
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

-- Parts T/V: sheet mode cloudinary transform
alter table public.sheet_mode_sheets
  add column if not exists cloudinary_transform_enabled boolean not null default false,
  add column if not exists cloudinary_transform text not null default '',
  add column if not exists cloudinary_transform_mode text not null default 'replace';

alter table public.sheet_mode_sheets
  drop constraint if exists sheet_mode_sheets_cloudinary_transform_mode_check;
alter table public.sheet_mode_sheets
  add constraint sheet_mode_sheets_cloudinary_transform_mode_check
  check (cloudinary_transform_mode in ('replace', 'stack'));

-- Parts U/W: campaign + formula cloudinary transform
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

-- Part Z: content gallery
create table if not exists public.content_gallery_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  url text not null,
  label text,
  media_type text not null check (media_type in ('image','video')),
  created_at timestamptz not null default now()
);

create index if not exists content_gallery_items_user_created_idx
  on public.content_gallery_items(user_id, created_at desc);

grant select, insert, update, delete on table public.content_gallery_items to authenticated;
grant all on table public.content_gallery_items to service_role;

alter table public.content_gallery_items enable row level security;

drop policy if exists content_gallery_items_select_own on public.content_gallery_items;
create policy content_gallery_items_select_own on public.content_gallery_items
  for select to authenticated using (user_id = auth.uid());

drop policy if exists content_gallery_items_insert_own on public.content_gallery_items;
create policy content_gallery_items_insert_own on public.content_gallery_items
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists content_gallery_items_update_own on public.content_gallery_items;
create policy content_gallery_items_update_own on public.content_gallery_items
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists content_gallery_items_delete_own on public.content_gallery_items;
create policy content_gallery_items_delete_own on public.content_gallery_items
  for delete to authenticated using (user_id = auth.uid());